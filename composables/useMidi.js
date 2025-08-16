import { WebMidi } from "webmidi";
import { reactive, onMounted, shallowReactive, computed } from 'vue';

import { Chord } from "tonal";
import { Midi } from 'tone'


const inputs = shallowReactive({})
const outputs = shallowReactive({})

const midi = reactive({
  initiated: false,
  enabled: false,
  playing: false,
  stopped: true
})

const midiNote = reactive({
  identifier: 'A4',
  number: 57,
  velocity: 0,
  channel: 1,
  timestamp: 0,
  port: null
})

const activeNotes = reactive({})

const midiLog = shallowReactive([])

export const guessChords = computed(() => {
  const list = Object.entries(activeNotes).filter(([_, v]) => v).map(([n]) => Midi.midiToNoteName(Number(n), { sharps: true }));
  return Chord.detect(list)
})

export function useMidi() {
  if (!midi.initiated) {
    onMounted(() => {
      if (midi.enabled || midi.enabled === null) return
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
    })
  }

  return { midi, inputs, outputs, WebMidi, midiLog, midiNote, activeNotes, guessChords }
}



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
      const { type, note: { number }, velocity, message: { channel }, timestamp, port: { id } } = noteObj
      console.log(noteObj)
      Object.assign(midiNote, {
        identifier: Midi(number).toNote(),
        number,
        velocity: type == 'noteoff' ? 0 : velocity,
        channel,
        timestamp,
        port: id
      })
      activeNotes[number] = type == 'noteoff' ? 0 : velocity
    }

    // controlchange: handleControlChange(input),
    // channelaftertouch: handleMonoAftertouch(input),
    // keyaftertouch: handlePolyAftertouch(input),
    // pitchbend: ev => {     },

  })
  WebMidi.outputs.forEach(output => {
    outputs[output.id] = {
      name: output.name,
      manufacturer: output.manufacturer,
    }
  })
}

