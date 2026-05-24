import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import './styles.css'

const MM = 0.08
const SCALE_LABEL = 1 / MM

const app = document.querySelector('#app')
app.innerHTML = `
  <aside class="panel">
    <div class="brand">
      <span class="mark"></span>
      <div>
        <h1>零件 3D 查看器</h1>
        <p>按图纸尺寸生成的可旋转预览</p>
      </div>
    </div>

    <div class="switcher" role="tablist" aria-label="选择零件">
      <button class="is-active" data-model="case" type="button">塑料外壳</button>
      <button data-model="ring" type="button">环夹卡扣</button>
      <button data-model="both" type="button">组合查看</button>
    </div>

    <section class="specs" aria-live="polite">
      <h2>当前尺寸</h2>
      <dl id="specList"></dl>
    </section>

    <div class="controls">
      <label>
        <span>透明剖视</span>
        <input id="ghostToggle" type="checkbox" />
      </label>
      <label>
        <span>自动旋转</span>
        <input id="spinToggle" type="checkbox" checked />
      </label>
      <label>
        <span>尺寸标注</span>
        <input id="labelToggle" type="checkbox" checked />
      </label>
    </div>

    <div class="actions">
      <button id="resetView" type="button">重置视角</button>
      <button id="explodeView" type="button">分开展示</button>
    </div>
  </aside>

  <main class="stage">
    <div class="viewport" id="viewport"></div>
    <div class="hud">
      <span>拖拽旋转</span>
      <span>滚轮缩放</span>
      <span>右键平移</span>
    </div>
  </main>
`

const viewport = document.querySelector('#viewport')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf4f2ec)

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
camera.position.set(4.8, 4.2, 6.6)

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
viewport.append(renderer.domElement)

const labelRenderer = new CSS2DRenderer()
labelRenderer.domElement.className = 'label-layer'
viewport.append(labelRenderer.domElement)

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.autoRotate = true
controls.autoRotateSpeed = 0.8
controls.target.set(0, 0.35, 0)

const root = new THREE.Group()
scene.add(root)

const labelRoot = new THREE.Group()
scene.add(labelRoot)
let activeAnnotationTarget = labelRoot
let spatialLabelsEnabled = true
let activeAnnotationSide = 'all'
let labelsVisible = true

const materials = {
  shell: new THREE.MeshStandardMaterial({
    color: 0xe8e1d2,
    roughness: 0.58,
    metalness: 0.02,
  }),
  shellGhost: new THREE.MeshStandardMaterial({
    color: 0xe8e1d2,
    roughness: 0.48,
    metalness: 0.02,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  }),
  cut: new THREE.MeshStandardMaterial({
    color: 0x242424,
    roughness: 0.82,
  }),
  rubber: new THREE.MeshStandardMaterial({
    color: 0x242424,
    roughness: 0.72,
  }),
  brass: new THREE.MeshStandardMaterial({
    color: 0xbe9a52,
    metalness: 0.22,
    roughness: 0.38,
  }),
  edge: new THREE.LineBasicMaterial({
    color: 0x2d2a26,
    transparent: true,
    opacity: 0.35,
  }),
}

const specs = {
  case: [
    ['外壳正/背面', '35 × 35 mm'],
    ['外部深度', '9 mm'],
    ['内部边长', '33 × 33 mm'],
    ['内部高', '7 mm'],
    ['壁厚', '1 mm'],
    ['前面圆孔', 'Ø16 mm'],
    ['USB 槽', '宽 13 / 高 4.5 / 底边 1 mm'],
    ['USB 左右边距', '11 / 13 / 11 mm'],
    ['螺丝孔/柱', '4 × PM2.0 × 5 mm'],
    ['开口 C 形导轨槽', '上宽 21.4 / 下口 16.0 / 高 5.8 / 45°'],
  ],
  ring: [
    ['环夹外径', 'Ø35 mm'],
    ['环夹内径', 'Ø31 mm'],
    ['壁厚', '2 mm'],
    ['外部深度', '9 mm'],
    ['开口 C 形导轨槽', '上宽 21.4 / 下口 16.0 / 高 5.8 / 45°'],
  ],
  both: [
    ['外壳', '35 × 35 × 9 mm'],
    ['环夹', 'Ø35 / Ø31 × 9 mm'],
    ['USB/螺丝', '13 × 4.5 槽，4 × PM2.0 × 5'],
    ['开口 C 形导轨槽', '同规格，便于比较接口形态'],
  ],
}

