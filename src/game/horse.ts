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

export function createHuman(mounted: boolean) {
  const group = new THREE.Group()
  const coat = material('#314b45')
  const coatLight = material('#49685b')
  const trousers = material('#34312e')
  const leather = material('#4a2d20')
  const skin = material('#b98562')
  const hat = material('#372b23')
  const base = mounted ? 0 : 0.88
  group.add(part(new THREE.CylinderGeometry(0.25, 0.32, 0.72, 7), coat, 0, base + 0.42, 0))
  group.add(part(new THREE.CylinderGeometry(0.29, 0.25, 0.2, 7), coatLight, 0, base + 0.78, 0))
  group.add(part(new THREE.SphereGeometry(0.22, 10, 7), skin, 0, base + 1.03, 0.015))
  group.add(part(new THREE.CylinderGeometry(0.34, 0.34, 0.055, 12), hat, 0, base + 1.21, 0))
  group.add(part(new THREE.CylinderGeometry(0.2, 0.23, 0.22, 9), hat, 0, base + 1.31, 0))
  group.add(part(new THREE.BoxGeometry(0.35, 0.06, 0.035), leather, 0, base + 1.25, 0.19))
  for (const side of [-1, 1]) {
    const arm = part(new THREE.CylinderGeometry(0.075, 0.065, 0.67, 7), coat, side * 0.33, base + 0.42, mounted ? 0.18 : 0)
    arm.rotation.z = side * (mounted ? 0.48 : 0.12)
    arm.rotation.x = mounted ? -0.65 : 0
    group.add(arm)
    group.add(part(new THREE.SphereGeometry(0.075, 7, 5), skin, side * (mounted ? 0.47 : 0.37), base + (mounted ? 0.19 : 0.09), mounted ? 0.42 : 0))
    const leg = part(new THREE.CylinderGeometry(0.105, 0.085, mounted ? 0.82 : 0.88, 7), trousers, side * (mounted ? 0.38 : 0.15), mounted ? -0.25 : 0.44, mounted ? 0.03 : 0)
    leg.rotation.z = side * (mounted ? 0.48 : 0.02)
    leg.rotation.x = mounted ? -0.18 : 0
    group.add(leg)
    const boot = part(new THREE.BoxGeometry(0.18, 0.28, 0.34), leather, side * (mounted ? 0.57 : 0.15), mounted ? -0.66 : 0.12, mounted ? 0.13 : 0.08)
    boot.rotation.z = side * (mounted ? 0.25 : 0)
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
    const scale = 1.78 / size.y
    this.model.scale.setScalar(scale)
    this.model.position.y = -box.min.y * scale
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.frustumCulled = false
        const old = child.material as THREE.MeshStandardMaterial
        child.material = new THREE.MeshStandardMaterial({
          color: '#78452e',
          roughness: 0.88,
          metalness: 0,
          flatShading: false,
          map: old.map ?? null,
        })
      }
    })
    this.visual.add(this.model)
    const saddle = new THREE.Group()
    saddle.add(part(new THREE.BoxGeometry(0.6, 0.12, 0.92), material('#3d251c'), 0, 1.01, -0.08))
    const blanket = part(new THREE.BoxGeometry(0.72, 0.07, 1.06), material('#8e3f32'), 0, 0.94, -0.08)
    saddle.add(blanket)
    this.visual.add(saddle)
    this.rider.position.set(0, 1.14, -0.02)
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
