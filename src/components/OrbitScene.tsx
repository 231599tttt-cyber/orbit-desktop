import { Html, Sparkles, Stars } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import * as THREE from 'three'
import { useI18n } from '../i18n'
import type { OrbitApp } from '../types'
import type { BackgroundEffects, MotionLevel, PerformanceMode } from '../types/settings'
import { ApplicationIcon } from './UnknownAppIcon'

type OrbitSceneProps = {
  apps: OrbitApp[]
  selectedId: string
  resetSignal: number
  onSelect: (app: OrbitApp) => void
  onFocusComplete: (id: string) => void
  active?: boolean
  rotationSensitivity?: number
  inertiaStrength?: number
  zoomSpeed?: number
  fpsLimit?: number
  performanceMode?: PerformanceMode
  particles?: boolean
  backgroundEffects?: BackgroundEffects
  motionLevel?: MotionLevel
}

type OrbitPosition = {
  id: string
  radius: number
  position: [number, number, number]
}

type InteractionState = {
  dragging: boolean
  pointerId: number | null
  lastX: number
  lastY: number
  lastTime: number
  pendingX: number
  pendingY: number
  pitchVelocity: number
  yawVelocity: number
  wheelDelta: number
  moved: boolean
  suppressClickUntil: number
  cancelFocusSerial: number
  rotationSensitivity: number
  inertiaStrength: number
  zoomSpeed: number
  focusActive: boolean
  lastActivity: number
}

type FocusTarget = {
  id: string | null
  quaternion: THREE.Quaternion
}

const DEFAULT_CAMERA_DISTANCE = 10.4
const MIN_CAMERA_DISTANCE = 7.2
const MAX_CAMERA_DISTANCE = 14.2
const DRAG_SENSITIVITY = 0.0042
const MAX_ANGULAR_VELOCITY = 3.4
const FRONT_DIRECTION = new THREE.Vector3(0, 0, 1)
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)

const sceneContainerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  cursor: 'grab',
  touchAction: 'none',
  userSelect: 'none',
}

/**
 * A deterministic Fibonacci sphere keeps the layout stable when the scene rerenders,
 * while a small radius variation makes the apps feel like satellites instead of a grid.
 */
function createOrbitPositions(apps: OrbitApp[]): OrbitPosition[] {
  if (!apps.length) return []

  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  return apps.map((app, index) => {
    const sample = (index + 0.5) / apps.length
    const y = 1 - sample * 2
    const horizontalRadius = Math.sqrt(Math.max(0, 1 - y * y))
    const angle = index * goldenAngle + Math.PI * 0.18
    const satelliteRadius = 2.76 + ((index * 37) % 7) * 0.075

    return {
      id: app.id,
      radius: satelliteRadius,
      position: [
        Math.cos(angle) * horizontalRadius * satelliteRadius,
        y * satelliteRadius,
        Math.sin(angle) * horizontalRadius * satelliteRadius,
      ],
    }
  })
}

function clampVelocity(value: number) {
  return THREE.MathUtils.clamp(value, -MAX_ANGULAR_VELOCITY, MAX_ANGULAR_VELOCITY)
}