const PICATINNY_SLOT = Object.freeze({
  topWidth: 21.4,
  lowerOpening: 16.0,
  height: 5.8,
  depth: 9,
  bevelAngle: 45,
  lipRise: (21.4 - 16.0) / 2,
  baseHeight: 1.35,
  topChamfer: 1.3,
  hookShoulder: 1.25,
  localBottomY: 17.0,
  modelBottomY: 17.5,
})

function roundedRectShape(width, height, radius) {
  const w = (width * MM) / 2
  const h = (height * MM) / 2
  const r = Math.min(radius * MM, w, h)
  const shape = new THREE.Shape()
  shape.moveTo(-w + r, -h)
  shape.lineTo(w - r, -h)
  shape.quadraticCurveTo(w, -h, w, -h + r)
  shape.lineTo(w, h - r)
  shape.quadraticCurveTo(w, h, w - r, h)
  shape.lineTo(-w + r, h)
  shape.quadraticCurveTo(-w, h, -w, h - r)
  shape.lineTo(-w, -h + r)
  shape.quadraticCurveTo(-w, -h, -w + r, -h)
  return shape
}

function circlePath(radius, segments = 96) {
  const path = new THREE.Path()
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    const x = Math.cos(angle) * radius * MM
    const y = Math.sin(angle) * radius * MM
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }
  return path
}

function rectanglePath(width, height, x = 0, y = 0) {
  const path = new THREE.Path()
  const w = (width * MM) / 2
  const h = (height * MM) / 2
  const sx = x * MM
  const sy = y * MM
  path.moveTo(sx - w, sy - h)
  path.lineTo(sx - w, sy + h)
  path.lineTo(sx + w, sy + h)
  path.lineTo(sx + w, sy - h)
  path.lineTo(sx - w, sy - h)
  return path
}

function extrudeShape(shape, depth, bevel = 0.6) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth * MM,
    bevelEnabled: true,
    bevelThickness: bevel * MM,
    bevelSize: bevel * MM,
    bevelSegments: 6,
    curveSegments: 32,
  })
  geometry.center()
  return geometry
}

function addEdges(mesh, opacity = 0.28) {
  const edgeGeo = new THREE.EdgesGeometry(mesh.geometry, 28)
  const edges = new THREE.LineSegments(edgeGeo, materials.edge.clone())
  edges.material.opacity = opacity
  mesh.add(edges)
  return edges
}

function makeBox(width, height, depth, material = materials.shell) {
  const geometry = new THREE.BoxGeometry(width * MM, height * MM, depth * MM)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  addEdges(mesh, 0.18)
  return mesh
}

function makeProfileMesh(points, depth, material = materials.shell) {
  const shape = new THREE.Shape()
  shape.moveTo(points[0].x * MM, points[0].y * MM)
  for (const point of points.slice(1)) {
    shape.lineTo(point.x * MM, point.y * MM)
  }
  shape.closePath()

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth * MM,
    bevelEnabled: true,
    bevelThickness: 0.08 * MM,
    bevelSize: 0.08 * MM,
    bevelSegments: 2,
    curveSegments: 4,
  })
  geometry.translate(0, 0, (-depth * MM) / 2)

  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  addEdges(mesh, 0.18)
  return mesh
}

function makeProfileLine(points, z, color = 0x2d2a26) {
  const vectors = points.map((point) => new THREE.Vector3(point.x * MM, point.y * MM, z * MM))
  vectors.push(vectors[0].clone())
  const geometry = new THREE.BufferGeometry().setFromPoints(vectors)
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
    }),
  )
  return line
}

function makeCylinder(radius, depth, material, segments = 96) {
  const geometry = new THREE.CylinderGeometry(radius * MM, radius * MM, depth * MM, segments)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  addEdges(mesh, 0.18)
  return mesh
}

