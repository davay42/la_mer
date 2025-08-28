<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useMIDI } from '../useMidi'

const props = defineProps({ buffer: Object })
const canvas = ref(null)
const { midiNote } = useMIDI()

const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
let rafId = null
let staticCanvas = null
let voices = []

watch(() => props.buffer, (buf) => {
  if (!buf) return
  // pre-render static waveform to offscreen canvas
  const width = Math.max(512, Math.floor((canvas.value?.clientWidth || 800)))
  const height = Math.max(64, Math.floor((canvas.value?.clientHeight || 96)))
  staticCanvas = document.createElement('canvas')
  staticCanvas.width = width
  staticCanvas.height = height
  const sctx = staticCanvas.getContext('2d')
  sctx.clearRect(0, 0, width, height)
  const channel = buf.numberOfChannels ? buf.getChannelData(0) : null
  if (!channel) return
  const samplesPerPixel = Math.max(1, Math.floor(channel.length / width))
  const midY = height / 2
  sctx.fillStyle = '#0ea5b7'
  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPixel
    let min = 1, max = -1
    for (let i = 0; i < samplesPerPixel; i++) {
      const v = channel[start + i]
      if (v !== undefined) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    const y1 = midY + (min * midY)
    const y2 = midY + (max * midY)
    sctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
  }
}, { immediate: true })

watch(midiNote, (n) => {
  if (!props.buffer || !n) return
  const now = audioCtx.currentTime
  const root = 60 // assume sample mapped to C4
  const rate = Math.pow(2, (n.number - root) / 12)
  if (n.velocity > 0) {
    voices.push({ id: `${n.number}-${now}`, note: n.number, start: now, rate, bufferDuration: props.buffer.duration, released: false, stopAt: null })
  } else {
    const v = voices.find(v => v.note === n.number && !v.released)
    if (v) { v.released = true; v.stopAt = audioCtx.currentTime }
  }
})

function render() {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  const w = c.clientWidth || 800
  const h = c.clientHeight || 96
  const dpr = window.devicePixelRatio || 1
  c.width = Math.floor(w * dpr)
  c.height = Math.floor(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0, w, h)

  const now = audioCtx.currentTime
  // draw playheads
  voices.forEach(v => {
    const effectiveEnd = v.released ? v.stopAt : now
    const playedSec = Math.max(0, Math.min(v.bufferDuration, (effectiveEnd - v.start) * v.rate))
    const norm = Math.max(0, Math.min(1, playedSec / v.bufferDuration))
    const x = Math.floor(norm * w)
    ctx.fillStyle = `hsl(${(v.note % 12) * 30} 90% 50%)`
    ctx.fillRect(x - 1, 0, 2, h)
  })

  // cleanup finished voices
  voices = voices.filter(v => {
    if (v.released) {
      const pos = ((v.stopAt - v.start) * v.rate)
      return pos < v.bufferDuration
    }
    const posNow = ((now - v.start) * v.rate)
    return posNow < v.bufferDuration
  })

  rafId = requestAnimationFrame(render)
}

onMounted(() => { rafId = requestAnimationFrame(render) })
onBeforeUnmount(() => { if (rafId) cancelAnimationFrame(rafId) })
</script>

<template lang="pug">
.w-full.max-w-3xl
  canvas(ref="canvas" class="w-full h-24 rounded bg-slate-900")
</template>
