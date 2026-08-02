import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CROSSFADE_SECONDS } from './audio-config.js'
import { AUDIO_SOURCES } from './audio-sources.js'
import { formatCountdown } from './countdown.js'
import { CACHE_ICON, useAudioCache } from './useAudioCache.js'

const LS_KEY = 'rain:selected'

export function usePlayer() {
  const ready = ref(false)
  const toast = ref('')
  const selectedKey = ref(AUDIO_SOURCES[0].key)
  const selectedName = computed(() =>
    AUDIO_SOURCES.find(source => source.key === selectedKey.value)?.name ?? ''
  )
  const { cacheState, refresh: refreshAudioCache, downloadAudio } = useAudioCache()

  const duration = ref(null)
  const endTime = ref(null)
  const remaining = ref(null)
  const displayMs = ref(0)
  let countdownTimer = null

  let audioA = null
  let audioB = null
  let boundUrl = null
  let nextKey = 'a'
  let toastTimer = null
  let handoffTimer = null
  let playbackGeneration = 0

  const STATE = { IDLE: 'idle', PLAYING: 'playing', PAUSED: 'paused' }
  const state = ref(STATE.IDLE)
  const playing = computed(() => state.value === STATE.PLAYING)
  const countdownText = computed(() => {
    if (!duration.value) return '∞'
    return formatCountdown(state.value === STATE.PAUSED ? remaining.value : displayMs.value ?? 0)
  })

  function bindAudio(key) {
    const url = AUDIO_SOURCES.find(source => source.key === key).file
    if (!audioA) {
      audioA = new Audio()
      audioB = new Audio()
      audioA.crossOrigin = audioB.crossOrigin = 'anonymous'
      audioA.preload = audioB.preload = 'none'
      audioA.loop = audioB.loop = false
    }
    if (boundUrl !== url) {
      audioA.src = url
      audioB.src = url
      boundUrl = url
    }
    resetBoth()
  }

  function warmAudio() {
    if (!audioA || !audioB) return
    audioA.preload = audioB.preload = 'auto'
    audioA.load()
    audioB.load()
    // Media playback may use partial Range requests. This complete fetch is what
    // makes the audio reliably available after an offline restart.
    void downloadAudio(selectedKey.value, { quiet: true })
  }

  function toggle() {
    if (state.value === STATE.IDLE) start()
    else if (state.value === STATE.PLAYING) pause()
    else resume()
  }

  function start() {
    if (!ready.value) return
    resetBoth()
    warmAudio()
    state.value = STATE.PLAYING
    syncPlaybackState()
    nextKey = 'a'
    tick()
  }

  function selectDuration(ms) {
    if (!ready.value) return
    duration.value = ms
    start()
    if (ms != null) {
      endTime.value = Date.now() + ms
      startCountdown()
    }
  }

  async function changeAudio(key) {
    bindAudio(key)
    updateMediaMetadata()
  }

  async function selectAudio(key) {
    if (key === selectedKey.value) return
    selectedKey.value = key
    localStorage.setItem(LS_KEY, key)
    await changeAudio(key)
  }

  async function downloadSelectedAudio(key) {
    try {
      await downloadAudio(key)
      showToast('已可离线使用')
    } catch (error) {
      showToast(error.message || '下载失败，请稍后重试')
    }
  }

  function pause() {
    state.value = STATE.PAUSED
    const keep = nextKey === 'a' ? audioB : audioA
    const drop = nextKey === 'a' ? audioA : audioB
    if (!keep.paused) keep.pause()
    if (handoffTimer) { clearTimeout(handoffTimer); handoffTimer = null }
    drop.ontimeupdate = drop.onended = null
    drop.pause()
    drop.currentTime = 0
    if (duration.value) remaining.value = Math.max(0, endTime.value - Date.now())
    endTime.value = null
    stopCountdown()
    syncPlaybackState()
  }

  function resume() {
    state.value = STATE.PLAYING
    if (duration.value && remaining.value != null) {
      endTime.value = Date.now() + remaining.value
      startCountdown()
    }
    syncPlaybackState()
    const keep = nextKey === 'a' ? audioB : audioA
    if (keep.readyState >= 2) {
      const generation = playbackGeneration
      void playSeg(keep, generation).then(started => {
        if (started) scheduleHandoff(keep, generation)
      })
    }
  }

  function stop() {
    state.value = STATE.IDLE
    resetBoth()
    stopCountdown()
    duration.value = null
    endTime.value = null
    remaining.value = null
    syncPlaybackState()
  }

  async function playSeg(el, generation) {
    try {
      await el.play()
      return generation === playbackGeneration && state.value === STATE.PLAYING
    } catch {
      if (generation === playbackGeneration) showToast('播放被拦截，请点击页面按钮')
      return false
    }
  }

  function resetBoth() {
    playbackGeneration += 1
    if (handoffTimer) { clearTimeout(handoffTimer); handoffTimer = null }
    if (audioA) {
      audioA.ontimeupdate = audioA.onended = null
      audioA.pause()
      audioA.currentTime = 0
    }
    if (audioB) {
      audioB.ontimeupdate = audioB.onended = null
      audioB.pause()
      audioB.currentTime = 0
    }
  }

  function scheduleHandoff(el, generation) {
    let handedOff = false
    const handoff = () => {
      if (handedOff || generation !== playbackGeneration || state.value !== STATE.PLAYING) return
      if (!Number.isFinite(el.duration) || el.currentTime < el.duration - CROSSFADE_SECONDS) return
      handedOff = true
      el.ontimeupdate = null
      if (handoffTimer) { clearTimeout(handoffTimer); handoffTimer = null }
      tick()
    }

    el.ontimeupdate = handoff
    el.onended = () => {
      if (!handedOff && generation === playbackGeneration && state.value === STATE.PLAYING) {
        handedOff = true
        tick()
      }
    }

    const secondsUntilHandoff = el.duration - el.currentTime - CROSSFADE_SECONDS
    if (Number.isFinite(secondsUntilHandoff) && secondsUntilHandoff > 0) {
      handoffTimer = setTimeout(handoff, Math.max(0, secondsUntilHandoff * 1000 + 25))
    }
  }

  function tick() {
    if (state.value !== STATE.PLAYING) return
    const el = nextKey === 'a' ? audioA : audioB
    const generation = playbackGeneration
    el.currentTime = 0
    nextKey = nextKey === 'a' ? 'b' : 'a'
    void playSeg(el, generation).then(started => {
      if (started) scheduleHandoff(el, generation)
    })
  }

  function startCountdown() {
    stopCountdown()
    onCountdownTick()
    countdownTimer = setInterval(onCountdownTick, 250)
  }

  function stopCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  }

  function onCountdownTick() {
    if (state.value !== STATE.PLAYING || !duration.value || endTime.value == null) return
    const left = endTime.value - Date.now()
    const ms = Math.max(0, left)
    if (ms !== displayMs.value) displayMs.value = ms
    if (left <= 0) { showToast('时间到'); stop() }
  }

  function syncPlaybackState() {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing.value ? 'playing' : 'paused'
  }

  function updateMediaMetadata() {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: selectedName.value, artist: 'Sleep', album: '助眠',
    })
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return
    updateMediaMetadata()
    const onPlay = () => {
      if (state.value === STATE.PAUSED) resume()
      else if (state.value === STATE.IDLE) start()
      showToast(playing.value ? '已继续' : '')
    }
    const onPause = () => { if (playing.value) { pause(); showToast('已暂停') } }
    navigator.mediaSession.setActionHandler('play', onPlay)
    navigator.mediaSession.setActionHandler('pause', onPause)
    navigator.mediaSession.setActionHandler('stop', () => { stop(); showToast('已结束') })
    navigator.mediaSession.setActionHandler('playpause', () => playing.value ? onPause() : onPlay())
  }

  function showToast(message) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2000)
  }

  onMounted(async () => {
    const saved = localStorage.getItem(LS_KEY)
    const initial = AUDIO_SOURCES.some(source => source.key === saved) ? saved : AUDIO_SOURCES[0].key
    selectedKey.value = initial
    await refreshAudioCache()
    await changeAudio(initial)
    ready.value = true
    setupMediaSession()
  })
  onUnmounted(stop)

  return {
    ready, state, playing, countdownText, toast,
    selectedKey, selectedName,
    cacheState, CACHE_ICON,
    toggle, selectDuration, selectAudio, downloadSelectedAudio, stop,
  }
}