function makeScrewHoleMarker() {
  const group = new THREE.Group()

  const ringGeometry = new THREE.TorusGeometry(1.45 * MM, 0.34 * MM, 16, 48)
  const ring = new THREE.Mesh(ringGeometry, materials.shell)
  ring.castShadow = true
  ring.receiveShadow = true
  group.add(ring)

  const boreGeometry = new THREE.CircleGeometry(0.78 * MM, 36)
  const bore = new THREE.Mesh(boreGeometry, materials.cut)
  bore.position.z = -0.01
  group.add(bore)

  return group
}

function label(text, position) {
  if (!spatialLabelsEnabled) return null
  const el = document.createElement('span')
  el.className = 'dimension-label'
  el.textContent = text
  const object = new CSS2DObject(el)
  object.position.set(position.x * MM, position.y * MM, position.z * MM)
  object.userData.annotation = true
  object.userData.annotationSide = activeAnnotationSide
  activeAnnotationTarget.add(object)
  return object
}

function callout(text, position) {
  const object = label(text, position)
  if (!object) return null
  object.element.classList.add('callout-label')
  return object
}

function dimensionLine(from, to, text) {
  if (!spatialLabelsEnabled) return null
  const points = [
    new THREE.Vector3(from.x * MM, from.y * MM, from.z * MM),
    new THREE.Vector3(to.x * MM, to.y * MM, to.z * MM),
  ]
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x9b2f17 }))
  line.userData.annotation = true
  line.userData.annotationSide = activeAnnotationSide
  activeAnnotationTarget.add(line)
  label(text, {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    z: (from.z + to.z) / 2,
  })
  return line
}

function dimensionBar(from, to, text, offset = { x: 0, y: 0, z: 0 }) {
  if (!spatialLabelsEnabled) return null
  const line = dimensionLine(from, to, text)
  const tickLength = 1.4
  const ox = offset.x ?? 0
  const oy = offset.y ?? 0
  const oz = offset.z ?? 0
  const points = [
    [from, { x: from.x + ox * tickLength, y: from.y + oy * tickLength, z: from.z + oz * tickLength }],
    [to, { x: to.x + ox * tickLength, y: to.y + oy * tickLength, z: to.z + oz * tickLength }],
  ]
  for (const [a, b] of points) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x * MM, a.y * MM, a.z * MM),
      new THREE.Vector3(b.x * MM, b.y * MM, b.z * MM),
    ])
    const tick = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x9b2f17 }))
    tick.userData.annotation = true
    tick.userData.annotationSide = activeAnnotationSide
    activeAnnotationTarget.add(tick)
  }
  return line
}

function withAnnotationSide(side, callback) {
  const previousSide = activeAnnotationSide
  activeAnnotationSide = side
  callback()
  activeAnnotationSide = previousSide
}

function annotationNormal(side) {
  if (side === 'front') return new THREE.Vector3(0, 0, 1)
  if (side === 'back') return new THREE.Vector3(0, 0, -1)
  if (side === 'left') return new THREE.Vector3(-1, 0, 0)
  if (side === 'right') return new THREE.Vector3(1, 0, 0)
  if (side === 'top') return new THREE.Vector3(0, 1, 0)
  if (side === 'bottom') return new THREE.Vector3(0, -1, 0)
  return null
}

function updateAnnotationVisibility() {
  const tmpWorldPos = new THREE.Vector3()
  const toCamera = new THREE.Vector3()
  root.traverse((node) => {
    if (!node.userData.annotation) return
    const normal = annotationNormal(node.userData.annotationSide)
    if (!labelsVisible || !normal) {
      node.visible = labelsVisible
      return
    }
    node.getWorldPosition(tmpWorldPos)
    toCamera.copy(camera.position).sub(tmpWorldPos).normalize()
    node.visible = normal.dot(toCamera) > 0.22
  })
}

function visibleMeshBox() {
  const box = new THREE.Box3()
  for (const model of [caseModel, ringModel]) {
    if (!model.visible) continue
    model.updateWorldMatrix(true, true)
    model.traverse((node) => {
      if (!node.isMesh || node.userData.annotation) return
      const meshBox = new THREE.Box3().setFromObject(node)
      if (!meshBox.isEmpty()) box.union(meshBox)
    })
  }
  return box
}

