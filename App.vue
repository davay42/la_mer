<script setup>
import { Midi } from 'tone'
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useMIDI } from './src/useMidi'
import GradientCircle from './src/GradientCircle.vue'
import { useSampler } from './src/useSampler'
import { createNoise3D } from 'simplex-noise'

import globes from './src/globes.yaml'
const currentGlobe = ref(globes[0])

const { sampler, presets, currentPreset, loading, progress, audioBuffer, params, selectPreset, loadFile, loadUrl, triggerAttack, triggerRelease } = useSampler()

const { activeNotes, midiNote, guessChords, inputs } = useMIDI()

watch(midiNote, n => {
  if (n.velocity > 0) triggerAttack(Midi(n.number).toNote(), "+0.000000001", n.velocity)
  else triggerRelease(Midi(n.number).toNote(), "+0.000000001")
})



const globeWithNotes = computed(() => {
  return {
    ...currentGlobe.value,
    blobs: [
      ...currentGlobe.value.blobs,
      ...Object.entries(activeNotes).filter(e => e[1] > 0).map(e => ({
        color: `hsla(${30 * ((e[0] - 9) % 12)}deg,50%,50%,${Math.random() * 0.1 + 0.05})`,
        r: Math.random() * 0.3 + 0.3,
        base: [Math.random(), Math.random()],
        posSens: 0.8,
        sizeSens: .15,
        colorSens: 0.5,
        speed: 0.00025
      })),

    ]
  }
})

import { TransitionPresets, useTransition } from '@vueuse/core'


const seed = ref(Math.floor(Math.random() * 10000))
const turb = ref({ x: 0, y: 0, r: 0 })
const active = computed(() => Object.entries(activeNotes).filter(e => e[1] > 0).length ? 1 : 0)
const smoothActive = useTransition(active, {
  duration: 2000,
  transition: TransitionPresets.easeInOutSine,
})

let rafId = 0
let lastTime = 0

const noise3D = createNoise3D()

function animate(time) {
  const dt = lastTime ? Math.min(1 / 15, (time - lastTime) / 1000) : 0 // cap dt to avoid large jumps
  lastTime = time
  const tz = time * 0.000015
  turb.value.x = noise3D(0.13, 0.57, tz) * smoothActive.value
  turb.value.y = noise3D(10, 20, tz) * smoothActive.value
  turb.value.z = noise3D(30, 40, tz) * smoothActive.value
  turb.value.r = ((noise3D(60, 40, tz) + 1) / 2) * smoothActive.value
  rafId = requestAnimationFrame(animate)
}

onMounted(() => {
  rafId = requestAnimationFrame(animate)
  novis.value = window.location.hash == '#novis'
})

onUnmounted(() => cancelAnimationFrame(rafId))

const started = ref(false)
const novis = ref(false)

</script>

<template lang='pug'>
.flex.flex-col.items-center.w-full.h-100svh.justify-between.text-white
  img.z-10.w-90.mt-12.mb-8.z-200(src="/logo_la_mer_white.svg")

  template(v-if="started")
    .flex.flex-wrap.gap-2.justify-center.z-200.flex-1
      .p-4.op-75.hover-op-85.active-op-100.cursor-pointer.text-center.tracking-wider.transition-700.variable-text.whitespace-nowrap.select-none(v-for="globe in globes" :key="globe.name" @click="currentGlobe = globe; selectPreset(globe.preset)" :class="{'active': currentGlobe.name == globe.name}" style="contain: layout;") {{globe.name}} 

    .p-4.flex.flex-wrap.gap-8.justify-center.items-center.w-full.flex-auto.z-10(v-if="!novis")
      .flex.items-center.gap-6.flex-wrap.w-full.justify-center
        .flex.text-center.relative.justify-center.items-start.flex-col(style="perspective: 1000px; transform-style: preserve-3d;")
          GradientCircle(:size="400"
            :style="{transform: `scale(${1+turb.r}) rotateZ(${turb.z*120}deg) rotateX(${turb.x*25}deg) rotateY(${turb.y*25}deg)`}"
            :active="!!active"
            v-bind="globeWithNotes")

    .p-2.flex.flex-wrap.gap-2.absolute.bottom-12.z-100.op-90(v-if="loading") Loading...

    .p-2.flex.flex-wrap.gap-2.absolute.bottom-2.z-100
      .p-2.op-70.font-thin(v-for="(chord,c) in guessChords" :key="c") {{chord}}

  .flex.flex-col.gap-4.flex-1.max-w-55ch.leading-loose.text-center(v-else)
    .text-2xl Love. Share. Play.
    p Turn on your speakers, then connect TouchMe or press (Z-M and Q-P parts) keys on your computer keyboard to start playing. This website is optimized for desktop only.
    a.underline(href="https://www.youtube.com/@PlayTronica" target="_blank") Watch this tutorial to find out more.
    p Now you can visualise notes and experiment with smooth and sassy sounds. Our TouchMe devices can turn a hug into music, or a kiss into a musical note.
    p The musical content presented on this site is for non-commercial use only. If your computer is slow, try <a class="underline" href="#novis" @click="novis = true;started = true">playing without visuals</a>.
    .flex.flex-col.gap-4.items-center(v-if="Object.keys(inputs).length") 
      .text-lg Connected devices: 
      .flex.justify-center
        .p-2.text-lg.border-light-500.border-op-80.border-2.rounded-lg(v-for="input in inputs" :key="input") {{input.name}}
    button.button.relative.overflow-hidden.flex.items-center.justify-center(@click="started = true")
      .absolute.top-9.text-2xl.z-100 START
      img.invert.grayscale.w-60.h-30(src="/swoosh.svg")
    .text-sm Please email <a class="underline" href="mailto:support@playtronica.com">support@playtronica.com</a> for assistance.  We are here for you.

    
</template>

<style>
@font-face {
  font-family: 'Poppins Variable';
  src: url('/Poppins-VariableFont_wght.otf') format('opentype');
  font-weight: 100 500;
  font-display: swap;
}

html,
body {
  background-color: #006140;
}

body {
  font-family: 'Poppins Variable', sans-serif;
}

.variable-text {
  font-family: 'Poppins Variable', sans-serif;
  font-variation-settings: 'wght' 100;
  transition: font-variation-settings 0.5s ease-in-out;
}

.variable-text:hover {
  font-variation-settings: 'wght' 200;
}

.variable-text.active {
  font-variation-settings: 'wght' 500;
}
</style>