function OrbitControls({
  groupRef,
  positions,
  selectedId,
  focusSignal,
  resetSignal,
  interactionRef,
  onFocusComplete,
}: {
  groupRef: RefObject<THREE.Group | null>
  positions: OrbitPosition[]
  selectedId: string
  focusSignal: number
  resetSignal: number
  interactionRef: RefObject<InteractionState>
  onFocusComplete: (id: string) => void
}) {
  const { camera } = useThree()
  const targetRef = useRef<FocusTarget | null>(null)
  const targetCameraDistance = useRef(DEFAULT_CAMERA_DISTANCE)
  const previousResetSignal = useRef(resetSignal)
  const seenCancelSerial = useRef(interactionRef.current.cancelFocusSerial)
  const focusCompleteRef = useRef(onFocusComplete)
  const pitchQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const yawQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const correctionQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const currentDirection = useMemo(() => new THREE.Vector3(), [])
  const desiredQuaternion = useMemo(() => new THREE.Quaternion(), [])

  useEffect(() => {
    focusCompleteRef.current = onFocusComplete
  }, [onFocusComplete])

  useEffect(() => {
    const group = groupRef.current
    const orbitPosition = positions.find((item) => item.id === selectedId)
    if (!group || !orbitPosition) return

    currentDirection
      .set(...orbitPosition.position)
      .normalize()
      .applyQuaternion(group.quaternion)
      .normalize()

    correctionQuaternion.setFromUnitVectors(currentDirection, FRONT_DIRECTION)
    desiredQuaternion.copy(group.quaternion).premultiply(correctionQuaternion).normalize()
    targetRef.current = {
      id: selectedId,
      quaternion: desiredQuaternion.clone(),
    }

    const interaction = interactionRef.current
    interaction.focusActive = true
    interaction.lastActivity = performance.now()
    interaction.pitchVelocity = 0
    interaction.yawVelocity = 0
  }, [
    correctionQuaternion,
    currentDirection,
    desiredQuaternion,
    focusSignal,
    groupRef,
    interactionRef,
    positions,
    selectedId,
  ])

  useEffect(() => {
    if (previousResetSignal.current === resetSignal) return
    previousResetSignal.current = resetSignal
    targetRef.current = { id: null, quaternion: new THREE.Quaternion() }
    targetCameraDistance.current = DEFAULT_CAMERA_DISTANCE

    const interaction = interactionRef.current
    interaction.pitchVelocity = 0
    interaction.yawVelocity = 0
    interaction.focusActive = true
    interaction.lastActivity = performance.now()
  }, [interactionRef, resetSignal])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    const interaction = interactionRef.current

    if (seenCancelSerial.current !== interaction.cancelFocusSerial) {
      seenCancelSerial.current = interaction.cancelFocusSerial
      targetRef.current = null
    }

    if (interaction.wheelDelta !== 0) {
      targetCameraDistance.current = THREE.MathUtils.clamp(
        targetCameraDistance.current + interaction.wheelDelta * 0.0065 * interaction.zoomSpeed,
        MIN_CAMERA_DISTANCE,
        MAX_CAMERA_DISTANCE,
      )
      interaction.wheelDelta = 0
    }

    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      targetCameraDistance.current,
      9,
      delta,
    )

    // Consume movement even when pointer-up landed between two frames, so a quick
    // flick never loses its final pixels and the inertia starts without a hitch.
    if (interaction.pendingX !== 0 || interaction.pendingY !== 0) {
      const sensitivity = DRAG_SENSITIVITY * interaction.rotationSensitivity
      pitchQuaternion.setFromAxisAngle(X_AXIS, interaction.pendingY * sensitivity)
      yawQuaternion.setFromAxisAngle(Y_AXIS, interaction.pendingX * sensitivity)
      group.quaternion.premultiply(yawQuaternion).premultiply(pitchQuaternion).normalize()
      interaction.pendingX = 0
      interaction.pendingY = 0
    }

    if (interaction.dragging) {
      return
    }

    const target = targetRef.current
    if (target) {
      const angle = group.quaternion.angleTo(target.quaternion)
      if (angle < 0.0035) {
        group.quaternion.copy(target.quaternion)
        targetRef.current = null
        interaction.focusActive = false
        interaction.lastActivity = performance.now()
        if (target.id) focusCompleteRef.current(target.id)
      } else {
        group.quaternion.slerp(target.quaternion, 1 - Math.exp(-6.5 * delta)).normalize()
      }
      return
    }

    if (Math.abs(interaction.pitchVelocity) > 0.0005 || Math.abs(interaction.yawVelocity) > 0.0005) {
      pitchQuaternion.setFromAxisAngle(X_AXIS, interaction.pitchVelocity * delta)
      yawQuaternion.setFromAxisAngle(Y_AXIS, interaction.yawVelocity * delta)
      group.quaternion.premultiply(yawQuaternion).premultiply(pitchQuaternion).normalize()

      const friction = THREE.MathUtils.lerp(8.5, 1.35, interaction.inertiaStrength)
      const damping = Math.exp(-friction * delta)
      interaction.pitchVelocity *= damping
      interaction.yawVelocity *= damping
    } else {
      interaction.pitchVelocity = 0
      interaction.yawVelocity = 0
    }
  })

  return null
}

