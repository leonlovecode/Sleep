// 轻量音频检查：确保构建产物存在、可被 ffprobe 解码且淡变时长有效。
// 接缝的最终听感仍以 Chromium 与安卓实机验收为准。
import { execFileSync } from 'child_process'
import { readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CROSSFADE_SECONDS } from '../src/audio-config.js'

const audioDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'audio')

function probe(file) {
  return Number(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ], { encoding: 'utf-8' }).trim())
}

async function main() {
  const oggFiles = (await readdir(audioDir)).filter(file => file.endsWith('.ogg') && !file.endsWith('.tmp.ogg'))
  if (oggFiles.length === 0) throw new Error('未找到 OGG，请先运行 npm run build:audio')
  for (const file of oggFiles) {
    const duration = probe(join(audioDir, file))
    if (!Number.isFinite(duration) || duration <= CROSSFADE_SECONDS * 2) {
      throw new Error(`${file} 时长不足以进行 ${CROSSFADE_SECONDS} 秒交叉淡变`)
    }
    console.log(`✓ ${file} (${duration.toFixed(2)}s)`)
  }
}

main().catch(error => { console.error(`音频检查失败：${error.message}`); process.exit(1) })
