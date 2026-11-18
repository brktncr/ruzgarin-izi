import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js'
import { GameAudio } from './audio'
import { clampNeeds, countCompleted, EMPTY_TASKS, INITIAL_SNAPSHOT, LANDMARKS, WORLD_RADIUS } from './config'
import { createHuman, Horse } from './horse'
import type { Landmark, Quality, Snapshot } from './types'
import { World } from './world'

interface SavedState {
  version: 1
  day: number
  bond: number
  muted: boolean
  quality: Quality
}

const STORAGE_KEY = 'ruzgarin-izi-v1'
const inputCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space'])

export class GameEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(54, 1, 0.1, 1200)
  private world = new World()
  private horse = new Horse()
  private human = createHuman(false)
  private audio = new GameAudio()
  private onSnapshot: (snapshot: Snapshot) => void
  private state: Snapshot = { ...INITIAL_SNAPSHOT, needs: { ...INITIAL_SNAPSHOT.needs }, tasks: { ...EMPTY_TASKS } }
  private keys = new Set<string>()
  private horsePosition = new THREE.Vector3(0, 0, 13)
  private humanPosition = new THREE.Vector3(2, 0, 13)
  private horseHeading = Math.PI
  private humanHeading = Math.PI
  private speed = 0
  private vertical = 0
  private verticalVelocity = 0
  private called = false
  private nearest?: Landmark
  private frame = 0
  private lastTime = 0
  private accumulator = 0
  private elapsed = 0
  private orbitYaw = 0
  private orbitPitch = 0
  private cameraDistance = 8.5
  private dragging = false
  private pointerX = 0
  private pointerY = 0
  private snapshotTimer = 0
  private fpsTimer = 0
  private fpsFrames = 0
  private captureMode = false
  private captureRendered = false
  private disposed = false
  private cameraTarget = new THREE.Vector3()
  private cameraDesired = new THREE.Vector3()
  private moveVector = new THREE.Vector3()
  private canvas: HTMLCanvasElement
  private composer: EffectComposer
  private bloomPass: UnrealBloomPass

  constructor(canvas: HTMLCanvasElement, onSnapshot: (snapshot: Snapshot) => void) {
    this.canvas = canvas
    this.onSnapshot = onSnapshot
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.22
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.55, 0.86)
    this.composer.addPass(this.bloomPass)
    const vignette = new ShaderPass(VignetteShader)
    vignette.uniforms.darkness.value = 1.15
    vignette.uniforms.offset.value = 1.05
    this.composer.addPass(vignette)
    this.composer.addPass(new OutputPass())
    this.loadSaved()
  }

  private loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as SavedState
        if (saved.version === 1) {
          this.state.day = Math.max(1, Math.min(999, Math.floor(saved.day) || 1))
          this.state.bond = Math.max(0, Math.min(100, saved.bond || 0))
          this.state.muted = Boolean(saved.muted)
          this.state.quality = saved.quality === 'low' ? 'low' : 'high'
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
    this.audio.setMuted(this.state.muted)
  }

  private save() {
    try {
      const saved: SavedState = { version: 1, day: this.state.day, bond: this.state.bond, muted: this.state.muted, quality: this.state.quality }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      // The game remains fully playable when browser storage is unavailable.
    }
  }

  async init() {
    this.captureMode = new URLSearchParams(location.search).get('capture') === '1'
    this.setQuality(this.state.quality)
    this.resize()
    await this.world.build(this.scene)
    this.world.setQuality(this.state.quality === 'low' || window.innerWidth < 700 ? 'low' : 'high')
    await this.horse.load()
    this.scene.add(this.horse.root, this.human)
    this.horsePosition.y = this.world.heightAt(this.horsePosition.x, this.horsePosition.z)
    this.humanPosition.copy(this.horsePosition)
    this.horse.root.position.copy(this.horsePosition)
    this.horse.root.rotation.y = this.horseHeading
    this.human.visible = false
    this.human.position.copy(this.humanPosition)
    this.camera.position.set(14, 10, 24)
    this.camera.lookAt(0, 4, 0)
    this.bindEvents()
    this.world.setRaining(false)
    this.state.x = this.horsePosition.x
    this.state.z = this.horsePosition.z
    this.emit()
    if (this.captureMode) {
      this.state.phase = 'playing'
      this.emit()
    }
    this.frame = requestAnimationFrame(this.animate)
    ;(window as unknown as { __GAME_READY__: boolean }).__GAME_READY__ = true
    ;(window as unknown as { __seek: (time: number) => void }).__seek = (time: number) => {
      this.elapsed = time
      this.state.time = 16.3 + time * 0.012
      this.world.updateEnvironment(this.state.time, this.elapsed, this.state.raining, this.activePosition(), 0)
      this.renderer.render(this.scene, this.camera)
    }
    ;(window as unknown as { __gameProbe: () => unknown }).__gameProbe = () => ({
      x: this.activePosition().x,
      z: this.activePosition().z,
      heading: this.state.mounted ? this.horseHeading : this.humanHeading,
      mounted: this.state.mounted,
      phase: this.state.phase,
      speed: this.speed,
      time: this.state.time,
      needs: { ...this.state.needs },
      bond: this.state.bond,
      tasks: { ...this.state.tasks },
      fps: this.state.fps,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    })
  }

  private bindEvents() {
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.onKeyDown, { passive: false })
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
  }

  private onVisibility = () => {
    if (document.hidden && this.state.phase === 'playing') this.pause()
    this.save()
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (inputCodes.has(event.code)) event.preventDefault()
    if (event.repeat && ['KeyE', 'KeyR', 'KeyH', 'KeyM', 'Escape'].includes(event.code)) return
    if (this.state.phase === 'title' && (event.code === 'Space' || event.code === 'Enter')) {
      this.start()
      return
    }
    if (this.state.phase === 'summary' && event.code === 'Enter') {
      this.nextDay()
      return
    }
    if (event.code === 'Escape') {
      if (this.state.phase === 'playing') this.pause()
      else if (this.state.phase === 'paused') this.resume()
      return
    }
    if (event.code === 'KeyM') {
      this.setMuted(!this.state.muted)
      return
    }
    if (this.state.phase !== 'playing') return
    if (event.code === 'KeyE') this.interact()
    else if (event.code === 'KeyR') this.toggleMount()
    else if (event.code === 'KeyH') this.whistle()
    else if (inputCodes.has(event.code)) this.keys.add(event.code)
  }

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code)
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.state.phase !== 'playing') return
    this.dragging = true
    this.pointerX = event.clientX
    this.pointerY = event.clientY
    this.canvas.setPointerCapture?.(event.pointerId)
  }

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragging) return
    const dx = event.clientX - this.pointerX
    const dy = event.clientY - this.pointerY
    this.pointerX = event.clientX
    this.pointerY = event.clientY
    this.orbitYaw -= dx * 0.005
    this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.012, -0.6, 3.2)
  }

  private onPointerUp = () => {
    this.dragging = false
  }

  private onWheel = (event: WheelEvent) => {
    if (this.state.phase !== 'playing') return
    event.preventDefault()
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + event.deltaY * 0.008, 4.5, 13)
  }

  private resize = () => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.composer.setSize(width, height)
  }

  private animate = (timestamp: number) => {
    if (this.disposed) return
    if (this.captureMode && this.captureRendered) return
    const dt = Math.min(0.05, this.lastTime ? (timestamp - this.lastTime) / 1000 : 1 / 60)
    this.lastTime = timestamp
    this.fpsFrames++
    this.fpsTimer += dt
    if (this.fpsTimer >= 1) {
      this.state.fps = Math.round(this.fpsFrames / this.fpsTimer)
      this.fpsFrames = 0
      this.fpsTimer = 0
    }
    if (this.state.phase === 'playing') {
      this.accumulator = Math.min(this.accumulator + dt, 0.15)
      while (this.accumulator >= 1 / 60) {
        this.simulate(1 / 60)
        this.accumulator -= 1 / 60
      }
    } else if (this.state.phase === 'title') {
      this.elapsed += dt
      this.horse.update(dt, 0)
    }
    this.updateCamera(dt)
    this.world.updateEnvironment(this.state.time, this.elapsed, this.state.raining, this.activePosition(), this.state.phase === 'playing' ? dt : 0)
    this.composer.render()
    this.snapshotTimer += dt
    if (this.snapshotTimer > 0.12) {
      this.snapshotTimer = 0
      this.emit()
    }
    ;(window as unknown as { __SCENE_READY__: boolean }).__SCENE_READY__ = true
    this.captureRendered = true
    if (!this.captureMode) this.frame = requestAnimationFrame(this.animate)
  }

  private activePosition() {
    return this.state.mounted ? this.horsePosition : this.humanPosition
  }

  private simulate(dt: number) {
    this.elapsed += dt
    if (this.state.autoCycle) {
      this.state.time += dt * 0.012
      if (this.state.time >= 22) {
        this.endDay('Akşam çöktü. Orman, bir sonraki güne hazır.')
        return
      }
    }
    const forward = this.keys.has('KeyW')
    const back = this.keys.has('KeyS')
    const left = this.keys.has('KeyA')
    const right = this.keys.has('KeyD')
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    if (this.state.mounted) {
      const energyFactor = 0.45 + (this.state.needs.energy / 100) * 0.55
      const maxSpeed = (sprint ? 12.5 : 8) * energyFactor
      if (forward) this.speed = Math.min(maxSpeed, this.speed + 7 * dt)
      else if (back) this.speed = Math.max(-2.2, this.speed - 11 * dt)
      else this.speed *= Math.max(0, 1 - dt * 1.25)
      const turnAmount = (0.35 + Math.min(1, Math.abs(this.speed) / 3)) * 1.55 * dt
      if (left) this.horseHeading += turnAmount
      if (right) this.horseHeading -= turnAmount
      if (this.keys.has('Space') && this.vertical === 0 && Math.abs(this.speed) > 2 && this.state.needs.energy > 8) {
        this.verticalVelocity = 4.4
        this.state.needs.energy -= 4
        this.keys.delete('Space')
      }
      this.moveVector.set(Math.sin(this.horseHeading), 0, Math.cos(this.horseHeading))
      this.horsePosition.addScaledVector(this.moveVector, this.speed * dt)
      this.resolveCollision(this.horsePosition, 0.8)
      const inLake = Math.hypot(this.horsePosition.x - 46, this.horsePosition.z + 35) < 15
      if (inLake) {
        this.speed = THREE.MathUtils.clamp(this.speed, -1, 2.1)
        this.state.needs.thirst += dt * 0.8
      }
      const effort = Math.abs(this.speed)
      this.state.needs.energy -= dt * (0.025 + effort * 0.007 + (sprint ? 0.045 : 0))
      this.state.needs.hunger -= dt * 0.006
      this.state.needs.thirst -= dt * (0.009 + effort * 0.002)
      this.state.needs.care -= dt * 0.003
      this.verticalVelocity -= 10.5 * dt
      this.vertical = Math.max(0, this.vertical + this.verticalVelocity * dt)
      if (this.vertical === 0) this.verticalVelocity = 0
      this.horsePosition.y = this.world.heightAt(this.horsePosition.x, this.horsePosition.z)
      this.horse.root.position.set(this.horsePosition.x, this.horsePosition.y + this.vertical, this.horsePosition.z)
      this.horse.root.rotation.y = this.horseHeading
      this.horse.update(dt, this.speed)
    } else {
      const walkSpeed = sprint ? 6 : 3.8
      const direction = forward ? 1 : back ? -1 : 0
      const turnAmount = 2.15 * dt
      if (left) this.humanHeading += turnAmount
      if (right) this.humanHeading -= turnAmount
      this.moveVector.set(Math.sin(this.humanHeading), 0, Math.cos(this.humanHeading))
      this.humanPosition.addScaledVector(this.moveVector, direction * walkSpeed * dt)
      this.resolveCollision(this.humanPosition, 0.45)
      this.humanPosition.y = this.world.heightAt(this.humanPosition.x, this.humanPosition.z)
      this.human.position.copy(this.humanPosition)
      this.human.rotation.y = this.humanHeading
      this.speed = direction * walkSpeed
      this.horse.update(dt, this.called ? 3 : 0)
      if (this.called) {
        const delta = this.moveVector.copy(this.humanPosition).sub(this.horsePosition)
        delta.y = 0
        const distance = delta.length()
        if (distance > 3) {
          const targetHeading = Math.atan2(delta.x, delta.z)
          this.horseHeading = this.approachAngle(this.horseHeading, targetHeading, dt * 2.8)
          this.horsePosition.addScaledVector(delta.normalize(), Math.min(3.2 * dt, distance - 2.8))
          this.resolveCollision(this.horsePosition, 0.8)
          this.horsePosition.y = this.world.heightAt(this.horsePosition.x, this.horsePosition.z)
        } else this.called = false
        this.horse.root.position.copy(this.horsePosition)
        this.horse.root.rotation.y = this.horseHeading
      }
      this.state.needs.hunger -= dt * 0.003
      this.state.needs.thirst -= dt * 0.005
    }
    clampNeeds(this.state.needs)
    if (Object.values(this.state.needs).every((value) => value > 60)) this.state.bond = Math.min(100, this.state.bond + dt * 0.012)
    this.updateNearest()
    for (const [id, marker] of this.world.markers) {
      const completed = id in this.state.tasks && this.state.tasks[id as keyof typeof this.state.tasks]
      marker.visible = !completed || id === 'note' || id === 'campfire' || id === 'trough'
    }
    this.audio.update(this.speed, this.state.mounted, true)
  }

  private approachAngle(current: number, target: number, amount: number) {
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
    return current + THREE.MathUtils.clamp(delta, -amount, amount)
  }

  private resolveCollision(position: THREE.Vector3, radius: number) {
    const distance = Math.hypot(position.x, position.z)
    if (distance > WORLD_RADIUS) {
      position.x *= WORLD_RADIUS / distance
      position.z *= WORLD_RADIUS / distance
      this.speed *= 0.3
    }
    for (const obstacle of this.world.obstacles) {
      const dx = position.x - obstacle.x
      const dz = position.z - obstacle.z
      const minDistance = obstacle.r + radius
      const squared = dx * dx + dz * dz
      if (squared < minDistance * minDistance && squared > 0.00001) {
        const length = Math.sqrt(squared)
        position.x = obstacle.x + (dx / length) * minDistance
        position.z = obstacle.z + (dz / length) * minDistance
        this.speed *= 0.72
      }
    }
  }

  private updateCamera(dt: number) {
    if (this.state.phase === 'title') {
      const angle = this.elapsed * 0.035 + 0.65
      this.cameraDesired.set(Math.sin(angle) * 28, this.world.heightAt(0, 0) + 12, Math.cos(angle) * 28)
      this.camera.position.lerp(this.cameraDesired, Math.min(1, dt * 1.5))
      this.camera.lookAt(0, this.world.heightAt(0, 0) + 3.4, 0)
      return
    }
    const active = this.activePosition()
    const heading = this.state.mounted ? this.horseHeading : this.humanHeading
    const yaw = heading + this.orbitYaw
    const distance = this.state.mounted ? this.cameraDistance : Math.min(7, this.cameraDistance)
    const height = this.state.mounted ? 4.6 : 2.8
    const arcOffset = this.state.mounted ? 0.56 : 0
    const camYaw = yaw + arcOffset
    this.cameraTarget.set(active.x + Math.sin(yaw) * 0.6, active.y + (this.state.mounted ? 1.25 : 1.25), active.z + Math.cos(yaw) * 0.6)
    this.cameraDesired.set(
      active.x - Math.sin(camYaw) * distance,
      active.y + height + this.orbitPitch,
      active.z - Math.cos(camYaw) * distance,
    )
    this.cameraDesired.y = Math.max(this.cameraDesired.y, this.world.heightAt(this.cameraDesired.x, this.cameraDesired.z) + 0.65)
    for (const obstacle of this.world.obstacles) {
      const dx = this.cameraDesired.x - obstacle.x
      const dz = this.cameraDesired.z - obstacle.z
      const minDistance = obstacle.r + 0.4
      const length = Math.hypot(dx, dz)
      if (length < minDistance && length > 0.001) {
        this.cameraDesired.x = obstacle.x + (dx / length) * minDistance
        this.cameraDesired.z = obstacle.z + (dz / length) * minDistance
      }
    }
    this.camera.position.lerp(this.cameraDesired, Math.min(1, dt * 6))
    this.camera.lookAt(this.cameraTarget)
  }

  private updateNearest() {
    const position = this.activePosition()
    let closest: Landmark | undefined
    let closestDistance = Infinity
    for (const landmark of LANDMARKS) {
      const distance = Math.hypot(position.x - landmark.x, position.z - landmark.z)
      if (distance < landmark.radius && distance < closestDistance) {
        closest = landmark
        closestDistance = distance
      }
    }
    this.nearest = closest
    if (!closest) this.state.prompt = ''
    else if (closest.id === 'brushed' && this.state.mounted) this.state.prompt = 'R ile in · Atını taramak için yanında ol'
    else this.state.prompt = `E · ${closest.name}`
  }

  start = () => {
    if (this.state.phase !== 'title') return
    void this.audio.init().then(() => {
      this.audio.setMuted(this.state.muted)
      this.audio.chime('discover')
    })
    this.state.phase = 'playing'
    this.state.summaryReason = ''
    this.notify('Rüzgâr hazır. İlk durak: kulübenin önündeki not.')
  }

  pause = () => {
    if (this.state.phase !== 'playing') return
    this.state.phase = 'paused'
    this.keys.clear()
    this.save()
    this.emit()
  }

  resume = () => {
    if (this.state.phase !== 'paused') return
    this.state.phase = 'playing'
    void this.audio.init()
    this.emit()
  }

  private endDay(reason: string) {
    this.state.phase = 'summary'
    this.state.summaryReason = reason
    this.speed = 0
    this.keys.clear()
    this.save()
    this.audio.chime('discover')
    this.emit()
  }

  nextDay = () => {
    if (this.state.phase !== 'summary') return
    this.state.day++
    this.state.time = 7.5
    this.state.tasks = { ...EMPTY_TASKS }
    this.state.needs.energy = 100
    this.state.needs.hunger = Math.max(55, this.state.needs.hunger)
    this.state.needs.thirst = Math.max(60, this.state.needs.thirst)
    this.state.phase = 'playing'
    this.horsePosition.set(0, this.world.heightAt(0, 13), 13)
    this.humanPosition.set(2, this.world.heightAt(2, 13), 13)
    this.horseHeading = Math.PI
    this.humanHeading = Math.PI
    this.state.mounted = true
    this.horse.setMounted(true)
    this.human.visible = false
    this.called = false
    this.vertical = 0
    this.speed = 0
    this.notify(`${this.state.day}. gün başladı. Orman seni bekliyor.`)
  }

  restart = () => {
    this.state.day = 1
    this.state.bond = 12
    this.state.time = 16.3
    this.state.tasks = { ...EMPTY_TASKS }
    this.state.needs = { energy: 92, hunger: 78, thirst: 74, care: 68 }
    this.state.phase = 'playing'
    this.state.mounted = true
    this.horse.setMounted(true)
    this.human.visible = false
    this.horsePosition.set(0, this.world.heightAt(0, 13), 13)
    this.horseHeading = Math.PI
    this.speed = 0
    this.vertical = 0
    this.save()
    this.notify('Yeni bir yolculuk başladı.')
  }

  interact = () => {
    if (this.state.phase !== 'playing' || !this.nearest) return
    const id = this.nearest.id
    if (id === 'campfire') {
      this.endDay('Ateşin yanında dinlendin. Günün anıları kaydedildi.')
      return
    }
    if (id === 'brushed' && this.state.mounted) {
      this.notify('Tarama için önce R ile atından in.')
      return
    }
    if (id === 'fed') {
      this.state.needs.hunger = 100
      this.completeTask('fed', 'Atın karnını doyurdu. Bağlılık arttı.', 5, 'care')
    } else if (id === 'trough') {
      this.state.needs.thirst = 100
      this.completeTask('watered', 'Atın serinledi ve su ihtiyacı giderildi.', 4, 'care')
    } else if (id === 'brushed') {
      this.state.needs.care = 100
      this.state.needs.energy = Math.min(100, this.state.needs.energy + 8)
      this.completeTask('brushed', 'Tüyleri parladı. Atın kendini iyi hissediyor.', 8, 'care')
    } else if (id === 'lake') {
      this.state.needs.thirst = Math.min(100, this.state.needs.thirst + 35)
      this.completeTask('lake', 'Ayna Gölü keşfedildi. Su ve sessizlik…', 6, 'discover')
    } else if (id === 'tower') {
      this.completeTask('tower', 'Gözcü Kulesi keşfedildi. Vadi ayaklarının altında.', 6, 'discover')
    } else if (id === 'meadow') {
      this.completeTask('meadow', 'Çiçekli Çayır keşfedildi. Yeni bir favori rota.', 6, 'discover')
    } else if (id === 'note') {
      this.completeTask('note', 'Notta yazıyor: “İyi bir yolculuk, iyi bir bakımla başlar.”', 3, 'ui')
    }
    this.save()
  }

  private completeTask(id: keyof typeof EMPTY_TASKS, message: string, bond: number, sound: 'care' | 'discover' | 'ui') {
    if (!this.state.tasks[id]) {
      this.state.tasks[id] = true
      this.state.bond = Math.min(100, this.state.bond + bond)
      this.audio.chime(sound)
      this.notify(message)
    } else {
      this.audio.chime('care')
      this.notify(id === 'note' ? 'Not: “Atını dinle; o da seni dinleyecek.”' : 'Burası için bugünlük her şey tamam.')
    }
  }

  toggleMount = () => {
    if (this.state.phase !== 'playing') return
    if (this.state.mounted) {
      this.state.mounted = false
      this.speed = 0
      this.horse.setMounted(false)
      this.human.visible = true
      this.humanPosition.set(
        this.horsePosition.x + Math.cos(this.horseHeading) * 1.8,
        0,
        this.horsePosition.z - Math.sin(this.horseHeading) * 1.8,
      )
      this.resolveCollision(this.humanPosition, 0.45)
      this.humanPosition.y = this.world.heightAt(this.humanPosition.x, this.humanPosition.z)
      this.human.position.copy(this.humanPosition)
      this.humanHeading = this.horseHeading
      this.notify('Yürüyüş modu. R ile tekrar bin, H ile atını çağır.')
    } else {
      if (this.humanPosition.distanceTo(this.horsePosition) > 3.8) {
        this.notify('Atından uzaktasın. H ile onu yanına çağırabilirsin.')
        return
      }
      this.state.mounted = true
      this.horse.setMounted(true)
      this.human.visible = false
      this.horseHeading = this.humanHeading
      this.notify('Yeniden eyerde. W ile ilerle, Shift ile dörtnala kalk.')
    }
    this.emit()
  }

  whistle = () => {
    if (this.state.phase !== 'playing') return
    if (this.state.mounted) {
      this.notify('Rüzgâr kişnemenle yanıt veriyor.')
      this.audio.chime('ui')
    } else {
      this.called = true
      this.notify('Atın sesine geliyor…')
    }
  }

  setKey = (code: string, down: boolean) => {
    if (down) this.keys.add(code)
    else this.keys.delete(code)
  }

  setMuted = (muted: boolean) => {
    this.state.muted = muted
    this.audio.setMuted(muted)
    this.save()
    this.emit()
  }

  setRain = (raining: boolean) => {
    this.state.raining = raining
    this.world.setRaining(raining)
    this.audio.setRaining(raining)
    this.emit()
  }

  setAutoCycle = (auto: boolean) => {
    this.state.autoCycle = auto
    this.emit()
  }

  setTime = (time: number) => {
    this.state.time = THREE.MathUtils.clamp(time, 0, 23.99)
    this.emit()
  }

  setQuality = (quality: Quality) => {
    this.state.quality = quality
    const low = quality === 'low' || window.innerWidth < 700
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1.25 : 1.8))
    this.composer.setSize(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight)
    this.bloomPass.strength = low ? 0.18 : 0.3
    this.world.setQuality(low ? 'low' : 'high')
    this.save()
    this.emit()
  }

  private notify(message: string) {
    this.state.toast = message
    this.state.toastId++
    this.emit()
  }

  private emit() {
    this.state.speed = this.speed
    this.state.gait = !this.state.mounted ? 'Yürüyüş' : Math.abs(this.speed) < 0.2 ? 'Sakin' : Math.abs(this.speed) < 3 ? 'Adım' : Math.abs(this.speed) < 7 ? 'Tırıs' : Math.abs(this.speed) < 10 ? 'Kantır' : 'Dörtnal'
    this.state.completed = countCompleted(this.state.tasks)
    const active = this.activePosition()
    this.state.x = active.x
    this.state.z = active.z
    this.state.heading = this.state.mounted ? this.horseHeading : this.humanHeading
    this.onSnapshot({
      ...this.state,
      needs: { ...this.state.needs },
      tasks: { ...this.state.tasks },
    })
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.save()
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.audio.dispose()
    this.renderer.dispose()
  }
}