const OrbitNode = memo(function OrbitNode({
  app,
  orbitPosition,
  groupRef,
  selected,
  interactionRef,
  onChoose,
}: {
  app: OrbitApp
  orbitPosition: OrbitPosition
  groupRef: RefObject<THREE.Group | null>
  selected: boolean
  interactionRef: RefObject<InteractionState>
  onChoose: (app: OrbitApp) => void
}) {
  const [hovered, setHovered] = useState(false)
  const visualRef = useRef<HTMLButtonElement>(null)
  const nodeRef = useRef<THREE.Group>(null)
  const worldPosition = useMemo(() => new THREE.Vector3(), [])
  const cameraDirection = useMemo(() => new THREE.Vector3(), [])
  const smoothedDepth = useRef(0.7)
  const Icon = app.icon
  const { t } = useI18n()

  useFrame(({ camera }, delta) => {
    const visual = visualRef.current
    const group = groupRef.current
    const node = nodeRef.current
    if (!visual || !group || !node) return

    worldPosition.set(...orbitPosition.position).applyQuaternion(group.quaternion)
    node.position.copy(worldPosition)
    cameraDirection.copy(camera.position).normalize()
    const signedDepth = THREE.MathUtils.clamp(
      worldPosition.dot(cameraDirection) / orbitPosition.radius,
      -1,
      1,
    )
    const depth = (signedDepth + 1) * 0.5
    smoothedDepth.current = THREE.MathUtils.damp(smoothedDepth.current, depth, 12, delta)

    const depthScale = THREE.MathUtils.lerp(0.72, 1.12, smoothedDepth.current)
    const emphasis = selected ? 1.2 : hovered ? 1.1 : 1
    const opacity = THREE.MathUtils.lerp(0.28, 1, smoothedDepth.current)
    const brightness = THREE.MathUtils.lerp(0.38, 1.08, smoothedDepth.current)
    const saturation = THREE.MathUtils.lerp(0.52, 1.08, smoothedDepth.current)

    visual.style.transform = `scale(${(depthScale * emphasis).toFixed(3)})`
    visual.style.opacity = opacity.toFixed(3)
    visual.style.filter = `brightness(${brightness.toFixed(3)}) saturate(${saturation.toFixed(3)})`
    visual.style.zIndex = String(Math.round(10 + smoothedDepth.current * 90))
  })

  const choose = useCallback(() => {
    if (performance.now() < interactionRef.current.suppressClickUntil) return
    onChoose(app)
  }, [app, interactionRef, onChoose])

  const glow = selected
    ? `0 0 0 2px ${app.color}cc, 0 0 20px ${app.color}cc, 0 0 50px ${app.color}66`
    : hovered
      ? `0 0 0 1px ${app.color}a8, 0 0 22px ${app.color}80`
      : `0 0 0 1px ${app.color}45, 0 7px 22px rgba(0, 0, 0, .45)`

  return (
    <group ref={nodeRef} position={orbitPosition.position}>
      <Html
        center
        transform
        sprite
        distanceFactor={4.35}
        zIndexRange={[100, 10]}
      >
        <button
        ref={visualRef}
        type="button"
        aria-label={t('appManager.launchLabel', { name: app.name })}
        title={app.name}
        onClick={(event) => {
          event.stopPropagation()
          choose()
        }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          display: 'flex',
          width: 72,
          minHeight: 92,
          padding: '8px 5px 5px',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 7,
          border: 0,
          outline: 0,
          background: 'transparent',
          color: '#eef8ff',
          font: 'inherit',
          cursor: 'pointer',
          transformOrigin: '50% 50%',
          transition: 'filter 140ms ease, opacity 140ms ease',
          willChange: 'transform, opacity, filter',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'relative',
            display: 'grid',
            width: 53,
            height: 53,
            placeItems: 'center',
            overflow: 'hidden',
            border: `1px solid ${app.color}66`,
            borderRadius: app.isSystemApp ? 14 : 17,
            background: 'rgba(8, 17, 34, .94)',
            boxShadow: glow,
            transition: 'box-shadow 180ms ease, border-color 180ms ease',
          }}
        >
          {app.iconDataUrl ? (
            <img
              src={app.iconDataUrl}
              alt=""
              draggable={false}
              style={{ width: 38, height: 38, objectFit: 'contain' }}
            />
          ) : Icon ? (
            <Icon size={36} color={app.color} />
          ) : (
            <ApplicationIcon size={38} />
          )}
          {selected && (
            <span
              style={{
                position: 'absolute',
                inset: 3,
                border: `1px solid ${app.color}8c`,
                borderRadius: 'inherit',
                pointerEvents: 'none',
              }}
            />
          )}
        </span>
        <span
          style={{
            display: 'block',
            width: 106,
            overflow: 'hidden',
            color: selected ? '#ffffff' : '#dce8f4',
            fontSize: 11,
            fontWeight: selected ? 650 : 480,
            lineHeight: 1.2,
            letterSpacing: '.01em',
            textAlign: 'center',
            textOverflow: 'ellipsis',
            textShadow: selected
              ? `0 0 11px ${app.color}, 0 2px 5px #000`
              : '0 2px 6px #000, 0 0 8px #000',
            whiteSpace: 'nowrap',
          }}
        >
          {app.name}
        </span>
        </button>
      </Html>
    </group>
  )
})

