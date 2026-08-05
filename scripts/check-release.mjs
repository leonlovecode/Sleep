// 发布附件检查：确认单文件构建完整，并内联了所有应有的 OGG 音频。
import { readdir, readFile, stat } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releaseFile = resolve(process.argv[2] ?? 'Sleep.html')
const audioDir = join(root, 'src', 'audio')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const [html, fileStat, audioFiles] = await Promise.all([
    readFile(releaseFile, 'utf8'),
    stat(releaseFile),
    readdir(audioDir),
  ])
  const expectedAudioCount = audioFiles.filter(file => file.endsWith('.mp3')).length
  const embeddedAudioCount = (html.match(/data:audio\/ogg(?:;[^,]*)?,/gi) ?? []).length

  assert(/^<!doctype html>/i.test(html), '发布附件不是完整的 HTML 文档')
  assert(expectedAudioCount > 0, '未找到用于校验的 MP3 音源')
  assert(embeddedAudioCount === expectedAudioCount, `内联 OGG 数量错误：期望 ${expectedAudioCount}，实际 ${embeddedAudioCount}`)
  assert(!/(?:src|href)=["'](?:\/|\.\/)?assets\//i.test(html), '发布附件仍引用外部 assets 文件')
  assert(fileStat.size > expectedAudioCount * 600_000, '发布附件体积异常，音频可能未完整内联')

  console.log(`发布附件检查通过：${releaseFile} (${(fileStat.size / 1024 / 1024).toFixed(2)} MiB，${embeddedAudioCount} 段 OGG)`)
}

main().catch(error => { console.error(`发布附件检查失败：${error.message}`); process.exit(1) })
