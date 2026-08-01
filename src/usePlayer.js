import { ref, computed, onMounted, onUnmounted } from 'vue'
import { formatCountdown } from './countdown.js'
import { AUDIO_SOURCES } from './audio-sources.js'

// 淡入淡出已烘焙进音频文件（构建时 ffmpeg 处理），运行时无需处理。
// <audio> 直接播放 data URI（单文件）或相对路径（PWA），零运行时开销。

const LS_KEY = 'rain:selected'

// 缓存态图标四态表
const CACHE_ICON = {
  builtin: { class: 'fa-solid fa-circle-check cache-ic local-ic',           title: '已内置（单文件）' },
  loading: { class: 'fa-solid fa-circle-notch fa-spin cache-ic loading-ic', title: '准备中' },
  local:   { class: 'fa-solid fa-circle-check cache-ic local-ic',           title: '已缓存到本地' },
  cloud:   { class: 'fa-solid fa-cloud cache-ic cloud-ic',                  title: '未缓存，点此下载到本地' },
}

export function usePlayer() {
  const ready = ref(false)
  const toast = ref('')

  // ---- 多音源选择 ----
  const preparingKey = ref(null)
  const selectedKey = ref(AUDIO_SOURCES[0].key)
  const selectedName = computed(() =>
    AUDIO_SOURCES.find(a => a.key === selectedKey.value)?.name ?? ''
  )
  const cachedKeys = ref([])

  // 缓存态：'builtin'(单文件内联) | 'loading'(加载中) | 'local'(已落盘) | 'cloud'(未下载)
  function cacheState(key) {
    const src = AUDIO_SOURCES.find(a => a.key === key)
    if (src && src.file.startsWith('data:')) return 'builtin'
    if (preparingKey.value === key) return 'loading'
    if (cachedKeys.value.includes(key)) return 'local'
    return 'cloud'
  }

  // ---- 计时 ----
  const duration  = ref(null)
  const endTime   = ref(null)
  const remaining = ref(null)
  const displayMs = ref(0)
  let countdownTimer = null

  let audioA = null, audioB = null
  let nextKey = 'a'
  let toastTimer = null

  // ---- 播放控制 ----
  const STATE = { IDLE: 'idle', PLAYING: 'playing', PAUSED: 'paused' }
  const state = ref(STATE.IDLE)
  const playing = computed(() => state.value === STATE.PLAYING)

  const countdownText = computed(() => {
    if (!duration.value) return '∞'
    const ms = state.value === STATE.PAUSED ? remaining.value : displayMs.value
    return formatCountdown(ms ?? 0)
  })

  const normalizePath = urlStr => {
    try { return decodeURIComponent(new URL(urlStr, location.href).pathname) } catch { return '' }
  }

  async function syncCachedFromSW() {
    if (!('caches' in window)) return
    let cache
    try { cache = await caches.open('sleep-audio') } catch { return }
    const cached = new Set((await cache.keys()).map(r => normalizePath(r.url)))
    cachedKeys.value = AUDIO_SOURCES.filter(a => cached.has(normalizePath(a.file))).map(a => a.key)
  }

  // ---- 音频准备：直接返回 file URL（data URI 或相对路径）----
  async function prepareOne(key) {
    const src = AUDIO_SOURCES.find(a => a.key === key).file
    if (!cachedKeys.value.includes(key)) cachedKeys.value.push(key)
    return src
  }

  function bindAudio(key) {
    const url = AUDIO_SOURCES.find(a => a.key === key).file
    if (!audioA) {
      audioA = new Audio(url); audioB = new Audio(url)
      audioA.loop = audioB.loop = false
    } else if (audioA.src !== url) {
      audioA.src = url; audioB.src = url
    }
    resetBoth()
  }

  function toggle() {
    if (state.value === STATE.IDLE)        start()
    else if (state.value === STATE.PLAYING) pause()
    else                                   resume()
  }

  function start() {
    if (!ready.value) return
    resetBoth()
    state.value = STATE.PLAYING
    syncPlaybackState()
    nextKey = 'a'
    tick()
  }

  function selectDuration(ms) {
    if (!ready.value) return
    duration.value = ms
    start()
    if (ms != null) { endTime.value = Date.now() + ms; startCountdown() }
  }

  async function changeAudio(key) {
    preparingKey.value = key
    await prepareOne(key)
    bindAudio(key)
    updateMediaMetadata()
    preparingKey.value = null
  }

  async function selectAudio(key) {
    if (key === selectedKey.value) return
    selectedKey.value = key
    localStorage.setItem(LS_KEY, key)
    await changeAudio(key)
  }

  function pause() {
    state.value = STATE.PAUSED
    const keep = nextKey === 'a' ? audioB : audioA
    const drop = nextKey === 'a' ? audioA : audioB
    if (!keep.paused) { keep.pause() }
    drop.ontimeupdate = null; drop.pause(); drop.currentTime = 0
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
    if (keep.readyState >= 2) playSeg(keep)
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

  function playSeg(el) {
    el.play().catch(() => showToast('播放被拦截，请点击页面按钮'))
  }

  function resetBoth() {
    if (audioA) { audioA.ontimeupdate = null; audioA.pause(); audioA.currentTime = 0 }
    if (audioB) { audioB.ontimeupdate = null; audioB.pause(); audioB.currentTime = 0 }
  }

  // 淡入淡出已烘焙进音频文件，交接逻辑不变。
  // tick 在 currentTime >= duration - FADE 时启动下一段。
  const FADE = 5
  function tick() {
    if (state.value !== STATE.PLAYING) return
    const el = nextKey === 'a' ? audioA : audioB
    el.currentTime = 0
    playSeg(el)
    nextKey = nextKey === 'a' ? 'b' : 'a'

    el.ontimeupdate = () => {
      if (state.value !== STATE.PLAYING) return
      if (!el.duration) return
      if (el.currentTime >= el.duration - FADE) {
        el.ontimeupdate = null
        tick()
      }
    }
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

  // ---- Media Session ----
  function syncPlaybackState() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing.value ? 'playing' : 'paused'
    }
  }
  function updateMediaMetadata() {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: selectedName.value, artist: 'Sleep', album: '助眠'
    })
  }
  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return
    updateMediaMetadata()
    const onPlay  = () => {
      if (state.value === STATE.PAUSED) resume(); else if (state.value === STATE.IDLE) start()
      showToast(playing.value ? '已继续' : '')
    }
    const onPause = () => {
      if (playing.value) { pause(); showToast('已暂停') }
    }
    const onStop = () => { stop(); showToast('已结束') }
    navigator.mediaSession.setActionHandler('play',      onPlay)
    navigator.mediaSession.setActionHandler('pause',     onPause)
    navigator.mediaSession.setActionHandler('stop',      onStop)
    navigator.mediaSession.setActionHandler('playpause', () => playing.value ? onPause() : onPlay())
  }

  // ---- Toast ----
  function showToast(msg) {
    toast.value = msg
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2000)
  }

  onMounted(async () => {
    syncCachedFromSW()
    const saved = localStorage.getItem(LS_KEY)
    const initial = AUDIO_SOURCES.some(a => a.key === saved) ? saved : AUDIO_SOURCES[0].key
    selectedKey.value = initial
    await changeAudio(initial)
    ready.value = true
    setupMediaSession()
  })
  onUnmounted(stop)

  return {
    ready, state, playing, countdownText, toast,
    selectedKey, selectedName, preparingKey, cachedKeys,
    cacheState, CACHE_ICON,
    toggle, selectDuration, selectAudio, stop,
  }
}
