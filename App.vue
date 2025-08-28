<script setup>
import { Sampler, Midi, getTransport, Reverb, PingPongDelay } from 'tone'
import { ref, onMounted, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useMIDI } from './src/useMidi'
import Presets from './presets.json'
import Waveform from './src/components/Waveform.vue'

let sampler, reverb, delay

const currentPreset = useStorage('sampler-preset', 'string')
const { activeNotes, midiNote, guessChords } = useMIDI()

const loading = ref(false)
const progress = ref(0)
const waveRef = ref(null)
const audioBuffer = ref(null)

function drawWaveform(canvas, audioBuffer, opts = {}) {
  if (!canvas || !audioBuffer) return
  const dpr = window.devicePixelRatio || 1
  const width = Math.max(256, canvas.clientWidth)
  const height = opts.height || Math.max(64, canvas.clientHeight || 96)
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  const channel = audioBuffer.numberOfChannels ? audioBuffer.getChannelData(0) : null
  if (!channel) return

  const samplesPerPixel = Math.max(1, Math.floor(channel.length / width))
  const midY = height / 2

  // background
  ctx.fillStyle = opts.bg || 'transparent'
  ctx.fillRect(0, 0, width, height)

  // waveform
  ctx.fillStyle = opts.fill || '#06b6d4'
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
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
  }
}

watch(midiNote, n => {
  if (!sampler) return
  if (n.velocity > 0) sampler.triggerAttack(Midi(n.number).toNote(), "+0.000000001", n.velocity)
  else sampler.triggerRelease(Midi(n.number).toNote(), "+0.000000001")
})

watch(currentPreset, p => {
  if (!delay) return
  try { sampler?.disconnect(); sampler?.dispose() } catch (e) { }
  sampler = new Sampler(Presets[p]).connect(delay)
  // draw waveform for the preset sample (first url in preset)
  loadPresetWaveform(p)
})

onMounted(() => {
  reverb = new Reverb({ wet: 0.45, decay: 4.5 }).toDestination()
  delay = new PingPongDelay({ delayTime: '8t', feedback: 0.1, maxDelay: 10, wet: 0.3 }).connect(reverb)
  sampler = new Sampler(Presets[currentPreset.value]).connect(delay)
  // render waveform for current preset
  loadPresetWaveform(currentPreset.value)
  getTransport().start()
})

async function loadPresetWaveform(presetKey) {
  try {
    const preset = Presets[presetKey]
    if (!preset || !preset.urls) return
    const files = Object.values(preset.urls)
    if (!files.length) return
    const filename = files[0]
    const base = preset.baseUrl || ''
    const url = base + filename
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`fetch ${url} failed: ${resp.status}`)
    const arr = await resp.arrayBuffer()
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    audioBuffer.value = await audioCtx.decodeAudioData(arr)
    requestAnimationFrame(() => drawWaveform(waveRef.value, audioBuffer.value, { fill: '#06b6d4' }))
  } catch (err) {
    // don't block the app for missing preset assets
    console.warn('unable to load preset waveform', presetKey, err)
  }
}

// load a single sample file with a visible progress bar and app lock
async function onFile(e) {
  const file = (e.target.files && e.target.files[0])
  if (!file) return
  loading.value = true
  progress.value = 0
  try {
    const reader = new FileReader()
    reader.onprogress = (ev) => { if (ev.lengthComputable) progress.value = ev.loaded / ev.total }
    const buffer = await new Promise((res, rej) => {
      reader.onerror = () => rej(reader.error)
      reader.onload = () => res(reader.result)
      reader.readAsArrayBuffer(file)
    })

    // decode using a temporary AudioContext then hand AudioBuffer to Tone.Sampler
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    audioBuffer.value = await audioCtx.decodeAudioData(buffer)

    // replace sampler with one that uses the uploaded buffer (mapped to C4)
    try { sampler?.disconnect(); sampler?.dispose() } catch (e) { }
    sampler = new Sampler({ 'C4': audioBuffer.value }, () => { progress.value = 1; loading.value = false }).connect(delay)
    // draw waveform
    requestAnimationFrame(() => drawWaveform(waveRef.value, audioBuffer.value, { fill: '#06b6d4' }))
  } catch (err) {
    console.error('sample load error', err)
    loading.value = false
    progress.value = 0
  }
}

