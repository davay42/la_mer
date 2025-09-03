<script setup>
import { Midi } from 'tone'
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useMIDI } from './src/useMidi'
import GradientCircle from './src/GradientCircle.vue'
import { useSampler } from './src/useSampler'

import globes from './src/globes.yaml'
const currentGlobe = ref(globes[0])

const { sampler, presets, currentPreset, loading, progress, audioBuffer, params, selectPreset, loadFile, loadUrl, triggerAttack, triggerRelease } = useSampler()

const { activeNotes, midiNote, guessChords } = useMIDI()

watch(midiNote, n => {
  if (n.velocity > 0) triggerAttack(Midi(n.number).toNote(), "+0.000000001", n.velocity)
  else triggerRelease(Midi(n.number).toNote(), "+0.000000001")
})

</script>

<template lang='pug'>
.flex.flex-col.items-center.w-full.h-100svh.justify-between.text-white
  img.z-10.w-90.mt-12.mb-8(src="/logo_la_mer_white.svg")
  //- pre {{Object.keys(presets)}}
  //- pre {{globes.map(g=>g.preset)}}

  .flex.flex-wrap.gap-2.justify-center
    .p-4.op-75.hover-op-85.active-op-100.cursor-pointer.text-center.tracking-wider.transition-700.variable-text.whitespace-nowrap.select-none(v-for="globe in globes" :key="globe.name" @click="currentGlobe = globe; selectPreset(globe.preset)" :class="{'active': currentGlobe.name == globe.name}" style="contain: layout;") {{globe.name}} 

  .p-4.flex.flex-wrap.gap-8.justify-center.items-center.w-full.flex-auto
    .p-12.blur-xl.rounded-full.absolute(
      v-for="note in Object.entries(activeNotes).filter(e=>e[1]>0)" 
      :key="note"
      :style="{backgroundColor:`hsl(${30*((note[0]-9)%12)}deg,100%,50%)` }"
      ) {{Midi(note[0]).toNote()}} 

    .flex.items-center.gap-6.flex-wrap.w-full.justify-center
      .rounded-full.shadow-sm.p-0.flex.text-center.relative.justify-center.items-start.flex-col
        .text-sm.z-10
        GradientCircle(:size="400"
          :active="Object.entries(activeNotes).filter(e=>e[1]>0).length > 0"
          v-bind="currentGlobe")


  .p-2.flex.flex-wrap.gap-2.absolute.bottom-2
    .p-2(v-for="(chord,c) in guessChords" :key="c") {{chord}}
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