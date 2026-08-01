// scripts/build-audio.mjs
// 将 src/audio/ 下的 .mp3 转为 .ogg (Opus 64k, 烘焙 5s 淡入淡出)
import { execSync } from 'child_process'
import { readdir, stat } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const audioDir = join(__dirname, '..', 'src', 'audio')
const FADE = 5 // 秒，与 usePlayer.js 中的 FADE 常量保持一致

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

    // 获取时长
    const duration = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${input}"`,
      { encoding: 'utf-8' }
    ).trim()

    const fadeOutStart = Math.max(0, parseFloat(duration) - FADE)

    // 转换: MP3 → Opus 64k, 烘焙淡入淡出
    execSync(
      `ffmpeg -y -i "${input}" ` +
      `-af "afade=t=in:st=0:d=${FADE},afade=t=out:st=${fadeOutStart}:d=${FADE}" ` +
      `-c:a libopus -b:a 64k -vbr off "${output}"`,
      { stdio: 'inherit' }
    )

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
