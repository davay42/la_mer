import { ref, shallowRef, reactive, watch, onUnmounted } from 'vue'
import { Sampler, getTransport, Reverb, PingPongDelay } from 'tone'
import Presets from './presets.json'

export function useSampler(options = {}) {
    const {
        presetKey = 'sampler-preset-2',
        initialPreset = Object.keys(Presets)[0] || '',
        reverb: reverbInit = { wet: 0.65, decay: 5.5 },
        delay: delayInit = { delayTime: '8t', feedback: 0.5, maxDelay: 40, wet: 0.46 },
    } = options

    const presets = Presets
    const currentPreset = ref(initialPreset)

    const sampler = shallowRef(null)
    const reverb = shallowRef(null)
    const delay = shallowRef(null)

    const loading = ref(false)
    const progress = ref(0)
    const audioBuffer = ref(null)

    const params = reactive({
        reverbWet: reverbInit.wet,
        reverbDecay: reverbInit.decay,
        delayTime: delayInit.delayTime,
        delayFeedback: delayInit.feedback,
        delayWet: delayInit.wet,
    })

    function ensureChain() {
        if (!reverb.value) reverb.value = new Reverb({ wet: params.reverbWet, decay: params.reverbDecay }).toDestination()
        if (!delay.value) delay.value = new PingPongDelay({ delayTime: params.delayTime, feedback: params.delayFeedback, maxDelay: delayInit.maxDelay, wet: params.delayWet }).connect(reverb.value)
    }

    function disposeSampler() {
        try { sampler.value?.disconnect(); sampler.value?.dispose() } catch (_) { }
        sampler.value = null
    }

    function createSampler(spec) {
        ensureChain()
        disposeSampler()
        const onload = () => { progress.value = 1; loading.value = false }
        // If spec looks like SamplerOptions (has 'urls' or typical option keys), pass as single options object with onload
        if (spec && (spec.urls || spec.baseUrl || spec.release !== undefined || spec.attack !== undefined)) {
            const opts = { ...spec, onload }
            sampler.value = new Sampler(opts).connect(delay.value)
        } else {
            // Treat as SampleMap (note->url/AudioBuffer) and use 2-arg form
            sampler.value = new Sampler(spec, onload).connect(delay.value)
        }
        return sampler.value
    }

    // init from preset
    watch(currentPreset, (p) => {
        if (!p || !presets[p]) return
        loading.value = true
        progress.value = 0
        createSampler(presets[p])
    }, { immediate: true })

    // react to param changes
    watch(() => params.reverbWet, (v) => { if (reverb.value) reverb.value.wet.value = v })
    watch(() => params.reverbDecay, (v) => { if (reverb.value) reverb.value.decay = v })
    watch(() => params.delayTime, (v) => { if (delay.value) delay.value.delayTime.value = v })
    watch(() => params.delayFeedback, (v) => { if (delay.value) delay.value.feedback.value = v })
    watch(() => params.delayWet, (v) => { if (delay.value) delay.value.wet.value = v })

    // transport
    try { getTransport().start() } catch (_) { }

    async function loadFile(file, note = 'C4') {
        if (!file) return
        loading.value = true
        progress.value = 0
        const reader = new FileReader()
        const buf = await new Promise((res, rej) => {
            reader.onerror = () => rej(reader.error)
            reader.onprogress = (ev) => { if (ev.lengthComputable) progress.value = ev.loaded / ev.total }
            reader.onload = () => res(reader.result)
            reader.readAsArrayBuffer(file)
        })
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        audioBuffer.value = await audioCtx.decodeAudioData(buf)
        createSampler({ [note]: audioBuffer.value })
    }

    async function loadUrl(url, note = 'C4') {
        if (!url) return
        loading.value = true
        progress.value = 0
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`)
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
        createSampler({ [note]: audioBuffer.value })
    }

    function selectPreset(name) { if (presets[name]) currentPreset.value = name }

    function triggerAttack(note, time = '+0.000000001', velocity = 1) { !loading.value ? sampler.value?.triggerAttack(note, time, velocity) : null }
    function triggerRelease(note, time = '+0.000000001') { sampler.value?.triggerRelease(note, time) }

    onUnmounted(() => {
        disposeSampler()
        try { delay.value?.disconnect(); delay.value?.dispose?.() } catch (_) { }
        try { reverb.value?.disconnect(); reverb.value?.dispose?.() } catch (_) { }
    })

    return {
        // nodes
        sampler, reverb, delay,
        // state
        presets, currentPreset, loading, progress, audioBuffer, params,
        // actions
        selectPreset, loadFile, loadUrl, triggerAttack, triggerRelease,
    }
}

function concatUint8(chunks) {
    const total = chunks.reduce((s, c) => s + (c.length ?? c.byteLength ?? 0), 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const ch of chunks) { const arr = ch instanceof Uint8Array ? ch : new Uint8Array(ch); out.set(arr, offset); offset += arr.length }
    return out
}
