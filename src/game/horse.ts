import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

function material(color: THREE.ColorRepresentation, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness, flatShading: true })
}

function part(geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function paintLegGradient(geometry: THREE.BufferGeometry, coat: THREE.Color, socks: THREE.Color) {
  geometry.computeBoundingBox()
  const bbox = geometry.boundingBox!
  const minY = bbox.min.y
  const span = Math.max(0.0001, bbox.max.y - minY)
  const position = geometry.attributes.position
  const colors = new Float32Array(position.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < position.count; i++) {
    const t = (position.getY(i) - minY) / span
    const mix = 1 - THREE.MathUtils.smoothstep(t, 0.08, 0.34)
    c.copy(coat).lerp(socks, mix)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

export function createHuman(mounted: boolean) {
  const group = new THREE.Group()
  const coat = material('#2f4a3f')
  const coatLight = material('#4d6e5c')
  const scarf = material('#9a4b32')
  const trousers = material('#362f2a')
  const leather = material('#4a2d20')
  const glove = material('#3a2419')
  const skin = material('#c08f6a')
  const hat = material('#3a2c22')
  const base = mounted ? 0 : 0.88

  // Torso: wider chest tapering to waist, plus a belt and a short flared
  // cape skirt so the silhouette doesn't read as a thin stick figure.
  group.add(part(new THREE.CylinderGeometry(0.3, 0.37, 0.62, 8), coat, 0, base + 0.46, 0))
  group.add(part(new THREE.CylinderGeometry(0.38, 0.33, 0.1, 8), leather, 0, base + 0.165, 0))
  group.add(part(new THREE.CylinderGeometry(0.33, 0.49, 0.22, 9), coat, 0, base + 0.06, 0))
  group.add(part(new THREE.CylinderGeometry(0.33, 0.3, 0.17, 8), coatLight, 0, base + 0.8, 0))
  group.add(part(new THREE.TorusGeometry(0.31, 0.055, 6, 10), scarf, 0, base + 0.82, 0.02))

  // Head + hat
  group.add(part(new THREE.SphereGeometry(0.235, 12, 9), skin, 0, base + 1.06, 0.015))
  group.add(part(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 14), hat, 0, base + 1.25, 0))
  group.add(part(new THREE.CylinderGeometry(0.21, 0.24, 0.23, 10), hat, 0, base + 1.36, 0))
  group.add(part(new THREE.BoxGeometry(0.37, 0.06, 0.04), leather, 0, base + 1.29, 0.2))

  for (const side of [-1, 1]) {
    const shoulder = part(new THREE.SphereGeometry(0.135, 8, 6), coat, side * 0.37, base + 0.73, mounted ? 0.1 : 0)
    group.add(shoulder)
    const arm = part(new THREE.CylinderGeometry(0.115, 0.095, 0.6, 8), coat, side * 0.4, base + 0.42, mounted ? 0.18 : 0)
    arm.rotation.z = side * (mounted ? 0.46 : 0.14)
    arm.rotation.x = mounted ? -0.6 : 0
    group.add(arm)
    group.add(part(new THREE.SphereGeometry(0.1, 8, 6), glove, side * (mounted ? 0.5 : 0.39), base + (mounted ? 0.2 : 0.09), mounted ? 0.44 : 0))
    const leg = part(new THREE.CylinderGeometry(0.155, 0.125, mounted ? 0.8 : 0.86, 8), trousers, side * (mounted ? 0.4 : 0.16), mounted ? -0.24 : 0.43, mounted ? 0.03 : 0)
    leg.rotation.z = side * (mounted ? 0.5 : 0.03)
    leg.rotation.x = mounted ? -0.2 : 0
    group.add(leg)
    const boot = part(new THREE.BoxGeometry(0.22, 0.3, 0.38), leather, side * (mounted ? 0.6 : 0.16), mounted ? -0.66 : 0.11, mounted ? 0.14 : 0.09)
    boot.rotation.z = side * (mounted ? 0.27 : 0)
    group.add(boot)
  }
  return group
}

export class Horse {
  readonly root = new THREE.Group()
  readonly visual = new THREE.Group()
  rider = createHuman(true)
  private mixer?: THREE.AnimationMixer
  private action?: THREE.AnimationAction
  private model?: THREE.Group
  private elapsed = 0

  async load() {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/Horse.glb`)
    this.model = gltf.scene
    const box = new THREE.Box3().setFromObject(this.model)
    const size = box.getSize(new THREE.Vector3())
    const scale = 2.15 / size.y
    this.model.scale.setScalar(scale)
    this.model.position.y = -box.min.y * scale
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.frustumCulled = false
        const old = child.material as THREE.MeshStandardMaterial
        paintLegGradient(child.geometry, new THREE.Color('#90603a'), new THREE.Color('#1d130b'))
        child.material = new THREE.MeshStandardMaterial({
          color: '#ffffff',
          vertexColors: true,
          roughness: 0.82,
          metalness: 0,
          flatShading: false,
          map: old.map ?? null,
        })
      }
    })
    this.visual.add(this.model)
    const saddle = new THREE.Group()
    saddle.add(part(new THREE.BoxGeometry(0.6, 0.12, 0.92), material('#3d251c'), 0, 1.22, -0.08))
    const blanket = part(new THREE.BoxGeometry(0.72, 0.07, 1.06), material('#8e3f32'), 0, 1.15, -0.08)
    saddle.add(blanket)
    this.visual.add(saddle)
    this.rider.position.set(0, 1.38, -0.02)
    this.rider.scale.setScalar(0.88)
    this.visual.add(this.rider)
    this.root.add(this.visual)
    if (gltf.animations.length) {
      this.mixer = new THREE.AnimationMixer(this.model)
      this.action = this.mixer.clipAction(gltf.animations[0])
      this.action.play()
    }
  }

  setMounted(mounted: boolean) {
    this.rider.visible = mounted
  }

  update(dt: number, speed: number) {
    this.elapsed += dt
    const absolute = Math.abs(speed)
    const idle = absolute < 0.12
    if (this.action) {
      this.action.paused = false
      this.action.timeScale = idle ? 0.16 : THREE.MathUtils.clamp(absolute / 5.5, 0.35, 2.2)
    }
    this.mixer?.update(dt)
    this.visual.position.y = idle ? Math.sin(this.elapsed * 1.4) * 0.012 : 0
  }
}
