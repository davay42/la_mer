<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { createNoise3D } from 'simplex-noise'

const props = defineProps({
    size: { type: Number, default: 200 },
    // blobs: [{ color: string, r: number, base: [x,y], colorSens?: number, sizeSens?: number, posSens?: number, speed?: number }]
    blobs: {
        type: Array, default: () => ([
            { color: 'red', r: 80, base: [70, 90] },
            { color: 'yellow', r: 80, base: [130, 110] },
            { color: '#5ac8fa', r: 80, base: [100, 60] },
        ])
    },
})

// internal fallbacks when a blob doesn't specify its own
const DEFAULTS = { posSens: 1.0, sizeSens: 0.15, colorSens: 0.5, speed: 0.00015 }

const noise3D = createNoise3D()
const positions = ref(props.blobs.map(b => ({ cx: b.base[0], cy: b.base[1], r: b.r, op: 0.85 })))
let rafId = 0

function animate(time) {
    props.blobs.forEach((b, i) => {
        const [bx, by] = b.base
        const posSens = b.posSens ?? DEFAULTS.posSens
        const sizeSens = b.sizeSens ?? DEFAULTS.sizeSens
        const colorSens = b.colorSens ?? DEFAULTS.colorSens
        const speed = b.speed ?? DEFAULTS.speed

        const ampPos = 16 * posSens
        const z = time * speed
        const n1 = noise3D(bx * 0.01, by * 0.01, z + i * 0.73) // [-1,1]
        const n2 = noise3D(by * 0.01, bx * 0.01, z + i * 0.73 + 9.17)
        const n3 = noise3D((bx + by) * 0.007, (bx - by) * 0.007, z + i * 0.37 + 3.33)

        positions.value[i].cx = bx + n1 * ampPos
        positions.value[i].cy = by + n2 * ampPos
        const v = (n3 + 1) / 2 // [0,1]
        positions.value[i].r = Math.max(1, b.r * (1 + v * sizeSens)) // sizeSens as a factor, e.g., 0.3 = up to +30% // r is minimum; grows with noise
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
  g(filter="url(#soft)" mask="url(#round)")
    circle(v-for="(b,i) in blobs" :key="i"
           :cx="positions[i].cx" :cy="positions[i].cy" :r="positions[i].r"
           :fill="b.color" :fill-opacity="positions[i].op")
</template>