// load a sample from a user-provided URL (prompt)
async function onLoadUrl() {
  const url = window.prompt('Enter sample URL (http(s)://...)')
  if (!url) return
  loading.value = true
  progress.value = 0
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`)

    // attempt to stream and report progress
    const contentLength = resp.headers.get('content-length')
    if (!resp.body) throw new Error('ReadableStream not supported')
    const reader = resp.body.getReader()
    const chunks = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length || value.byteLength || 0
      if (contentLength) progress.value = received / Number(contentLength)
    }
    const buffer = concatUint8(chunks)

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    audioBuffer.value = await audioCtx.decodeAudioData(buffer.buffer || buffer)

    try { sampler?.disconnect(); sampler?.dispose() } catch (e) { }
    sampler = new Sampler({ 'C4': audioBuffer.value }, () => { progress.value = 1; loading.value = false }).connect(delay)
    // draw waveform
    requestAnimationFrame(() => drawWaveform(waveRef.value, audioBuffer.value, { fill: '#06b6d4' }))
  } catch (err) {
    console.error('URL load error', err)
    loading.value = false
    progress.value = 0
  }
}

function concatUint8(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

</script>

<template lang='pug'>
.flex.flex-col.items-center.w-full.h-100svh.justify-center
  .p-2.text-4xl.absolute.top-4 Sampler Experiment

  // presets
  .p-4.flex.flex-wrap.gap-2.absolute.top-16
    button.p-4.rounded.shadow-lg.hover-brightness-110.bg-light-200(v-for="(preset,p) in Presets" :key="preset" @click="currentPreset = p" :class="{'invert':currentPreset==p}") {{p}}

  // file input (hidden) + label as button
  .absolute.bottom-4.right-4.flex.items-center.gap-2
    label.p-4.bg-blue-500.text-white.rounded.cursor-pointer
      | Load sample
      input(type='file' accept='.wav,.mp3,.ogg' @change='onFile' hidden)
    button.p-4.bg-emerald-500.text-white.rounded(@click='onLoadUrl') Load URL

  button.p-4.bg-red.absolute.z-100.hover-brightness-120.transition(@pointerdown="Object.assign(midiNote, {number:69, velocity: 1, channel: 0, timestamp: Date.now(), port: 'UI'});activeNotes[69] = 1" @pointerup="midiNote.velocity=0;activeNotes[69] = 0" @pointercancel="midiNote.velocity=0;activeNotes[69] = 0") Play note A

  .p-4.flex.flex-wrap.gap-8.justify-center.items-center
    .p-12.blur-xl.rounded-full(
      v-for="note in Object.entries(activeNotes).filter(e=>e[1]>0)" 
      :key="note"
      :style="{backgroundColor:`hsl(${30*((note[0]-9)%12)}deg,100%,50%)` }"
      ) {{Midi(note[0]).toNote()}} 

  // waveform component
  .w-full.p-4.mt-4.flex.justify-center.absolute
    Waveform(:buffer="audioBuffer")

  .p-4.flex.flex-wrap.gap-2.absolute.bottom-4
    .p-4.bg-light-200(v-for="(chord,c) in guessChords" :key="c") {{chord}}

  // loading overlay + progress
  .absolute.inset-0.z-50.flex.items-center.justify-center.top-0.left-0.right-0.h-10(v-if="loading")
    .absolute.inset-0.bg-dark-50
    .w-11.max-w-lg.bg-white.rounded-lg.p-6.shadow-lg.pointer-events-auto
      .text-lg.font-medium.mb-3 Loading sample...
      .w-full.h-3.bg-slate-200.rounded.overflow-hidden
        .h-full.bg-gradient-to-r.from-blue-500.to-teal-400(:style="{ width: (progress*100)+'%' }")
      .text-sm.mt-2 {{ Math.round(progress*100) }}%
</template>