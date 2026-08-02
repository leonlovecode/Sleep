import { reactive } from 'vue'
import { AUDIO_SOURCES } from './audio-sources.js'

export const AUDIO_CACHE_NAME = 'sleep-audio'

export const CACHE_ICON = {
  builtin:     { class: 'fa-solid fa-circle-check cache-ic local-ic', title: '已内置（单文件）' },
  checking:    { class: 'fa-solid fa-circle-notch fa-spin cache-ic loading-ic', title: '正在检查离线状态' },
  downloading: { class: 'fa-solid fa-circle-notch fa-spin cache-ic loading-ic', title: '正在下载以供离线使用' },
  local:       { class: 'fa-solid fa-circle-check cache-ic local-ic', title: '已可离线使用' },
  cloud:       { class: 'fa-solid fa-cloud-arrow-down cache-ic cloud-ic', title: '下载以供离线使用' },
  error:       { class: 'fa-solid fa-triangle-exclamation cache-ic error-ic', title: '下载失败，点击重试' },
}

const absoluteUrl = url => new URL(url, location.href).href
const isBuiltin = key => AUDIO_SOURCES.find(source => source.key === key)?.file.startsWith('data:')

export function useAudioCache() {
  const states = reactive(Object.fromEntries(
    AUDIO_SOURCES.map(source => [source.key, source.file.startsWith('data:') ? 'builtin' : 'checking'])
  ))
  const inflight = new Map()

  function cacheState(key) {
    return states[key] ?? 'cloud'
  }

  async function refresh() {
    const remoteSources = AUDIO_SOURCES.filter(source => !source.file.startsWith('data:'))
    if (!('caches' in window)) {
      remoteSources.forEach(source => { states[source.key] = 'cloud' })
      return
    }

    remoteSources.forEach(source => {
      if (states[source.key] !== 'downloading') states[source.key] = 'checking'
    })

    try {
      const cache = await caches.open(AUDIO_CACHE_NAME)
      await Promise.all(remoteSources.map(async source => {
        if (states[source.key] === 'downloading') return
        const response = await cache.match(absoluteUrl(source.file))
        states[source.key] = response ? 'local' : 'cloud'
      }))
    } catch {
      remoteSources.forEach(source => {
        if (states[source.key] !== 'downloading') states[source.key] = 'cloud'
      })
    }
  }

  async function downloadAudio(key, { quiet = false } = {}) {
    if (isBuiltin(key)) return true
    if (cacheState(key) === 'local') return true
    if (inflight.has(key)) return inflight.get(key)

    const source = AUDIO_SOURCES.find(item => item.key === key)
    if (!source || !('caches' in window)) {
      states[key] = 'error'
      if (!quiet) throw new Error('当前浏览器不支持离线音频缓存')
      return false
    }

    states[key] = 'downloading'
    const task = (async () => {
      try {
        const request = new Request(absoluteUrl(source.file), {
          method: 'GET',
          credentials: 'same-origin',
        })
        const response = await fetch(request)
        if (!response.ok || response.status !== 200 || !response.body) {
          throw new Error(`音频下载失败（HTTP ${response.status}）`)
        }

        const cache = await caches.open(AUDIO_CACHE_NAME)
        await cache.put(request, response.clone())
        const saved = await cache.match(request)
        if (!saved) throw new Error('音频缓存校验失败')

        states[key] = 'local'
        return true
      } catch (error) {
        states[key] = 'error'
        if (!quiet) throw error
        return false
      } finally {
        inflight.delete(key)
      }
    })()

    inflight.set(key, task)
    return task
  }

  return { cacheState, refresh, downloadAudio }
}
