import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js'
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'
import {
  LAYERS, bgColor, flameColor, flameColor2, flameAmt, atmoColor, atmoCount, atmoSize, atmoSpeed,
  colorLow, colorHigh, opacity, pointSize, brightness, waveHeight, flow, tilt, scale, scrollRise,
  camStartY, camStartZ, camEndY, camEndZ, lookStartZ, lookEndZ, parallax, pointerRadius, pointerStrength,
  Lerp, clamp,
} from './constants'
import {
  SNOISE, pointsVertexShader, pointsFragmentShader,
  finalPassVertexShader, finalPassFragmentShader,
  atmoVertexShader, atmoFragmentShader,
} from './shaders'

function hexToVec3(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export type FlowWaveOptions = {
  getScrollTarget?: () => number
  useDocumentScroll?: boolean
}

export function initFlowWave(canvas: HTMLCanvasElement, options: FlowWaveOptions = {}) {
  const { getScrollTarget, useDocumentScroll = false } = options

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.VSMShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  scene.fog = new THREE.Fog(0x000000, 0, 15)

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400)
  camera.position.set(0, camStartY, camStartZ)
  camera.layers.enable(LAYERS.TORUS_SCENE)
  camera.layers.enable(LAYERS.BLOOM_SCENE)
  camera.layers.enable(LAYERS.ENTIRE_SCENE)
  scene.add(camera)

  const group = new THREE.Group()
  scene.add(group)

  const geo = new THREE.SphereGeometry(4.2, 200, 600)
  const uniforms = {
    uTime: { value: 0 },
    uStream: { value: 0 },
    uAppear: { value: 0 },
    uColLow: { value: hexToVec3(colorLow) },
    uColHigh: { value: hexToVec3(colorHigh) },
    uOpacity: { value: opacity },
    uSize: { value: pointSize },
    uBrightness: { value: brightness },
    uWaveHeight: { value: waveHeight },
    uFlow: { value: flow },
    uScale: { value: scale },
    uCursor: { value: new THREE.Vector3() },
    uRepelRadius: { value: pointerRadius },
    uRepelStrength: { value: pointerStrength },
    uActivity: { value: 0 },
  }

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: pointsVertexShader(SNOISE),
    fragmentShader: pointsFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.layers.enable(LAYERS.TORUS_SCENE)
  points.layers.enable(LAYERS.BLOOM_SCENE)
  points.layers.enable(LAYERS.ENTIRE_SCENE)
  group.add(points)

  // Ambient motes
  const N = Math.round(atmoCount)
  const positions = new Float32Array(N * 3)
  const sizes = new Float32Array(N)
  const seeds = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    positions[i * 3] = 2 * Math.random() - 1
    positions[i * 3 + 1] = 2 * Math.random() - 1
    positions[i * 3 + 2] = 2 * Math.random() - 1
    sizes[i] = atmoSize * (0.4 + Math.random())
    seeds[i] = Math.random()
  }
  const atmoGeo = new THREE.BufferGeometry()
  atmoGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  atmoGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  atmoGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: hexToVec3(atmoColor) },
      uRes: { value: new THREE.Vector2(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio) },
    },
    vertexShader: atmoVertexShader,
    fragmentShader: atmoFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  })

  const atmoPts = new THREE.Points(atmoGeo, atmoMat)
  atmoPts.frustumCulled = false
  atmoPts.layers.enable(LAYERS.TORUS_SCENE)
  atmoPts.layers.enable(LAYERS.BLOOM_SCENE)
  atmoPts.layers.enable(LAYERS.ENTIRE_SCENE)
  scene.add(atmoPts)

  const haloTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat)
  haloTexture.needsUpdate = true

  const renderPass = new RenderPass(scene, camera)

  const torusComposer = new EffectComposer(renderer)
  torusComposer.renderToScreen = false
  torusComposer.addPass(renderPass)
  torusComposer.addPass(new ShaderPass(GammaCorrectionShader))
  torusComposer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.2, 0))
  torusComposer.addPass(new ShaderPass(CopyShader))

  const bloomComposer = new EffectComposer(renderer)
  bloomComposer.renderToScreen = false
  bloomComposer.addPass(renderPass)
  bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.55, 0))
  bloomComposer.addPass(new ShaderPass(GammaCorrectionShader))

  const finalPass = new ShaderPass({
    uniforms: {
      iTime: { value: 0 },
      tDiffuse: { value: null },
      torusTexture: { value: null },
      bloomTexture: { value: null },
      haloTexture: { value: haloTexture },
      uBg: { value: hexToVec3(bgColor) },
      uFlameA: { value: hexToVec3(flameColor) },
      uFlameB: { value: hexToVec3(flameColor2) },
      uFlameAmt: { value: flameAmt },
    },
    vertexShader: finalPassVertexShader,
    fragmentShader: finalPassFragmentShader,
  })
  finalPass.uniforms.bloomTexture.value = bloomComposer.renderTarget1.texture
  finalPass.uniforms.torusTexture.value = torusComposer.renderTarget1.texture

  const finalComposer = new EffectComposer(renderer)
  finalComposer.addPass(renderPass)
  finalComposer.addPass(finalPass)

  atmoPts.onBeforeRender = () => {
    const t = performance.now() / 1000
    atmoMat.uniforms.uTime.value = t * atmoSpeed * 8.0
    atmoPts.position.copy(camera.position)
    finalPass.uniforms.iTime.value = t
  }

  let scrollTarget = 0
  let scrollSmooth = 0
  let scrollCurrent = 0
  const mouseTarget = { x: 0, y: 0 }
  const mouse = { x: 0, y: 0 }
  const POINTER = {
    world: new THREE.Vector3(),
    activity: 0,
    active: false,
    lastMove: performance.now(),
  }

  const _ndc = new THREE.Vector3()
  const _dir = new THREE.Vector3()
  const _tgt = new THREE.Vector3()

  function updatePointerWorld() {
    _tgt.set(0, 0, 0)
    if (POINTER.active) {
      _ndc.set(mouse.x, mouse.y, 0.5).unproject(camera)
      _dir.copy(_ndc).sub(camera.position).normalize()
      const dn = _dir.z
      if (Math.abs(dn) > 1e-4) {
        const tt = -camera.position.z / dn
        if (tt > 0 && Number.isFinite(tt)) _tgt.copy(camera.position).addScaledVector(_dir, tt)
      }
    }
    POINTER.world.lerp(_tgt, 0.12)
    const idle = (performance.now() - POINTER.lastMove) / 1000
    POINTER.activity += (((POINTER.active && idle < 3) ? 1 : 0) - POINTER.activity) * 0.06
  }

  let stream = 0
  const appearStart = performance.now()
  let t0 = performance.now() / 1000

  function renderScene(scroll: number, m: { x: number; y: number }) {
    const t = performance.now() / 1000
    const dt = Math.min(0.05, t - t0)
    t0 = t
    uniforms.uTime.value = t

    stream += dt * (flow * 2.0) * 4.0
    uniforms.uStream.value = stream
    uniforms.uWaveHeight.value = waveHeight * (1 + scroll * scrollRise)

    const ea = Math.min(scroll / 0.35, 1.0)
    const e = ea * ea * (3 - 2 * ea)
    const camY = Lerp(camStartY, camEndY, e)
    const camZ = Lerp(camStartZ, camEndZ, e)
    camera.position.set(m.x * parallax, camY + m.y * parallax * 0.3, camZ)
    camera.lookAt(m.x * parallax * 0.5, Lerp(0.0, 0.6, e), Lerp(lookStartZ, lookEndZ, e))
    group.rotation.x = -tilt
    group.rotation.y = 0
    updatePointerWorld()

    uniforms.uCursor.value.copy(POINTER.world)
    uniforms.uActivity.value = POINTER.activity
    const elapsed = (performance.now() - appearStart) / 1000
    uniforms.uAppear.value = Math.max(0, Math.min(1, (elapsed - 0.2) / 1.4))
  }

  function onScroll() {
    if (useDocumentScroll) {
      const max = document.documentElement.scrollHeight - window.innerHeight
      scrollTarget = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0
    }
  }

  function onMouseMove(e: MouseEvent) {
    mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1
    mouseTarget.y = -((e.clientY / window.innerHeight) * 2 - 1)
    POINTER.active = true
    POINTER.lastMove = performance.now()
  }

  function onMouseOut() {
    POINTER.active = false
  }

  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    const dpr = window.devicePixelRatio
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    torusComposer.setPixelRatio(dpr)
    torusComposer.setSize(w, h)
    bloomComposer.setPixelRatio(dpr)
    bloomComposer.setSize(w, h)
    finalComposer.setPixelRatio(dpr)
    finalComposer.setSize(w, h)
    atmoMat.uniforms.uRes.value.set(w * dpr, h * dpr)
    onScroll()
  }

  if (useDocumentScroll) {
    window.addEventListener('scroll', onScroll, { passive: true })
  }
  window.addEventListener('mousemove', onMouseMove, { passive: true })
  window.addEventListener('mouseout', onMouseOut)
  window.addEventListener('resize', resize)
  resize()

  let raf = 0
  function loop() {
    raf = requestAnimationFrame(loop)

    if (getScrollTarget) {
      scrollTarget = getScrollTarget()
    }

    scrollSmooth = Lerp(scrollSmooth, scrollTarget, 0.10)
    scrollCurrent = Lerp(scrollCurrent, scrollSmooth, 0.06)
    mouse.x = Lerp(mouse.x, mouseTarget.x, 0.06)
    mouse.y = Lerp(mouse.y, mouseTarget.y, 0.06)

    renderScene(scrollCurrent, mouse)

    camera.layers.set(LAYERS.TORUS_SCENE)
    torusComposer.render()
    camera.layers.set(LAYERS.BLOOM_SCENE)
    bloomComposer.render()
    camera.layers.set(LAYERS.ENTIRE_SCENE)
    finalComposer.render()
  }
  loop()

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseout', onMouseOut)
    window.removeEventListener('resize', resize)
    geo.dispose()
    mat.dispose()
    atmoGeo.dispose()
    atmoMat.dispose()
    renderer.dispose()
  }
}
