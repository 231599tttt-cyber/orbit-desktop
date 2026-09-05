import { useEffect, useId, useState } from 'react'

type UnknownAppIconProps = {
  className?: string
  size?: number
  title?: string
}
type ApplicationIconProps = UnknownAppIconProps & {
  alt?: string
  src?: string | null
}

/**
 * A deliberately neutral fallback. It never implies that an application has a
 * known brand when Windows could not provide a usable icon.
 */
export function UnknownAppIcon({ className, size = 32, title }: UnknownAppIconProps) {
  const titleId = useId()

  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      className={className}
      fill="none"
      height={size}
      role={title ? 'img' : undefined}
      viewBox="0 0 48 48"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <rect x="5.5" y="5.5" width="37" height="37" rx="10.5" fill="currentColor" fillOpacity=".1" stroke="currentColor" strokeOpacity=".55" />
      <path d="M17 17.5A3.5 3.5 0 0 1 20.5 14h7a3.5 3.5 0 0 1 3.5 3.5v13a3.5 3.5 0 0 1-3.5 3.5h-7a3.5 3.5 0 0 1-3.5-3.5v-13Z" stroke="currentColor" strokeWidth="2" />
      <path d="M21.3 21.4c.25-1.7 1.34-2.55 3.26-2.55 1.98 0 3.14 1.04 3.14 2.65 0 1.12-.54 1.84-1.82 2.6-1.36.8-1.77 1.34-1.77 2.45v.34" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <circle cx="24.1" cy="30.15" r="1.15" fill="currentColor" />
    </svg>
  )
}

/** Displays an extracted application icon and falls back consistently on errors. */
export function ApplicationIcon({ alt = '', className, size = 32, src, title }: ApplicationIconProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return <UnknownAppIcon className={className} size={size} title={title} />
  }

  return (
    <img
      alt={alt}
      className={className}
      draggable={false}
      height={size}
      onError={() => setFailed(true)}
      src={src}
      width={size}
    />
  )
}
