<script setup>
import { Sampler, Midi, getTransport, Reverb, PingPongDelay } from 'tone'
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useMIDI } from './src/useMidi'
import Presets from './presets.json'
import GradientCircle from './src/GradientCircle.vue'

let sampler, reverb, delay

const currentPreset = useStorage('sampler-preset', 'string')
const { activeNotes, midiNote, guessChords } = useMIDI()

const loading = ref(false)
const progress = ref(0)
const audioBuffer = ref(null)

watch(midiNote, n => {
  if (!sampler) return
  if (n.velocity > 0) sampler.triggerAttack(Midi(n.number).toNote(), "+0.000000001", n.velocity)
  else sampler.triggerRelease(Midi(n.number).toNote(), "+0.000000001")
})

watch(currentPreset, p => {
  if (!delay) return
  try { sampler?.disconnect(); sampler?.dispose() } catch (e) { }
  sampler = new Sampler(Presets[p]).connect(delay)

})

onMounted(() => {
  reverb = new Reverb({ wet: 0.65, decay: 5.5 }).toDestination()
  delay = new PingPongDelay({ delayTime: '8t', feedback: 0.2, maxDelay: 20, wet: 0.4 }).connect(reverb)
  sampler = new Sampler(Presets[currentPreset.value]).connect(delay)

  getTransport().start()
})

onUnmounted(() => {
})

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


import globes from './globes.yaml'

</script>

<template lang='pug'>
.flex.flex-col.items-center.w-full.h-100svh.justify-center(:style="{backgroundColor: '#EEDDCD'}").text-white
  .p-2.top-4.font-serif.text-8xl.absolute.text-white La Mer

  .p-4.flex.flex-wrap.gap-8.justify-center.items-center.w-full
    .p-12.blur-xl.rounded-full(
      v-for="note in Object.entries(activeNotes).filter(e=>e[1]>0)" 
      :key="note"
      :style="{backgroundColor:`hsl(${30*((note[0]-9)%12)}deg,100%,50%)` }"
      ) {{Midi(note[0]).toNote()}} 

    .flex.items-center.gap-6.flex-wrap.w-full.justify-center
      .p-0.flex.text-center.relative.justify-center.items-center(v-for="globe in globes" :key="globe.name")
        .text-sm.absolute {{globe.name}}
        GradientCircle(:size="200"
          v-bind="globe")


  .p-4.flex.flex-wrap.gap-2.absolute.bottom-4
    .p-4.bg-light-200(v-for="(chord,c) in guessChords" :key="c") {{chord}}
</template>