function OrbitalStructure() {
  return (
    <>
      <mesh renderOrder={-2}>
        <sphereGeometry args={[3.16, 36, 24]} />
        <meshPhysicalMaterial
          color="#07152a"
          emissive="#062444"
          emissiveIntensity={0.24}
          metalness={0.38}
          roughness={0.42}
          transparent
          opacity={0.13}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh renderOrder={-1}>
        <sphereGeometry args={[3.2, 28, 18]} />
        <meshBasicMaterial
          color="#2b8fff"
          wireframe
          transparent
          opacity={0.055}
          depthWrite={false}
        />
      </mesh>

      <mesh rotation={[Math.PI / 2.25, 0.12, 0.26]}>
        <torusGeometry args={[3.42, 0.011, 8, 128]} />
        <meshBasicMaterial color="#2d91ff" transparent opacity={0.48} depthWrite={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2.85, -0.52, 0.74]}>
        <torusGeometry args={[2.64, 0.007, 8, 112]} />
        <meshBasicMaterial color="#5ccfff" transparent opacity={0.27} depthWrite={false} />
      </mesh>
      <mesh rotation={[Math.PI / 1.8, 0.72, -0.36]}>
        <torusGeometry args={[3.02, 0.006, 8, 112]} />
        <meshBasicMaterial color="#726cff" transparent opacity={0.21} depthWrite={false} />
      </mesh>

      <mesh>
        <sphereGeometry args={[0.39, 28, 28]} />
        <meshStandardMaterial
          color="#27bfff"
          emissive="#008dff"
          emissiveIntensity={2.25}
          metalness={0.22}
          roughness={0.18}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.58, 24, 24]} />
        <meshBasicMaterial
          color="#38b8ff"
          transparent
          opacity={0.09}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
      <pointLight color="#38baff" intensity={7} distance={6.4} decay={2} />
    </>
  )
}

