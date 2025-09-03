<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { createNoise3D } from 'simplex-noise'
import { TransitionPresets, useTransition } from '@vueuse/core'

const props = defineProps({
  name: { type: String, default: '' },
  active: { type: Boolean, default: false },
  size: { type: Number, default: 200 },
  // blobs: [{ color: string, r: number|0..1, base: [x,y]|[0..1,0..1], colorSens?: number, sizeSens?: number, posSens?: number, speed?: number }]
  blobs: {
    type: Array, default: () => ([
      { color: 'red', r: 0.4, base: [0.35, 0.45] },
      { color: 'yellow', r: 0.4, base: [0.65, 0.55] },
      { color: '#5ac8fa', r: 0.4, base: [0.5, 0.3] },
    ])
  },
})

const activity = useTransition
  (computed(() => props.active ? 1 : 0), {
    duration: 500,
    transition: TransitionPresets.easeInOutCubic,
  })

// internal fallbacks when a blob doesn't specify its own
const DEFAULTS = { posSens: 1.0, sizeSens: 0.15, colorSens: 0.5, speed: 0.00025 }

const noise3D = createNoise3D()

function toPx(val, S) { return val <= 1 ? val * S : val }

const positions = ref(props.blobs.map(b => {
  const S = props.size ?? 200
  const bx = toPx(b.base[0], S)
  const by = toPx(b.base[1], S)
  const rMin = toPx(b.r, S)
  return { cx: bx, cy: by, r: rMin, op: 1 }
}))
// smoothed bases that gently ease to new props values (to avoid jumps)
const bases = ref(props.blobs.map(b => {
  const S = props.size ?? 200
  return { bx: toPx(b.base[0], S), by: toPx(b.base[1], S), rBase: toPx(b.r, S) }
}))
let rafId = 0
let lastTime = 0

function animate(time) {
  const dt = lastTime ? Math.min(1 / 15, (time - lastTime) / 1000) : 0 // cap dt to avoid large jumps
  lastTime = time
  // slow circular motion for turbulence (shared angle, different radii)
  const a = time * 0.002
  turb.value.mx = Math.cos(a) * 25 * activity.value
  turb.value.my = Math.sin(a) * 25 * activity.value
  turb.value.gx = Math.cos(a + Math.PI / 2) * 12 * activity.value
  turb.value.gy = Math.sin(a + Math.PI / 2) * 12 * activity.value
  props.blobs.forEach((b, i) => {
    const S = props.size ?? 200

    // ensure array slots exist if blobs length changes dynamically
    if (!positions.value[i]) positions.value[i] = { cx: S / 2, cy: S / 2, r: 1, op: 1 }
    if (!bases.value[i]) bases.value[i] = { bx: S / 2, by: S / 2, rBase: 1 }

    const targetBx = toPx(b.base[0], S)
    const targetBy = toPx(b.base[1], S)
    const targetR = toPx(b.r, S)

    const posSens = b.posSens ?? DEFAULTS.posSens
    const sizeSens = b.sizeSens ?? DEFAULTS.sizeSens
    const colorSens = b.colorSens ?? DEFAULTS.colorSens
    const speed = b.speed ?? DEFAULTS.speed

    // ease bases toward targets using exponential smoothing (6 Hz natural response)
    const lerpHz = 6
    const k = dt ? (1 - Math.exp(-lerpHz * dt)) : 1
    bases.value[i].bx += (targetBx - bases.value[i].bx) * k
    bases.value[i].by += (targetBy - bases.value[i].by) * k
    bases.value[i].rBase += (targetR - bases.value[i].rBase) * k

    // scale motion amplitude with component size (~ per unit posSens)
    const ampPos = S * posSens * 0.08
    const z = time * speed

    // normalize inputs so noise pattern is scale-agnostic
    const nx = bases.value[i].bx / S
    const ny = bases.value[i].by / S

    const n1 = noise3D(nx, ny, z + i) // [-1,1]
    const n2 = noise3D(ny, nx, z + i + 50)
    const n3 = noise3D((nx + ny) * 0.5, (nx - ny) * 0.5, z + i * 0.37 + 3.33)

    positions.value[i].cx = bases.value[i].bx + n1 * ampPos
    positions.value[i].cy = bases.value[i].by + n2 * ampPos

    const v = (n3 + 1) / 2 // [0,1]
    positions.value[i].r = Math.max(1, bases.value[i].rBase * (1 + v * sizeSens))
    const op = 0.75 + (v - 0.5) * 0.5 * colorSens
    positions.value[i].op = Math.min(1, Math.max(0, op))
  })
  rafId = requestAnimationFrame(animate)
}



