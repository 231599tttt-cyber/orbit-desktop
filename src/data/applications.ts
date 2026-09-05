import type { OrbitApp } from '../types'
import {
  SiDiscord,
  SiDocker,
  SiFigma,
  SiGooglechrome,
  SiNotion,
  SiObsidian,
  SiSpotify,
  SiSteam,
} from 'react-icons/si'
import { VscCode } from 'react-icons/vsc'
import { FaFolderOpen, FaMicrosoft, FaSlack, FaWindows } from 'react-icons/fa6'
import { RiWechat2Fill } from 'react-icons/ri'

/**
 * Development-only fixtures for working on the 3D layout without platform APIs.
 * Keep the collection private so importing this module alone can never inject
 * synthetic applications into the production library or a real scan result.
 */
const developerDemoApplications: ReadonlyArray<OrbitApp> = [
  { id: 'demo-chrome', name: 'Google Chrome', category: 'Browser', color: '#ffbf39', icon: SiGooglechrome, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-edge', name: 'Microsoft Edge', category: 'Browser', color: '#39c8ff', icon: FaMicrosoft, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-vscode', name: 'Visual Studio Code', category: 'Developer', color: '#4db7ff', icon: VscCode, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-steam', name: 'Steam', category: 'Games', color: '#8ab9ff', icon: SiSteam, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-explorer', name: 'File Explorer', category: 'System', color: '#ffcf56', icon: FaFolderOpen, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-spotify', name: 'Spotify', category: 'Music', color: '#47e27b', icon: SiSpotify, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-notion', name: 'Notion', category: 'Productivity', color: '#f4f5f8', icon: SiNotion, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-discord', name: 'Discord', category: 'Social', color: '#8e98ff', icon: SiDiscord, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-wechat', name: 'WeChat', category: 'Social', color: '#63df82', icon: RiWechat2Fill, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-figma', name: 'Figma', category: 'Design', color: '#f1757b', icon: SiFigma, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-docker', name: 'Docker Desktop', category: 'Developer', color: '#54b6ff', icon: SiDocker, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-obsidian', name: 'Obsidian', category: 'Notes', color: '#aa90ff', icon: SiObsidian, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-slack', name: 'Slack', category: 'Collaboration', color: '#fb7ca9', icon: FaSlack, kind: 'developer-demo', source: 'developer-demo', launchable: false },
  { id: 'demo-windows', name: 'Windows Settings', category: 'System', color: '#47adff', icon: FaWindows, kind: 'developer-demo', source: 'developer-demo', launchable: false },
]

export const DEVELOPER_DEMO_MODE_KEY = 'orbit.desktop.developerDemoMode'

export function isDeveloperDemoModeEnabled(): boolean {
  return Boolean(import.meta.env.DEV)
    && typeof window !== 'undefined'
    && window.localStorage.getItem(DEVELOPER_DEMO_MODE_KEY) === 'true'
}

/**
 * The only public access point for demo fixtures. It returns an empty list in
 * production builds and until a developer explicitly enables the local flag.
 */
export function getDeveloperDemoApplications(): OrbitApp[] {
  if (!isDeveloperDemoModeEnabled()) return []
  return developerDemoApplications.map((application) => ({ ...application }))
}