function FrameDriver({
  active,
  fpsLimit,
  interactionRef,
  particles,
}: {
  active: boolean
  fpsLimit: number
  interactionRef: RefObject<InteractionState>
  particles: boolean
}) {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    if (!active) return
    let animationFrame = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const interaction = interactionRef.current
      const moving = interaction.dragging
        || interaction.focusActive
        || Math.abs(interaction.pitchVelocity) > 0.0005
        || Math.abs(interaction.yawVelocity) > 0.0005
        || now - interaction.lastActivity < 1800
      const currentFps = moving ? fpsLimit : particles ? Math.min(12, fpsLimit) : Math.min(4, fpsLimit)
      const frameDuration = 1000 / Math.max(1, currentFps)
      if (now - previous >= frameDuration - 0.5) {
        previous = now
        invalidate()
      }
      animationFrame = requestAnimationFrame(tick)
    }
    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [active, fpsLimit, interactionRef, invalidate, particles])

  return null
}

function SceneContent({
  apps,
  selectedId,
  resetSignal,
  focusSignal,
  positions,
  interactionRef,
  onChoose,
  onFocusComplete,
  active = true,
  fpsLimit = 60,
  particles = true,
  backgroundEffects = 'subtle',
}: OrbitSceneProps & {
  positions: OrbitPosition[]
  focusSignal: number
  interactionRef: RefObject<InteractionState>
  onChoose: (app: OrbitApp) => void
}) {
  const groupRef = useRef<THREE.Group>(null)

  return (
    <>
      <FrameDriver active={active} fpsLimit={fpsLimit} interactionRef={interactionRef} particles={particles} />
      <ambientLight intensity={0.46} color="#8fcfff" />
      <directionalLight position={[4, 7, 8]} intensity={1.15} color="#b8dcff" />
      {particles && backgroundEffects !== 'off' && (
        <Stars radius={36} depth={22} count={backgroundEffects === 'full' ? 620 : 260} factor={2.2} saturation={0.28} fade speed={0.08} />
      )}
      {particles && backgroundEffects === 'full' && (
        <Sparkles count={42} scale={[9, 7, 7]} size={1.05} speed={0.12} opacity={0.3} color="#68baff" />
      )}

      <group ref={groupRef}>
        <OrbitalStructure />
      </group>

      {apps.map((app, index) => (
        <OrbitNode
          key={app.id}
          app={app}
          orbitPosition={positions[index]}
          groupRef={groupRef}
          selected={app.id === selectedId}
          interactionRef={interactionRef}
          onChoose={onChoose}
        />
      ))}

      <OrbitControls
        groupRef={groupRef}
        positions={positions}
        selectedId={selectedId}
        focusSignal={focusSignal}
        resetSignal={resetSignal}
        interactionRef={interactionRef}
        onFocusComplete={onFocusComplete}
      />
    </>
  )
}

