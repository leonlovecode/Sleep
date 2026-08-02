// scripts/build-audio.mjs
// 将 src/audio/ 下的 .mp3 转为 .ogg (Opus 64k, 烘焙 5s 淡入淡出)
import { execFileSync } from 'child_process'
import { rename, readdir, stat, unlink } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CROSSFADE_SECONDS, FADE_CURVE } from '../src/audio-config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const audioDir = join(__dirname, '..', 'src', 'audio')
const FADE = CROSSFADE_SECONDS

function run(binary, args, options = {}) {
  try {
    return execFileSync(binary, args, { encoding: 'utf-8', ...options })
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`未找到 ${binary}。请确认 FFmpeg 已安装并已重启终端/Codex 以刷新 PATH。`)
    }
    throw error
  }
}

async function main() {
  const files = await readdir(audioDir)
  const mp3Files = files.filter(f => f.endsWith('.mp3'))

  if (mp3Files.length === 0) {
    console.error(`错误: src/audio/ 目录下没有找到 .mp3 文件`)
    console.error(`请确保 src/audio/ 目录下有 .mp3 源文件`)
    process.exit(1)
  }

  for (const file of mp3Files) {
    const input = join(audioDir, file)
    const output = join(audioDir, file.replace(/\.mp3$/i, '.ogg'))
    const tempOutput = output.replace(/\.ogg$/i, '.tmp.ogg')

    // 获取时长
    const duration = run('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input,
    ]).trim()

    const fadeOutStart = Math.max(0, parseFloat(duration) - FADE)
    if (!Number.isFinite(fadeOutStart) || parseFloat(duration) <= FADE * 2) {
      throw new Error(`${file} 时长必须大于 ${FADE * 2} 秒，无法生成稳定循环`)
    }

    // 与原版 Math.sqrt(progress) 对齐的等功率淡变。
    await unlink(tempOutput).catch(() => {})
    run('ffmpeg', [
      '-y', '-i', input,
      '-af', `afade=t=in:st=0:d=${FADE}:curve=${FADE_CURVE},afade=t=out:st=${fadeOutStart}:d=${FADE}:curve=${FADE_CURVE}`,
      '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'off', tempOutput,
    ], { stdio: 'inherit' })
    await rename(tempOutput, output)

    const statResult = await stat(output)
    const sizeKB = (statResult.size / 1024).toFixed(1)
    console.log(`✓ ${file} → ${file.replace(/\.mp3$/i, '.ogg')} (${duration}s, ${sizeKB} KB)`)
  }

  console.log(`\n共转换 ${mp3Files.length} 个音频文件`)
}

main().catch(err => {
  console.error('音频构建失败:', err.message)
  process.exit(1)
})
