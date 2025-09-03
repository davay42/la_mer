<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { createNoise3D } from 'simplex-noise'

const props = defineProps({
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

// internal fallbacks when a blob doesn't specify its own
const DEFAULTS = { posSens: 1.0, sizeSens: 0.15, colorSens: 0.5, speed: 0.00015 }

const noise3D = createNoise3D()

// helper: values in [0,1] are treated as fractions of the SVG size; >1 are treated as pixels
function toPx(val, S) { return val <= 1 ? val * S : val }

const positions = ref(props.blobs.map(b => {
    const S = props.size ?? 200
    const bx = toPx(b.base[0], S)
    const by = toPx(b.base[1], S)
    const rMin = toPx(b.r, S)
    return { cx: bx, cy: by, r: rMin, op: 0.85 }
}))
let rafId = 0

function animate(time) {
    props.blobs.forEach((b, i) => {
        const S = props.size ?? 200
        const bx = toPx(b.base[0], S)
        const by = toPx(b.base[1], S)
        const posSens = b.posSens ?? DEFAULTS.posSens
        const sizeSens = b.sizeSens ?? DEFAULTS.sizeSens
        const colorSens = b.colorSens ?? DEFAULTS.colorSens
        const speed = b.speed ?? DEFAULTS.speed

        // scale motion amplitude with component size (~8% of size per unit posSens)
        const ampPos = 0.08 * S * posSens
        const z = time * speed
        // normalize inputs so noise pattern is scale-agnostic
        const nx = bx / S
        const ny = by / S
        const n1 = noise3D(nx, ny, z + i * 0.73) // [-1,1]
        const n2 = noise3D(ny, nx, z + i * 0.73 + 9.17)
        const n3 = noise3D((nx + ny) * 0.7, (nx - ny) * 0.7, z + i * 0.37 + 3.33)

        positions.value[i].cx = bx + n1 * ampPos
        positions.value[i].cy = by + n2 * ampPos
        const v = (n3 + 1) / 2 // [0,1]
        const rMin = toPx(b.r, S)
        positions.value[i].r = Math.max(1, rMin * (1 + v * sizeSens)) // r is minimum; grows by percentage
        const op = 0.75 + (v - 0.5) * 0.5 * colorSens
        positions.value[i].op = Math.min(1, Math.max(0, op))
    })
    rafId = requestAnimationFrame(animate)
}

onMounted(() => { rafId = requestAnimationFrame(animate) })
onUnmounted(() => cancelAnimationFrame(rafId))
</script>

<template lang="pug">
svg.rounded-full(:viewBox="`0 0 ${size} ${size}`" :width="size" :height="size")
  defs
    filter#soft(color-interpolation-filters="sRGB")
      feGaussianBlur(stdDeviation="32")
    mask#round
      rect(:width="size" :height="size" fill="black")
      circle(:cx="size/2" :cy="size/2" :r="size*0.99" fill="white")
    // Global post filter: fixed in SVG user space (no jitter), with animated turbulence and generous bounds
    filter#grain(
      color-interpolation-filters="sRGB"
      filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
      :x="-size * 0.25" :y="-size * 0.25" :width="size * 2" :height="size * 2"
    )
      feGaussianBlur(in="SourceGraphic" stdDeviation="10" result="blur")
      feTurbulence(
        type="fractalNoise" baseFrequency="0.02" numOctaves="4" :seed="Math.random()*" stitchTiles="stitch" result="noise"
      )
      feDisplacementMap(in="blur" in2="noise" scale="40" xChannelSelector="R" yChannelSelector="G" result="dist")
      feComposite(in="dist" in2="dist" operator="over")
  g(filter="url(#grain)")
    g(filter="url(#soft)" mask="url(#round)")
      circle(v-for="(b,i) in blobs" :key="i"
             :cx="positions[i].cx" :cy="positions[i].cy" :r="positions[i].r"
             :fill="b.color" :fill-opacity="positions[i].op")
</template>
