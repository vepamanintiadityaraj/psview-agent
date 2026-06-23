export const LAYERS = { NONE: 0, TORUS_SCENE: 1, BLOOM_SCENE: 2, ENTIRE_SCENE: 3 } as const

export const bgColor = '#02160c'
export const flameColor = '#0aff7f'
export const flameColor2 = '#aef0c0'
export const flameAmt = 0.2
export const atmoColor = '#7affbf'
export const atmoCount = 300
export const atmoSize = 24
export const atmoSpeed = 1.0
export const colorLow = '#02160c'
export const colorHigh = '#34e89a'
export const opacity = 0.26
export const pointSize = 5.5
export const brightness = 0.45
export const waveHeight = 3
export const flow = 1
export const tilt = 0
export const scale = 0.275
export const scrollRise = 1.0
export const camStartY = 7
export const camStartZ = 16
export const camEndY = 0.8
export const camEndZ = -2
export const lookStartZ = 2
export const lookEndZ = -16
export const parallax = 1.2
export const pointerRadius = 7.0
export const pointerStrength = 0.9

export const Lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