function makePicatinnyOpenCSlot(width = 35, depth = 9) {
  const group = new THREE.Group()
  const railMat = materials.shell

  const outerHalf = width / 2
  const topHalf = PICATINNY_SLOT.topWidth / 2
  const lowerHalf = PICATINNY_SLOT.lowerOpening / 2
  const bottomY = PICATINNY_SLOT.localBottomY
  const floorY = bottomY + PICATINNY_SLOT.baseHeight
  const bearingTopY = floorY + PICATINNY_SLOT.lipRise
  const topY = bottomY + PICATINNY_SLOT.height
  const shoulderY = topY - PICATINNY_SLOT.topChamfer
  const hookNeckY = topY - PICATINNY_SLOT.hookShoulder

  const openClampBody = makeProfileMesh([
    { x: -topHalf, y: topY },
    { x: -topHalf - 2.15, y: topY },
    { x: -outerHalf + PICATINNY_SLOT.topChamfer, y: topY },
    { x: -outerHalf, y: shoulderY },
    { x: -outerHalf, y: bottomY + 0.85 },
    { x: -outerHalf + 1.15, y: bottomY },
    { x: -lowerHalf, y: bottomY },
    { x: lowerHalf, y: bottomY },
    { x: outerHalf - 1.15, y: bottomY },
    { x: outerHalf, y: bottomY + 0.85 },
    { x: outerHalf, y: shoulderY },
    { x: outerHalf - PICATINNY_SLOT.topChamfer, y: topY },
    { x: topHalf + 2.15, y: topY },
    { x: topHalf, y: topY },
    { x: topHalf + 1.25, y: hookNeckY },
    { x: topHalf, y: bearingTopY },
    { x: lowerHalf, y: floorY },
    { x: lowerHalf, y: floorY },
    { x: -lowerHalf, y: floorY },
    { x: -topHalf, y: bearingTopY },
    { x: -topHalf - 1.25, y: hookNeckY },
  ], depth, railMat)
  group.add(openClampBody)

  const cavityProfile = [
    { x: -lowerHalf, y: floorY },
    { x: -topHalf, y: bearingTopY },
    { x: -topHalf - 1.25, y: hookNeckY },
    { x: -topHalf, y: topY },
    { x: topHalf, y: topY },
    { x: topHalf + 1.25, y: hookNeckY },
    { x: topHalf, y: bearingTopY },
    { x: lowerHalf, y: floorY },
  ]
  group.add(makeProfileLine(cavityProfile, depth / 2 + 0.08))
  group.add(makeProfileLine(cavityProfile, -depth / 2 - 0.08))

  return group
}

function addPicatinnySlotAnnotations() {
  const bottomY = PICATINNY_SLOT.modelBottomY
  const floorY = bottomY + PICATINNY_SLOT.baseHeight
  const topY = bottomY + PICATINNY_SLOT.height
  const bearingTopY = floorY + PICATINNY_SLOT.lipRise
  const topHalf = PICATINNY_SLOT.topWidth / 2
  const lowerHalf = PICATINNY_SLOT.lowerOpening / 2

  dimensionBar(
    { x: -topHalf, y: topY + 1.4, z: 5.4 },
    { x: topHalf, y: topY + 1.4, z: 5.4 },
    `上宽 ${PICATINNY_SLOT.topWidth.toFixed(1)} mm`,
    { y: -1 },
  )
  dimensionBar(
    { x: -lowerHalf, y: floorY - 0.9, z: 5.4 },
    { x: lowerHalf, y: floorY - 0.9, z: 5.4 },
    `下口 ${PICATINNY_SLOT.lowerOpening.toFixed(1)} mm`,
    { y: 1 },
  )
  dimensionBar(
    { x: 12.8, y: bottomY, z: 5.7 },
    { x: 12.8, y: topY, z: 5.7 },
    `槽高 ${PICATINNY_SLOT.height.toFixed(1)} mm`,
    { x: -1 },
  )
  dimensionLine(
    { x: -topHalf, y: bearingTopY, z: 5.9 },
    { x: -lowerHalf, y: floorY, z: 5.9 },
    `${PICATINNY_SLOT.bevelAngle}° 斜面`,
  )
}