export function OrbitScene({
  apps,
  selectedId,
  resetSignal,
  onSelect,
  onFocusComplete,
  active = true,
  rotationSensitivity = 1,
  inertiaStrength = 0.88,
  zoomSpeed = 1,
  fpsLimit = 60,
  performanceMode = 'balanced',
  particles = true,
  backgroundEffects = 'subtle',
  motionLevel = 'full',
}: OrbitSceneProps) {
  const [focusSignal, setFocusSignal] = useState(0)
  const positions = useMemo(() => createOrbitPositions(apps), [apps])
  const interactionRef = useRef<InteractionState>({
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    pendingX: 0,
    pendingY: 0,
    pitchVelocity: 0,
    yawVelocity: 0,
    wheelDelta: 0,
    moved: false,
    suppressClickUntil: 0,
    cancelFocusSerial: 0,
    rotationSensitivity,
    inertiaStrength,
    zoomSpeed,
    focusActive: false,
    lastActivity: performance.now(),
  })

  interactionRef.current.rotationSensitivity = rotationSensitivity
  interactionRef.current.inertiaStrength = motionLevel === 'off' ? 0 : inertiaStrength
  interactionRef.current.zoomSpeed = zoomSpeed

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current
    if (!interaction.dragging || interaction.pointerId !== event.pointerId) return

    const now = performance.now()
    const timeSinceLastMovement = Math.max(0, now - interaction.lastTime)
    const releaseDecay = Math.exp(-timeSinceLastMovement / 72)
    interaction.pitchVelocity *= releaseDecay
    interaction.yawVelocity *= releaseDecay
    interaction.dragging = false
    interaction.pointerId = null

    if (interaction.moved) interaction.suppressClickUntil = now + 110
    interaction.moved = false
    event.currentTarget.style.cursor = 'grab'

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const interaction = interactionRef.current
    interaction.dragging = true
    interaction.pointerId = event.pointerId
    interaction.lastX = event.clientX
    interaction.lastY = event.clientY
    interaction.lastTime = performance.now()
    interaction.pendingX = 0
    interaction.pendingY = 0
    interaction.pitchVelocity = 0
    interaction.yawVelocity = 0
    interaction.moved = false
    interaction.lastActivity = performance.now()
    event.currentTarget.style.cursor = 'grabbing'
  }, [])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current
    if (!interaction.dragging || interaction.pointerId !== event.pointerId) return

    const now = performance.now()
    const deltaX = event.clientX - interaction.lastX
    const deltaY = event.clientY - interaction.lastY
    const elapsed = THREE.MathUtils.clamp((now - interaction.lastTime) / 1000, 1 / 240, 0.05)

    interaction.pendingX += deltaX
    interaction.pendingY += deltaY
    const sensitivity = DRAG_SENSITIVITY * interaction.rotationSensitivity
    interaction.yawVelocity = THREE.MathUtils.lerp(
      interaction.yawVelocity,
      clampVelocity((deltaX * sensitivity) / elapsed),
      0.44,
    )
    interaction.pitchVelocity = THREE.MathUtils.lerp(
      interaction.pitchVelocity,
      clampVelocity((deltaY * sensitivity) / elapsed),
      0.44,
    )
    const wasMoved = interaction.moved
    interaction.moved ||= Math.abs(deltaX) + Math.abs(deltaY) > 1.5
    if (!wasMoved && interaction.moved) {
      interaction.cancelFocusSerial += 1
      interaction.focusActive = false
    }
    // Capture only after this has become a drag. Capturing on pointer-down would
    // retarget a normal pointer-up to the scene and swallow the app button click.
    if (interaction.moved && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    interaction.lastX = event.clientX
    interaction.lastY = event.clientY
    interaction.lastTime = now
    interaction.lastActivity = now
  }, [])

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1
    interactionRef.current.wheelDelta += event.deltaY * unit
    interactionRef.current.lastActivity = performance.now()
  }, [])

  const handleChoose = useCallback((app: OrbitApp) => {
    setFocusSignal((value) => value + 1)
    onSelect(app)
  }, [onSelect])

  return (
    <div
      className="orbit-scene"
      style={sceneContainerStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onWheel={handleWheel}
    >
      <Canvas
        dpr={performanceMode === 'performance' ? 1 : performanceMode === 'quality' ? [1, 1.8] : [1, 1.4]}
        frameloop="demand"
        camera={{
          position: [0, 0, DEFAULT_CAMERA_DISTANCE],
          fov: 42,
          near: 0.1,
          far: 80,
        }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#02060d', 0)
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
      >
        <SceneContent
          apps={apps}
          selectedId={selectedId}
          resetSignal={resetSignal}
          focusSignal={focusSignal}
          positions={positions}
          interactionRef={interactionRef}
          onChoose={handleChoose}
          onSelect={onSelect}
          onFocusComplete={onFocusComplete}
          active={active}
          fpsLimit={motionLevel === 'off' ? Math.min(30, fpsLimit) : fpsLimit}
          performanceMode={performanceMode}
          particles={performanceMode === 'performance' ? false : particles}
          backgroundEffects={backgroundEffects}
          motionLevel={motionLevel}
        />
      </Canvas>
    </div>
  )
}
