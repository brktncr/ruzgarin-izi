import type { Landmark, Needs, Snapshot, Tasks } from './types'

export const WORLD_RADIUS = 172
export const LAKE = { x: 46, z: -35, radius: 17 }
export const EMPTY_TASKS: Tasks = {
  note: false,
  fed: false,
  watered: false,
  brushed: false,
  lake: false,
  tower: false,
  meadow: false,
}

export const LANDMARKS: Landmark[] = [
  { id: 'note', name: 'Kulübedeki not', x: -2.5, z: 6.5, radius: 4.5, kind: 'rest' },
  { id: 'fed', name: 'Yemlik · Atı besle', x: 17, z: 9, radius: 4.5, kind: 'care' },
  { id: 'trough', name: 'Yalak · Su ver', x: 10.5, z: 11.5, radius: 4, kind: 'care' },
  { id: 'brushed', name: 'Bakım yeri · Atı tara', x: 20, z: 5.5, radius: 4, kind: 'care' },
  { id: 'campfire', name: 'Ateş çevresi · Günü bitir', x: -9, z: 10, radius: 4, kind: 'rest' },
  { id: 'lake', name: 'Ayna Gölü', x: 34, z: -30, radius: 7, kind: 'discover' },
  { id: 'tower', name: 'Gözcü Kulesi', x: -42, z: -35, radius: 7, kind: 'discover' },
  { id: 'meadow', name: 'Çiçekli Çayır', x: 55, z: 45, radius: 8, kind: 'discover' },
]

export const INITIAL_SNAPSHOT: Snapshot = {
  phase: 'title',
  day: 1,
  time: 16.3,
  speed: 0,
  gait: 'Sakin',
  mounted: true,
  needs: { energy: 92, hunger: 78, thirst: 74, care: 68 },
  bond: 12,
  tasks: { ...EMPTY_TASKS },
  completed: 0,
  prompt: '',
  toast: '',
  toastId: 0,
  muted: false,
  raining: false,
  autoCycle: true,
  quality: 'high',
  x: 0,
  z: 13,
  heading: Math.PI,
  fps: 60,
  summaryReason: '',
}

export function clampNeeds(needs: Needs) {
  for (const key of Object.keys(needs) as (keyof Needs)[]) {
    needs[key] = Math.max(0, Math.min(100, needs[key]))
  }
}

export function countCompleted(tasks: Tasks) {
  return Object.values(tasks).filter(Boolean).length
}

export function formatTime(time: number) {
  const hour = Math.floor(time) % 24
  const minute = Math.floor((time - Math.floor(time)) * 60)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