function createCaseModel() {
  const group = new THREE.Group()
  group.name = 'case'
  activeAnnotationTarget = group

  const face = roundedRectShape(35, 35, 2.2)
  face.holes.push(circlePath(8, 96))
  const shell = new THREE.Mesh(extrudeShape(face, 9, 0.45), materials.shell)
  shell.castShadow = true
  shell.receiveShadow = true
  addEdges(shell)
  group.add(shell)

  const inner = roundedRectShape(33, 33, 1.4)
  const backPocket = new THREE.Mesh(extrudeShape(inner, 0.55, 0.18), materials.cut)
  backPocket.position.z = -4.78 * MM
  backPocket.scale.set(1, 1, 1)
  group.add(backPocket)

  const frontHoleSleeve = makeCylinder(8.1, 0.5, materials.cut, 96)
  frontHoleSleeve.rotation.x = Math.PI / 2
  frontHoleSleeve.position.z = 4.74 * MM
  group.add(frontHoleSleeve)

  const usbCenterY = -14.25
  const usbFrame = makeBox(13.8, 5.3, 0.7, materials.shell)
  usbFrame.position.set(0, usbCenterY * MM, -4.95 * MM)
  group.add(usbFrame)

  const usbSlot = makeBox(13, 4.5, 0.82, materials.cut)
  usbSlot.position.set(0, usbCenterY * MM, -5.35 * MM)
  group.add(usbSlot)

  for (const x of [-13.1, 13.1]) {
    for (const y of [-13.1, 13.1]) {
      const post = makeCylinder(2.15, 3.5, materials.shell, 48)
      post.rotation.x = Math.PI / 2
      post.position.set(x * MM, y * MM, -2.9 * MM)
      group.add(post)

      const insert = makeCylinder(0.9, 3.72, materials.brass, 36)
      insert.rotation.x = Math.PI / 2
      insert.position.set(x * MM, y * MM, -2.82 * MM)
      group.add(insert)

      const rearHole = makeCylinder(1.35, 0.34, materials.cut, 40)
      rearHole.rotation.x = Math.PI / 2
      rearHole.position.set(x * MM, y * MM, -5.18 * MM)
      group.add(rearHole)

      const innerBore = makeCylinder(0.65, 0.42, materials.cut, 32)
      innerBore.rotation.x = Math.PI / 2
      innerBore.position.set(x * MM, y * MM, -5.02 * MM)
      group.add(innerBore)

      const screwFace = makeScrewHoleMarker()
      screwFace.position.set(x * MM, y * MM, -5.58 * MM)
      group.add(screwFace)
    }
  }

  const rail = makePicatinnyOpenCSlot(35, 9)
  rail.position.y = 0.5 * MM
  group.add(rail)

  withAnnotationSide('front', () => {
    dimensionBar({ x: -17.5, y: -20.8, z: 5.2 }, { x: 17.5, y: -20.8, z: 5.2 }, '正面宽 35 mm', { y: 1 })
    dimensionBar({ x: 20.6, y: -17.5, z: 5.2 }, { x: 20.6, y: 17.5, z: 5.2 }, '正面高 35 mm', { x: -1 })
    label('前面圆孔 Ø16', { x: 0, y: 0, z: 8.7 })
    addPicatinnySlotAnnotations()
  })
  withAnnotationSide('left', () => {
    dimensionBar({ x: -20.2, y: 0, z: -4.5 }, { x: -20.2, y: 0, z: 4.5 }, '外部深度 9 mm', { x: 1 })
  })
  withAnnotationSide('back', () => {
    dimensionBar({ x: -17.5, y: -20.8, z: -7.2 }, { x: 17.5, y: -20.8, z: -7.2 }, '背面宽 35 mm', { y: 1 })
    dimensionBar({ x: -14.9, y: 18.8, z: -3.5 }, { x: -14.9, y: 18.8, z: 3.5 }, '内部高 7 mm', { y: -1 })
    dimensionBar({ x: 16.5, y: 13.8, z: -6.3 }, { x: 17.5, y: 13.8, z: -6.3 }, '壁厚 1 mm', { y: 1 })
    dimensionBar({ x: -6.5, y: usbCenterY - 3.9, z: -7.2 }, { x: 6.5, y: usbCenterY - 3.9, z: -7.2 }, 'USB 宽 13 mm', { y: 1 })
    dimensionBar({ x: 8.5, y: usbCenterY - 2.25, z: -7.2 }, { x: 8.5, y: usbCenterY + 2.25, z: -7.2 }, 'USB 高 4.5 mm', { x: -1 })
    dimensionBar({ x: -17.5, y: usbCenterY + 4.2, z: -7.2 }, { x: -6.5, y: usbCenterY + 4.2, z: -7.2 }, '左 11 mm', { y: -1 })
    dimensionBar({ x: 6.5, y: usbCenterY + 4.2, z: -7.2 }, { x: 17.5, y: usbCenterY + 4.2, z: -7.2 }, '右 11 mm', { y: -1 })
    dimensionBar({ x: -8.8, y: -17.5, z: -7.1 }, { x: -8.8, y: -16.5, z: -7.1 }, '底边 1 mm', { x: 1 })
    callout('USB 13 × 4.5 / 底 1 mm', { x: -12.4, y: -9.2, z: -8.4 })
    callout('4 × 螺丝孔 PM2.0 × 5 mm', { x: 0, y: 15.6, z: -8.2 })
    callout('内部边长 33 × 33 mm', { x: 0, y: 0, z: -8.6 })
  })
  activeAnnotationTarget = labelRoot
  return group
}

