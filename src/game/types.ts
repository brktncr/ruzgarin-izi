export type GamePhase = 'title' | 'playing' | 'paused' | 'summary'
export type Quality = 'high' | 'low'

export interface Needs {
  energy: number
  hunger: number
  thirst: number
  care: number
}

export interface Tasks {
  note: boolean
  fed: boolean
  watered: boolean
  brushed: boolean
  lake: boolean
  tower: boolean
  meadow: boolean
}

export interface Landmark {
  id: keyof Tasks | 'trough' | 'campfire'
  name: string
  x: number
  z: number
  radius: number
  kind: 'care' | 'discover' | 'rest'
}

export interface Snapshot {
  phase: GamePhase
  day: number
  time: number
  speed: number
  gait: string
  mounted: boolean
  needs: Needs
  bond: number
  tasks: Tasks
  completed: number
  prompt: string
  toast: string
  toastId: number
  muted: boolean
  raining: boolean
  autoCycle: boolean
  quality: Quality
  x: number
  z: number
  heading: number
  fps: number
  summaryReason: string
}

export interface GameBridge {
  snapshot: Snapshot
  start: () => void
  pause: () => void
  resume: () => void
  nextDay: () => void
  restart: () => void
  interact: () => void
  toggleMount: () => void
  whistle: () => void
  setKey: (code: string, down: boolean) => void
  setMuted: (muted: boolean) => void
  setRain: (rain: boolean) => void
  setAutoCycle: (auto: boolean) => void
  setTime: (time: number) => void
  setQuality: (quality: Quality) => void
}
