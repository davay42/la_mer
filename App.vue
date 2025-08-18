<script setup vapor>
import { Sampler, loaded, Midi, PolySynth, getTransport, Reverb, PingPongDelay } from 'tone'
import { reactive, onMounted, shallowReactive, computed, watch } from 'vue';
import { useStorage } from '@vueuse/core'
import { useClamp } from '@vueuse/math';
import { WebMidi } from "webmidi";
import { Chord } from "tonal";

import noteKeys from './noteKeys.json'
import Presets from './presets.json'

let sampler, reverb, delay;

const inputs = shallowReactive({})
const outputs = shallowReactive({})

const activeNotes = reactive({})
const midiLog = shallowReactive([])

const midi = reactive({
  initiated: false,
  enabled: false,
  playing: false,
  stopped: true
})

const midiNote = reactive({
  number: 57,
  velocity: 0,
  channel: 1,
  timestamp: 0,
  port: null
})

const keyOffset = useClamp(2, 0, 4)
const currentPreset = useStorage('sampler-preset', 'string')

const guessChords = computed(() => {
  const list = Object.entries(activeNotes).filter(([_, v]) => v).map(([n]) => Midi(Number(n)).toNote());
  return Chord.detect(list)
})


function initMidi() {
  WebMidi.inputs.forEach(input => {
    inputs[input.id] = {
      name: input.name,
      manufacturer: input.manufacturer,
      event: null
    }

    input.removeListener()

    input.addListener('start', () => { midi.playing = true; midi.stopped = false; })
    input.addListener('stop', () => { midi.playing = false; midi.stopped = Date.now(); })
    input.addListener('midimessage', ev => {
      if (ev?.message?.type === "clock") return
      const { timestamp, message } = ev
      inputs[input.id].message = message
      midiLog.unshift({ timestamp, message })
      if (midiLog.length > 100) midiLog.pop()
    })
    input.addListener('noteon', onNote)
    input.addListener('noteoff', onNote)

    function onNote(noteObj) {
      let { type, note: { number }, velocity, message: { channel }, timestamp, port: { id } } = noteObj
      number = number + keyOffset.value * 12
      Object.assign(midiNote, {
        number,
        velocity: type == 'noteoff' ? 0 : velocity,
        channel,
        timestamp,
        port: id
      })
      activeNotes[number] = type == 'noteoff' ? 0 : velocity
    }
  })
  WebMidi.outputs.forEach(output => {
    outputs[output.id] = {
      name: output.name,
      manufacturer: output.manufacturer,
    }
  })
}

watch(midiNote, n => {
  if (n.velocity > 0) {
    sampler.triggerAttack(Midi(n.number).toNote(), "+0.000000001", n.velocity);
  } else {
    sampler.triggerRelease(Midi(n.number).toNote(), "+0.000000001")
  }
})

watch(currentPreset, p => {
  sampler.disconnect()
  sampler.dispose()
  sampler = new Sampler(Presets[p]).connect(delay);
})


onMounted(() => {

  WebMidi.enable().then(() => {
    initMidi()
    WebMidi.addListener("connected", initMidi)
    WebMidi.addListener("disconnected", e => {
      if (e.port.type == 'input') {
        delete inputs[e.port.id]
      } else if (e.port.type == 'output') {
        delete outputs[e.port.id]
      }
    })
    midi.enabled = true
  }).catch(e => midi.enabled = null)
    .finally(midi.initiated = true)

  reverb = new Reverb({ wet: 0.45, decay: 4.5 }).toDestination()
  delay = new PingPongDelay({
    delayTime: '8t',
    feedback: 0.1,
    maxDelay: 10,
    wet: 0.3
  }).connect(reverb)


  sampler = new Sampler(Presets[currentPreset.value]).connect(delay);

  const transport = getTransport()
  transport.start()

  document.addEventListener('keydown', e => {
    if (e.code == 'Digit1') keyOffset.value--
    if (e.code == 'Equal') keyOffset.value++
    if (e.repeat || !noteKeys[e.code]) return
    if (e.ctrlKey || e.altKey || e.metaKey) return
    if (e.code == 'Slash') e.preventDefault()
    const number = noteKeys[e.code] + keyOffset.value * 12
    Object.assign(midiNote, {
      number,
      velocity: 1,
      channel: 0,
      timestamp: Date.now(),
      port: 'keyboard'
    })
    activeNotes[number] = 1
  })

  document.addEventListener('keyup', e => {
    if (!noteKeys[e.code]) return
    const number = noteKeys[e.code] + keyOffset.value * 12
    Object.assign(midiNote, {
      number,
      velocity: 0,
      channel: 0,
      timestamp: Date.now(),
      port: 'keyboard'
    })
    activeNotes[number] = 0
  })
})


</script>

<template lang='pug'>
.flex.flex-col.items-center.w-full.h-100svh.justify-center
  .p-2.text-4xl.absolute.top-4 Sampler Experiment
  .p-4.flex.flex-wrap.gap-2.absolute.top-16
    button.p-4.rounded.shadow-lg.hover-brightness-110.bg-light-200(v-for="(preset,p) in Presets" :key="preset" @click="currentPreset = p" :class="{'invert':currentPreset==p}") {{p}}
  button.p-4.bg-red.absolute.z-100.hover-brightness-120.transition(@pointerdown="Object.assign(midiNote, {number:69+keyOffset * 12,      velocity: 1, channel: 0, timestamp: Date.now(), port: 'UI'});activeNotes[69+keyOffset * 12] = 1" @pointerup="midiNote.velocity=0;activeNotes[69+keyOffset * 12] = 0" @pointercancel="midiNote.velocity=0;activeNotes[69+keyOffset * 12] = 0") Play note A
  .p-4.flex.flex-wrap.gap-8.justify-center.items-center
    .p-12.blur-xl.rounded-full(
      v-for="note in Object.entries(activeNotes).filter(e=>e[1]>0)" 
      :key="note"
      :style="{backgroundColor:`hsl(${30*((note[0]-9)%12)}deg,100%,50%)`}"
      ) {{Midi(note[0]).toNote()}} 
  .p-4.flex.flex-wrap.gap-2.absolute.bottom-4
    .p-4.bg-light-200(v-for="(chord,c) in guessChords" :key="c") {{chord}}
</template>