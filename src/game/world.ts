import * as THREE from 'three'
import { LAKE, LANDMARKS } from './config'

interface HeightData {
  res: number
  size: { x: number; z: number }
  heights: number[]
}

interface TerrainData {
  treePrototypes: { name: string }[]
  treeInstances: number[][]
}

export interface Obstacle {
  x: number
  z: number
  r: number
}

export function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (a: number, b: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

export function pathX(z: number) {
  return Math.sin(z * 0.035) * 4.2 - 1.5
}

function mat(color: THREE.ColorRepresentation, roughness = 0.9, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const result = new THREE.Mesh(geometry, material)
  result.position.set(x, y, z)
  result.castShadow = true
  result.receiveShadow = true
  return result
}

function makeGroundTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(128, 128)
  const random = mulberry32(4128)
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 182 + Math.floor(random() * 65)
    image.data[i] = value
    image.data[i + 1] = value
    image.data[i + 2] = value - 8
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(95, 95)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class World {
  readonly group = new THREE.Group()
  readonly obstacles: Obstacle[] = [
    { x: 0, z: 0, r: 6.2 },
    { x: 15, z: 3.5, r: 4.5 },
    { x: -42, z: -35, r: 3.4 },
  ]
  readonly markers = new Map<string, THREE.Group>()
  waterLevel = 0
  private heights!: HeightData
  private baseCabinHeight = 0
  private fire?: THREE.Mesh
  private smoke?: THREE.Points
  private leaves?: THREE.Points
  private rain?: THREE.Points
  private rainPositions?: Float32Array
  private skyMaterial?: THREE.ShaderMaterial
  private sun!: THREE.DirectionalLight
  private hemi!: THREE.HemisphereLight
  private windowLights: THREE.PointLight[] = []
  private water?: THREE.Mesh

  async build(scene: THREE.Scene) {
    const [heightResponse, terrainResponse] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/heights.json`),
      fetch(`${import.meta.env.BASE_URL}data/terrain.json`),
    ])
    if (!heightResponse.ok || !terrainResponse.ok) throw new Error('Arazi verileri yüklenemedi')
    this.heights = await heightResponse.json()
    const terrain: TerrainData = await terrainResponse.json()
    this.baseCabinHeight = this.rawHeight(0, 0)
    this.waterLevel = this.rawHeight(LAKE.x, LAKE.z) - 1.1
    scene.add(this.group)
    this.buildSky(scene)
    this.buildTerrain()
    this.buildLake()
    this.buildCabin()
    this.buildStable()
    this.buildTower()
    this.buildCampfire()
    this.buildVegetation(terrain)
    this.buildMeadow()
    this.buildMarkers()
    this.buildParticles()
    this.buildDistantMountains()
  }

  rawHeight(x: number, z: number) {
    const { res, heights, size } = this.heights
    const fx = THREE.MathUtils.clamp((x + size.x / 2) / size.x, 0, 1) * (res - 1)
    const fz = THREE.MathUtils.clamp((z + size.z / 2) / size.z, 0, 1) * (res - 1)
    const x0 = Math.floor(fx)
    const z0 = Math.floor(fz)
    const x1 = Math.min(res - 1, x0 + 1)
    const z1 = Math.min(res - 1, z0 + 1)
    const tx = fx - x0
    const tz = fz - z0
    const a = THREE.MathUtils.lerp(heights[z0 * res + x0], heights[z0 * res + x1], tx)
    const b = THREE.MathUtils.lerp(heights[z1 * res + x0], heights[z1 * res + x1], tx)
    return THREE.MathUtils.lerp(a, b, tz) * 0.6
  }

  heightAt(x: number, z: number) {
    let height = this.rawHeight(x, z)
    const clearing = Math.hypot(x / 1.2, z)
    const clearBlend = 1 - smooth(15, 25, clearing)
    height = THREE.MathUtils.lerp(height, this.baseCabinHeight, clearBlend)
    const lakeDistance = Math.hypot(x - LAKE.x, z - LAKE.z)
    if (lakeDistance < 24) {
      const depression = 1 - smooth(13, 24, lakeDistance)
      height = THREE.MathUtils.lerp(height, this.waterLevel - 1.5, depression)
    }
    if (z > -100 && z < 115) {
      const roadDistance = Math.abs(x - pathX(z))
      const roadBlend = 1 - smooth(2.2, 5.2, roadDistance)
      const roadHeight = this.rawHeight(pathX(z), z)
      height = THREE.MathUtils.lerp(height, roadHeight, roadBlend * (1 - clearBlend) * 0.55)
    }
    return height
  }

  private buildSky(scene: THREE.Scene) {
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#456675') },
        horizonColor: { value: new THREE.Color('#e9a769') },
        bottomColor: { value: new THREE.Color('#e8c18e') },
      },
      vertexShader: 'varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: 'varying vec3 vWorld; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; void main(){ float h=normalize(vWorld).y; vec3 c=mix(horizonColor,topColor,smoothstep(0.0,0.62,h)); c=mix(bottomColor,c,smoothstep(-0.2,0.03,h)); gl_FragColor=vec4(c,1.0); }',
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(850, 24, 16), this.skyMaterial)
    scene.add(sky)
    this.hemi = new THREE.HemisphereLight('#f5d6a5', '#273b2b', 1.8)
    scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#ffd29a', 3.2)
    this.sun.position.set(-70, 90, 40)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -55
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 55
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 230
    this.sun.shadow.bias = -0.00035
    scene.add(this.sun)
    scene.fog = new THREE.FogExp2('#bda880', 0.0052)
  }

  private buildTerrain() {
    const segments = 180
    const size = 500
    const vertices: number[] = []
    const colors: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const color = new THREE.Color()
    for (let iz = 0; iz <= segments; iz++) {
      for (let ix = 0; ix <= segments; ix++) {
        const x = (ix / segments - 0.5) * size
        const z = (iz / segments - 0.5) * size
        const y = this.heightAt(x, z)
        vertices.push(x, y, z)
        uvs.push(ix / segments, iz / segments)
        const road = z > -100 && z < 115 && Math.abs(x - pathX(z)) < 3.2
        const lakeDistance = Math.hypot(x - LAKE.x, z - LAKE.z)
        const noise = Math.sin(x * 0.31 + z * 0.17) * 0.025
        if (lakeDistance < 18) color.setHSL(0.1, 0.25, 0.29 + noise)
        else if (road) color.setHSL(0.085, 0.27, 0.34 + noise)
        else if (y > 15) color.setHSL(0.19, 0.18, 0.34 + noise)
        else color.setHSL(0.23 + noise, 0.31, 0.29 + noise)
        colors.push(color.r, color.g, color.b)
      }
    }
    for (let z = 0; z < segments; z++) {
      for (let x = 0; x < segments; x++) {
        const a = z * (segments + 1) + x
        const b = a + 1
        const c = a + segments + 1
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const terrain = mesh(geometry, new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: makeGroundTexture(),
      roughness: 1,
    }))
    terrain.castShadow = false
    this.group.add(terrain)
  }

  private buildLake() {
    const material = new THREE.MeshPhysicalMaterial({
      color: '#517d83',
      roughness: 0.18,
      metalness: 0.05,
      transparent: true,
      opacity: 0.82,
      clearcoat: 0.7,
    })
    this.water = mesh(new THREE.CircleGeometry(LAKE.radius, 64), material, LAKE.x, this.waterLevel, LAKE.z)
    this.water.rotation.x = -Math.PI / 2
    this.water.castShadow = false
    this.group.add(this.water)
    const shore = mesh(new THREE.RingGeometry(LAKE.radius, LAKE.radius + 1.2, 64), mat('#8c7954'), LAKE.x, this.waterLevel - 0.08, LAKE.z)
    shore.rotation.x = -Math.PI / 2
    shore.castShadow = false
    this.group.add(shore)
  }

  private buildCabin() {
    const cabin = new THREE.Group()
    cabin.position.set(0, this.heightAt(0, 0), 0)
    const wood = mat('#5b3422')
    const darkWood = mat('#35231b')
    const trim = mat('#8b6038')
    const stone = mat('#625d50')
    cabin.add(mesh(new THREE.BoxGeometry(9.5, 0.7, 7.5), stone, 0, 0.2, 0))
    for (let i = 0; i < 9; i++) {
      const y = 0.75 + i * 0.48
      const front = mesh(new THREE.CylinderGeometry(0.29, 0.29, 9.4, 8), wood, 0, y, 3.5)
      front.rotation.z = Math.PI / 2
      const back = front.clone()
      back.position.z = -3.5
      const left = mesh(new THREE.CylinderGeometry(0.29, 0.29, 7.2, 8), wood, -4.5, y, 0)
      left.rotation.x = Math.PI / 2
      const right = left.clone()
      right.position.x = 4.5
      cabin.add(front, back, left, right)
    }
    const roofLeft = mesh(new THREE.BoxGeometry(6.2, 0.35, 9), darkWood, -2.25, 6, 0)
    roofLeft.rotation.z = -0.57
    const roofRight = roofLeft.clone()
    roofRight.position.x = 2.25
    roofRight.rotation.z = 0.57
    cabin.add(roofLeft, roofRight)
    const gableShape = new THREE.Shape([new THREE.Vector2(-4.5, 4.6), new THREE.Vector2(0, 7.6), new THREE.Vector2(4.5, 4.6)])
    const gableMat = new THREE.MeshStandardMaterial({ color: '#624029', side: THREE.DoubleSide, roughness: 1 })
    const frontGable = mesh(new THREE.ShapeGeometry(gableShape), gableMat, 0, 0, 3.52)
    const backGable = frontGable.clone()
    backGable.position.z = -3.52
    cabin.add(frontGable, backGable)
    cabin.add(mesh(new THREE.BoxGeometry(1.65, 3.25, 0.25), darkWood, 0.3, 2.05, 3.77))
    cabin.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), mat('#c79b4d', 0.4, 0.5), 0.85, 2.1, 3.94))
    const glow = new THREE.MeshStandardMaterial({ color: '#efb86c', emissive: '#ff9e3d', emissiveIntensity: 1.2, roughness: 0.5 })
    for (const x of [-2.7, 2.9]) {
      cabin.add(mesh(new THREE.BoxGeometry(1.45, 1.55, 0.2), trim, x, 2.6, 3.76))
      cabin.add(mesh(new THREE.BoxGeometry(1.12, 1.25, 0.23), glow, x, 2.6, 3.9))
      cabin.add(mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), darkWood, x, 2.6, 4.04))
      cabin.add(mesh(new THREE.BoxGeometry(1.15, 0.08, 0.08), darkWood, x, 2.6, 4.04))
      const light = new THREE.PointLight('#ff9e45', 0, 13, 2)
      light.position.set(x, 2.8, 5)
      cabin.add(light)
      this.windowLights.push(light)
    }
    cabin.add(mesh(new THREE.BoxGeometry(10.5, 0.28, 3.4), trim, 0, 0.65, 5))
    for (const x of [-4.4, 4.4]) {
      cabin.add(mesh(new THREE.CylinderGeometry(0.15, 0.18, 3.5, 8), darkWood, x, 2.3, 6))
    }
    const porchRoof = mesh(new THREE.BoxGeometry(10.3, 0.25, 3.8), darkWood, 0, 4.15, 5.1)
    porchRoof.rotation.x = -0.12
    cabin.add(porchRoof)
    cabin.add(mesh(new THREE.BoxGeometry(1.15, 4.2, 1.15), stone, 2.4, 6.2, -1.2))
    const sign = mesh(new THREE.BoxGeometry(2.5, 0.85, 0.16), trim, -2.5, 1.5, 6.8)
    sign.rotation.y = 0.08
    cabin.add(sign)
    this.group.add(cabin)
  }

  private buildStable() {
    const stable = new THREE.Group()
    stable.position.set(15, this.heightAt(15, 3.5), 3.5)
    const wood = mat('#51331f')
    const roof = mat('#35271d')
    for (const x of [-4, 4]) for (const z of [-3, 3]) stable.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 4.2, 8), wood, x, 2.1, z))
    const leftRoof = mesh(new THREE.BoxGeometry(5, 0.28, 7.4), roof, -1.8, 4.6, 0)
    leftRoof.rotation.z = -0.35
    const rightRoof = leftRoof.clone()
    rightRoof.position.x = 1.8
    rightRoof.rotation.z = 0.35
    stable.add(leftRoof, rightRoof)
    stable.add(mesh(new THREE.BoxGeometry(8.4, 2.2, 0.3), wood, 0, 1.2, -3))
    for (let i = 0; i < 4; i++) {
      const bale = mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.2, 12), mat('#b18a45'), 2.2 + (i % 2) * 1.2, 0.65 + Math.floor(i / 2) * 1.1, -1.7)
      bale.rotation.z = Math.PI / 2
      stable.add(bale)
    }
    this.group.add(stable)
    const trough = new THREE.Group()
    trough.position.set(10.5, this.heightAt(10.5, 11.5), 11.5)
    trough.add(mesh(new THREE.BoxGeometry(3, 0.75, 1.25), mat('#4b3020'), 0, 0.55, 0))
    trough.add(mesh(new THREE.BoxGeometry(2.65, 0.08, 0.95), new THREE.MeshPhysicalMaterial({ color: '#557f82', roughness: 0.15 }), 0, 0.96, 0))
    this.group.add(trough)
    for (let i = 0; i < 9; i++) {
      const x = 8 + i * 1.6
      const z = 14.5
      const fence = mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6), mat('#6c472a'), x, this.heightAt(x, z) + 0.75, z)
      this.group.add(fence)
      if (i < 8) {
        const rail = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 6), mat('#6c472a'), x + 0.8, this.heightAt(x, z) + 1, z)
        rail.rotation.z = Math.PI / 2
        this.group.add(rail)
      }
    }
  }

  private buildTower() {
    const tower = new THREE.Group()
    tower.position.set(-42, this.heightAt(-42, -35), -35)
    const wood = mat('#4b3524')
    for (const x of [-2.2, 2.2]) for (const z of [-2.2, 2.2]) {
      const post = mesh(new THREE.CylinderGeometry(0.2, 0.3, 8.5, 8), wood, x, 4.25, z)
      post.rotation.z = x * 0.018
      tower.add(post)
    }
    tower.add(mesh(new THREE.BoxGeometry(5.5, 0.35, 5.5), wood, 0, 7.3, 0))
    for (let i = 0; i < 5; i++) {
      const y = 7.7 + i * 0.42
      tower.add(mesh(new THREE.BoxGeometry(5.2, 0.22, 0.25), wood, 0, y, 2.45))
      tower.add(mesh(new THREE.BoxGeometry(5.2, 0.22, 0.25), wood, 0, y, -2.45))
    }
    const roof = mesh(new THREE.ConeGeometry(4.4, 2.4, 4), mat('#2f2a22'), 0, 10.4, 0)
    roof.rotation.y = Math.PI / 4
    tower.add(roof)
    for (let i = 0; i < 11; i++) tower.add(mesh(new THREE.BoxGeometry(1.1, 0.12, 0.18), wood, 0, 0.6 + i * 0.62, 2.65))
    this.group.add(tower)
  }

  private buildCampfire() {
    const x = -9
    const z = 10
    const y = this.heightAt(x, z)
    const group = new THREE.Group()
    group.position.set(x, y, z)
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2
      group.add(mesh(new THREE.DodecahedronGeometry(0.32, 0), mat('#6b6558'), Math.cos(angle) * 1.1, 0.22, Math.sin(angle) * 1.1))
    }
    for (const angle of [-0.6, 0.6]) {
      const log = mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 8), mat('#3b2418'), 0, 0.3, 0)
      log.rotation.z = Math.PI / 2
      log.rotation.y = angle
      group.add(log)
    }
    this.fire = mesh(new THREE.ConeGeometry(0.45, 1.4, 7), new THREE.MeshStandardMaterial({ color: '#ffb13b', emissive: '#ff5d16', emissiveIntensity: 2.4 }), 0, 1, 0)
    group.add(this.fire)
    const light = new THREE.PointLight('#ff7a2d', 16, 18, 2)
    light.position.y = 2
    group.add(light)
    this.windowLights.push(light)
    this.group.add(group)
  }

  private buildVegetation(terrain: TerrainData) {
    const random = mulberry32(7731)
    const candidates = terrain.treeInstances.filter((entry) => {
      const x = -250 + entry[0] * 500
      const z = 250 - entry[2] * 500
      const central = Math.hypot(x / 1.2, z) < 27
      const lake = Math.hypot(x - LAKE.x, z - LAKE.z) < 23
      const road = z > -100 && z < 115 && Math.abs(x - pathX(z)) < 5
      const tower = Math.hypot(x + 42, z + 35) < 7
      return Math.abs(x) < 225 && Math.abs(z) < 225 && !central && !lake && !road && !tower
    })
    const count = Math.min(2000, candidates.length)
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 4.6, 6), mat('#483426'), count)
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.65, 0), new THREE.MeshStandardMaterial({ roughness: 1 }), count)
    const upper = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.1, 0), new THREE.MeshStandardMaterial({ roughness: 1 }), count)
    const dummy = new THREE.Object3D()
    const palette = ['#7d7734', '#9a6b2f', '#a9542c', '#69753b', '#b1853c', '#566d3a']
    for (let i = 0; i < count; i++) {
      const entry = candidates[Math.floor((i / count) * candidates.length)]
      const x = -250 + entry[0] * 500
      const z = 250 - entry[2] * 500
      const y = this.heightAt(x, z)
      const prototype = terrain.treePrototypes[entry[6]]?.name ?? ''
      const scale = (0.72 + random() * 0.75) * (prototype.includes('Tree_L') ? 1.3 : 1)
      dummy.position.set(x, y + 2.3 * scale, z)
      dummy.scale.set(scale, scale, scale)
      dummy.rotation.y = -entry[5]
      dummy.updateMatrix()
      trunk.setMatrixAt(i, dummy.matrix)
      dummy.position.y = y + 5.5 * scale
      dummy.scale.set(scale * 1.15, scale, scale * 1.15)
      dummy.updateMatrix()
      crowns.setMatrixAt(i, dummy.matrix)
      dummy.position.y = y + 7.6 * scale
      dummy.position.x += (random() - 0.5) * 1.2
      dummy.scale.setScalar(scale * 0.86)
      dummy.updateMatrix()
      upper.setMatrixAt(i, dummy.matrix)
      const color = new THREE.Color(palette[Math.floor(random() * palette.length)])
      crowns.setColorAt(i, color)
      upper.setColorAt(i, color.clone().offsetHSL(0.01, 0.02, 0.045))
      if (Math.hypot(x, z) < 80 && i % 3 === 0) this.obstacles.push({ x, z, r: 0.65 * scale })
    }
    trunk.receiveShadow = true
    crowns.receiveShadow = true
    this.group.add(trunk, crowns, upper)
    this.buildGrass(random)
    this.buildRocks(random)
  }

  private buildGrass(random: () => number) {
    const count = 4000
    const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.045, 0.45, 3), new THREE.MeshStandardMaterial({ color: '#6f793d', roughness: 1 }), count)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2
      const radius = 8 + Math.sqrt(random()) * 125
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = this.heightAt(x, z)
      dummy.position.set(x, y + 0.32, z)
      dummy.rotation.set((random() - 0.5) * 0.25, random() * Math.PI, (random() - 0.5) * 0.25)
      dummy.scale.set(0.7 + random(), 0.6 + random() * 1.3, 0.7 + random())
      dummy.updateMatrix()
      grass.setMatrixAt(i, dummy.matrix)
      grass.setColorAt(i, new THREE.Color().setHSL(0.18 + random() * 0.09, 0.3, 0.28 + random() * 0.12))
    }
    grass.castShadow = false
    grass.receiveShadow = true
    this.group.add(grass)
  }

  private buildRocks(random: () => number) {
    const count = 150
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.75, 0), mat('#69665a'), count)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2
      const radius = 25 + random() * 145
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const scale = 0.35 + random() * 1.25
      dummy.position.set(x, this.heightAt(x, z) + scale * 0.2, z)
      dummy.rotation.set(random() * 2, random() * 2, random() * 2)
      dummy.scale.set(scale, scale * 0.55, scale * 0.85)
      dummy.updateMatrix()
      rocks.setMatrixAt(i, dummy.matrix)
    }
    rocks.receiveShadow = true
    this.group.add(rocks)
  }

  private buildMeadow() {
    const random = mulberry32(9155)
    const count = 650
    const flowers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), count)
    const dummy = new THREE.Object3D()
    const colors = ['#d6b458', '#d6d0ac', '#a86c48', '#c9928a']
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2
      const radius = Math.sqrt(random()) * 16
      const x = 55 + Math.cos(angle) * radius
      const z = 45 + Math.sin(angle) * radius
      dummy.position.set(x, this.heightAt(x, z) + 0.4 + random() * 0.25, z)
      dummy.scale.setScalar(0.65 + random())
      dummy.updateMatrix()
      flowers.setMatrixAt(i, dummy.matrix)
      flowers.setColorAt(i, new THREE.Color(colors[Math.floor(random() * colors.length)]))
    }
    this.group.add(flowers)
  }

  private buildMarkers() {
    for (const landmark of LANDMARKS) {
      const group = new THREE.Group()
      const color = landmark.kind === 'care' ? '#d8b568' : landmark.kind === 'rest' ? '#d48555' : '#b8d2b2'
      const ring = mesh(new THREE.TorusGeometry(0.52, 0.035, 6, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }))
      ring.rotation.x = Math.PI / 2
      const diamond = mesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color }), 0, 0.65, 0)
      group.add(ring, diamond)
      group.position.set(landmark.x, this.heightAt(landmark.x, landmark.z) + 2.1, landmark.z)
      group.userData.baseY = group.position.y
      this.markers.set(landmark.id, group)
      this.group.add(group)
    }
  }

  private buildParticles() {
    const random = mulberry32(6621)
    const smokePositions = new Float32Array(24 * 3)
    for (let i = 0; i < 24; i++) {
      smokePositions[i * 3] = 2.4 + (random() - 0.5) * 0.5
      smokePositions[i * 3 + 1] = 8 + random() * 8
      smokePositions[i * 3 + 2] = -1.2 + (random() - 0.5) * 0.5
    }
    const smokeGeometry = new THREE.BufferGeometry()
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3))
    this.smoke = new THREE.Points(smokeGeometry, new THREE.PointsMaterial({ color: '#c6b9a1', size: 0.65, transparent: true, opacity: 0.3, depthWrite: false }))
    this.smoke.position.y = this.heightAt(0, 0)
    this.group.add(this.smoke)
    const leafPositions = new Float32Array(180 * 3)
    for (let i = 0; i < 180; i++) {
      leafPositions[i * 3] = (random() - 0.5) * 100
      leafPositions[i * 3 + 1] = 3 + random() * 18
      leafPositions[i * 3 + 2] = (random() - 0.5) * 100
    }
    const leafGeometry = new THREE.BufferGeometry()
    leafGeometry.setAttribute('position', new THREE.BufferAttribute(leafPositions, 3))
    this.leaves = new THREE.Points(leafGeometry, new THREE.PointsMaterial({ color: '#d28a3b', size: 0.18, transparent: true, opacity: 0.75 }))
    this.group.add(this.leaves)
    this.rainPositions = new Float32Array(900 * 3)
    for (let i = 0; i < 900; i++) {
      this.rainPositions[i * 3] = (random() - 0.5) * 70
      this.rainPositions[i * 3 + 1] = random() * 32
      this.rainPositions[i * 3 + 2] = (random() - 0.5) * 70
    }
    const rainGeometry = new THREE.BufferGeometry()
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3))
    this.rain = new THREE.Points(rainGeometry, new THREE.PointsMaterial({ color: '#c8d6d7', size: 0.075, transparent: true, opacity: 0.65, depthWrite: false }))
    this.rain.visible = false
    this.group.add(this.rain)
  }

  private buildDistantMountains() {
    const random = mulberry32(121)
    const material = mat('#586253')
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2
      const radius = 285 + random() * 90
      const height = 45 + random() * 65
      const mountain = mesh(new THREE.DodecahedronGeometry(1, 0), material, Math.cos(angle) * radius, height * 0.2, Math.sin(angle) * radius)
      mountain.scale.set(38 + random() * 25, height * 0.72, 34 + random() * 25)
      mountain.rotation.y = random() * Math.PI
      mountain.castShadow = false
      mountain.receiveShadow = false
      this.group.add(mountain)
    }
  }

  setRaining(raining: boolean) {
    if (this.rain) this.rain.visible = raining
  }

  updateEnvironment(time: number, elapsed: number, raining: boolean, focus: THREE.Vector3, dt: number) {
    const daylight = THREE.MathUtils.clamp(Math.sin(((time - 6) / 12) * Math.PI), 0, 1)
    const dusk = 1 - Math.abs(time - 18.5) / 3
    const night = 1 - smooth(0.05, 0.42, daylight)
    const angle = ((time - 6) / 24) * Math.PI * 2
    this.sun.position.set(Math.cos(angle) * 100, Math.max(4, Math.sin(angle) * 115), 45)
    this.sun.intensity = (0.12 + daylight * 3.1) * (raining ? 0.55 : 1)
    this.sun.color.set(daylight < 0.35 ? '#ef9b68' : '#ffd6a0')
    this.hemi.intensity = 0.5 + daylight * 1.85
    const top = new THREE.Color().setHSL(0.57, 0.25, 0.09 + daylight * 0.28)
    const horizon = new THREE.Color().setHSL(0.07 + daylight * 0.47, 0.35, 0.13 + daylight * 0.55)
    if (dusk > 0 && daylight > 0) horizon.set('#d99362')
    if (raining) { top.multiplyScalar(0.55); horizon.multiplyScalar(0.65) }
    this.skyMaterial?.uniforms.topColor.value.copy(top)
    this.skyMaterial?.uniforms.horizonColor.value.copy(horizon)
    this.skyMaterial?.uniforms.bottomColor.value.copy(horizon)
    const parentScene = this.group.parent as THREE.Scene | null
    if (parentScene?.fog instanceof THREE.FogExp2) {
      parentScene.fog.color.copy(horizon)
      parentScene.fog.density = raining ? 0.009 : 0.0052
    }
    for (const light of this.windowLights) light.intensity = light === this.windowLights[this.windowLights.length - 1] ? 10 + night * 10 : night * 14
    if (this.fire) {
      this.fire.scale.y = 0.85 + Math.sin(elapsed * 13) * 0.14
      this.fire.rotation.y = elapsed * 0.7
    }
    if (this.smoke) {
      const positions = this.smoke.geometry.attributes.position
      for (let i = 0; i < positions.count; i++) {
        let y = positions.getY(i) + dt * (0.5 + (i % 5) * 0.07)
        if (y > 17) y = 8
        positions.setY(i, y)
        positions.setX(i, 2.4 + Math.sin(elapsed * 0.35 + i) * (y - 7) * 0.08)
      }
      positions.needsUpdate = true
    }
    if (this.leaves) {
      const positions = this.leaves.geometry.attributes.position
      for (let i = 0; i < positions.count; i++) {
        let y = positions.getY(i) - dt * (0.3 + (i % 4) * 0.08)
        if (y < 1) y = 18
        positions.setY(i, y)
        positions.setX(i, positions.getX(i) + Math.sin(elapsed + i) * dt * 0.18)
      }
      positions.needsUpdate = true
    }
    if (this.rain && this.rainPositions && raining) {
      this.rain.position.set(focus.x, focus.y, focus.z)
      for (let i = 0; i < 900; i++) {
        this.rainPositions[i * 3 + 1] -= dt * 22
        if (this.rainPositions[i * 3 + 1] < 0) this.rainPositions[i * 3 + 1] = 32
      }
      this.rain.geometry.attributes.position.needsUpdate = true
    }
    for (const [id, marker] of this.markers) {
      marker.rotation.y = elapsed * 0.55
      marker.position.y = marker.userData.baseY + Math.sin(elapsed * 1.8 + id.length) * 0.18
    }
    if (this.water) this.water.position.y = this.waterLevel + Math.sin(elapsed * 0.7) * 0.025
    this.sun.target.position.copy(focus)
    this.sun.target.updateMatrixWorld()
  }

  setQuality(quality: 'high' | 'low') {
    if (this.sun) this.sun.castShadow = quality === 'high'
    if (this.leaves) this.leaves.visible = quality === 'high'
  }
}