function makeRingBody() {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, 17.5 * MM, 0, Math.PI * 2, false)
  shape.holes.push(circlePath(15.5, 128))
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 9 * MM,
    bevelEnabled: true,
    bevelSize: 0.35 * MM,
    bevelThickness: 0.35 * MM,
    bevelSegments: 6,
    curveSegments: 96,
  })
  geometry.center()
  const mesh = new THREE.Mesh(geometry, materials.shell)
  mesh.castShadow = true
  mesh.receiveShadow = true
  addEdges(mesh)
  return mesh
}

function makeRingSaddle() {
  const shape = new THREE.Shape()
  const p = (x, y) => [x * MM, y * MM]

  shape.moveTo(...p(-16.3, 13.2))
  shape.quadraticCurveTo(...p(-15.2, 16.0), ...p(-12.8, 18.55))
  shape.lineTo(...p(-15.0, 19.05))
  shape.lineTo(...p(-15.0, 20.05))
  shape.lineTo(...p(15.0, 20.05))
  shape.lineTo(...p(15.0, 19.05))
  shape.lineTo(...p(12.8, 18.55))
  shape.quadraticCurveTo(...p(15.2, 16.0), ...p(16.3, 13.2))
  shape.lineTo(...p(11.7, 13.2))
  shape.bezierCurveTo(...p(8.0, 15.75), ...p(4.0, 17.0), ...p(0, 17.08))
  shape.bezierCurveTo(...p(-4.0, 17.0), ...p(-8.0, 15.75), ...p(-11.7, 13.2))
  shape.closePath()

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 9 * MM,
    bevelEnabled: true,
    bevelSize: 0.25 * MM,
    bevelThickness: 0.25 * MM,
    bevelSegments: 5,
    curveSegments: 32,
  })
  geometry.translate(0, 0, -4.5 * MM)
  const mesh = new THREE.Mesh(geometry, materials.shell)
  mesh.castShadow = true
  mesh.receiveShadow = true
  addEdges(mesh, 0.2)
  return mesh
}

function createRingModel() {
  const group = new THREE.Group()
  group.name = 'ring'
  activeAnnotationTarget = group

  const ring = makeRingBody()
  group.add(ring)

  const saddle = makeRingSaddle()
  group.add(saddle)

  const rail = makePicatinnyOpenCSlot(35, 9)
  rail.position.y = 0.5 * MM
  group.add(rail)

  for (const x of [-13.4, 13.4]) {
    const shoulderGroove = makeBox(0.55, 5.2, 9.18, materials.cut)
    shoulderGroove.position.set(x * MM, 17.25 * MM, 0)
    shoulderGroove.rotation.z = (x < 0 ? -1 : 1) * 0.28
    group.add(shoulderGroove)
  }

  withAnnotationSide('front', () => {
    dimensionBar({ x: -17.5, y: -21.7, z: 5.4 }, { x: 17.5, y: -21.7, z: 5.4 }, '外径 35 mm', { y: 1 })
    dimensionBar({ x: -15.5, y: -1.2, z: 5.8 }, { x: 15.5, y: -1.2, z: 5.8 }, '内径 31 mm', { y: 1 })
    dimensionBar({ x: 15.5, y: 9.4, z: 5.8 }, { x: 17.5, y: 9.4, z: 5.8 }, '壁厚 2 mm', { y: 1 })
    addPicatinnySlotAnnotations()
  })
  withAnnotationSide('right', () => {
    dimensionBar({ x: 21.2, y: -4.5, z: -4.5 }, { x: 21.2, y: -4.5, z: 4.5 }, '外部深度 9 mm', { x: -1 })
  })
  activeAnnotationTarget = labelRoot
  return group
}

