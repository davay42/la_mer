import { reactive, onMounted, shallowReactive, computed, watch } from 'vue';
import { WebMidi } from "webmidi";
import { Chord } from "tonal";
import { loaded, Midi } from 'tone'

import { useStorage } from '@vueuse/core'
import { useClamp } from '@vueuse/math';

import noteKeys from './noteKeys.json'

export const inputs = shallowReactive({})
export const outputs = shallowReactive({})
export const activeNotes = reactive({})
export const midiLog = shallowReactive([])

export const keyOffset = useClamp(0, -2, 2)

export const midi = reactive({
  initiated: false,
  enabled: false,
  playing: false,
  stopped: true
})

export const midiNote = reactive({
  number: 57,
  velocity: 0,
  channel: 1,
  timestamp: 0,
  port: null
})

export const guessChords = computed(() => {
  const list = Object.entries(activeNotes).filter(([_, v]) => v).map(([n]) => Midi(Number(n)).toNote());
  return Chord.detect(list)
})

export function initMidi() {
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

export function useMIDI() {

  if (!midi.initiated) {
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
  }

  return {
    inputs, outputs, init: initMidi, guessChords, midi, midiLog, midiNote, activeNotes, keyOffset
  }

}