onMounted(() => {
  const n1 = noise3D(1, 4, Date.now())
  console.log(n1)
  rafId = requestAnimationFrame(animate)
})
onUnmounted(() => cancelAnimationFrame(rafId))

const grainSeed = ref(Math.floor(Math.random() * 10000))
const seed = ref(Math.floor(Math.random() * 10000))
const turb = ref({ mx: 0, my: 0, gx: 0, gy: 0 })

// keep internal arrays in sync with variable-length blobs
watch(() => props.blobs, (blobs) => {
  const S = props.size ?? 200
  // trim/extend positions to exactly match blobs length
  const newPositions = blobs.map((b, i) => {
    const prev = positions.value[i]
    if (prev) return prev
    return {
      cx: toPx(b.base[0], S),
      cy: toPx(b.base[1], S),
      r: Math.max(1, toPx(b.r, S)),
      op: 1,
    }
  })
  positions.value = newPositions

  const newBases = blobs.map((b, i) => {
    const prev = bases.value[i]
    if (prev) return prev
    return {
      bx: toPx(b.base[0], S),
      by: toPx(b.base[1], S),
      rBase: toPx(b.r, S),
    }
  })
  bases.value = newBases
}, { deep: true })

watch(activity, a => {
  if (a == 0) { seed.value = Math.floor(Math.random() * 10000) }
})

watch(() => props.name, () => {
  grainSeed.value = Math.floor(Math.random() * 10000)
  seed.value = Math.floor(Math.random() * 10000)
})
</script>

<template lang="pug">
svg.scale-120(:viewBox="`0 0 ${size} ${size}`" :width="size" :height="size")
  defs
    filter#soft(color-interpolation-filters="sRGB")
      feGaussianBlur(stdDeviation="62")

    
    filter#maskDistort(color-interpolation-filters="sRGB" 
      filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
      :x="-size * 0.25" :y="-size * 0.25" :width="size * 1.5" :height="size * 1.5")
      feTurbulence(type="fractalNoise" :baseFrequency="0.005*activity"  numOctaves="1" :seed result="noise")
      feOffset(in="noise" :dx="turb.mx" :dy="turb.my" result="noiseShifted")
      feDisplacementMap(in="SourceGraphic" in2="noiseShifted" :scale="activity * 60" xChannelSelector="R" yChannelSelector="G")
    mask#round
      rect(:width="size" :height="size" fill="black")
      // Apply the distortion filter to the white mask circle
      circle(:cx="size/2" :cy="size/2" :r="size/2-40+activity*20" fill="white" filter="url(#maskDistort)")
    
    filter#grain(
      color-interpolation-filters="sRGB"
      filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
      :x="-size * 0.25" :y="-size * 0.25" :width="size * 1.5" :height="size * 1.5"
      )
      feGaussianBlur(in="SourceGraphic" stdDeviation="10" result="blur")
      feTurbulence(type="fractalNoise" baseFrequency="0.015" numOctaves="4" :seed="grainSeed" stitchTiles="stitch" result="noise")
      feOffset(in="noise" :dx="turb.gx" :dy="turb.gy" result="noiseShifted")
      feDisplacementMap(in="blur" in2="noiseShifted" scale="45" xChannelSelector="R" yChannelSelector="G" result="dist")
      feComposite(in="dist" in2="dist" operator="over")
  g(filter="url(#grain)"  mask="url(#round)")
    g(filter="url(#soft)")
      circle(v-for="(b,i) in blobs" :key="i"
             :cx="positions[i].cx" :cy="positions[i].cy" :r="positions[i].r"
             :fill="b.color" :fill-opacity="positions[i].op"
             style="transition: fill 2000ms ease, fill-opacity 2000ms ease")
</template>