let currentMode = 'case'
let exploded = false
const caseModel = createCaseModel()
const ringModel = createRingModel()
root.add(caseModel, ringModel)

function setMaterialGhost(enabled) {
  root.traverse((node) => {
    if (!node.isMesh || node.material === materials.cut || node.material === materials.brass) return
    node.material = enabled ? materials.shellGhost : materials.shell
  })
}

function updateSpecs(mode) {
  document.querySelector('#specList').innerHTML = specs[mode]
    .map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`)
    .join('')
}

function setMode(mode) {
  currentMode = mode
  document.querySelectorAll('.switcher button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.model === mode)
  })
  updateSpecs(mode)

  caseModel.visible = mode === 'case' || mode === 'both'
  ringModel.visible = mode === 'ring' || mode === 'both'

  if (mode === 'both') {
    caseModel.position.x = exploded ? -1.7 : -1.22
    ringModel.position.x = exploded ? 1.7 : 1.22
    ringModel.position.y = 0
  }
  else {
    caseModel.position.x = 0
    ringModel.position.x = 0
    ringModel.position.y = 0
  }

  fitCamera()
}

function setExploded() {
  exploded = !exploded
  document.querySelector('#explodeView').classList.toggle('is-active', exploded)
  if (currentMode === 'both') setMode('both')
}

function fitCamera() {
  const box = visibleMeshBox()
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  controls.target.copy(center)
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = THREE.MathUtils.degToRad(camera.fov)
  const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.68
  const viewDirection = new THREE.Vector3(1, 0.72, 1.05).normalize()
  camera.position.copy(center).add(viewDirection.multiplyScalar(distance))
  camera.near = Math.max(0.01, distance / 80)
  camera.far = distance * 120
  camera.updateProjectionMatrix()
  controls.update()
}

function setupScene() {
  const key = new THREE.DirectionalLight(0xffffff, 2.6)
  key.position.set(5, 8, 6)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  scene.add(key)

  const fill = new THREE.HemisphereLight(0xeef5ff, 0x8e7f6e, 1.8)
  scene.add(fill)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.ShadowMaterial({ color: 0x111111, opacity: 0.12 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -2.7
  floor.receiveShadow = true
  scene.add(floor)

  const grid = new THREE.GridHelper(8, 32, 0xa69d8c, 0xd6d0c4)
  grid.position.y = -2.69
  scene.add(grid)

  const axes = new THREE.AxesHelper(1.25)
  axes.position.set(-3.2, -2.55, -2.9)
  scene.add(axes)
}

function resize() {
  const { width, height } = viewport.getBoundingClientRect()
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  labelRenderer.setSize(width, height)
}

document.querySelectorAll('.switcher button').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.model))
})

document.querySelector('#ghostToggle').addEventListener('change', (event) => {
  setMaterialGhost(event.target.checked)
})

document.querySelector('#spinToggle').addEventListener('change', (event) => {
  controls.autoRotate = event.target.checked
})

document.querySelector('#labelToggle').addEventListener('change', (event) => {
  labelsVisible = event.target.checked
  labelRenderer.domElement.classList.toggle('is-hidden', !event.target.checked)
  updateAnnotationVisibility()
})

document.querySelector('#resetView').addEventListener('click', fitCamera)
document.querySelector('#explodeView').addEventListener('click', setExploded)
window.addEventListener('resize', resize)

setupScene()
updateSpecs('case')
setMode('case')
resize()

function animate() {
  requestAnimationFrame(animate)
  controls.update()
  updateAnnotationVisibility()
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
}

animate()

window.__viewerDebug = {
  scene,
  camera,
  renderer,
  controls,
  getScaleInMm: (value) => value * SCALE_LABEL,
}
