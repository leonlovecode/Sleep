import { execFileSync } from 'child_process'
import { access } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const requiredFiles = [
  '01 - 打雷下雨.mp3', '02 - 倾盆大雨.mp3', '03 - 淅沥下雨.mp3',
  '04 - 海边礁石.mp3', '05 - 夜晚蟋蟀青蛙.mp3', '06 - 旷野.mp3',
]

function command(binary, args) {
  try {
    return execFileSync(binary, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`未找到 ${binary}，请检查 PATH 并重启终端/Codex。`)
    throw error
  }
}

async function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0])
  if (nodeMajor !== 24) throw new Error(`需要 Node 24，当前为 ${process.version}`)
  const ffmpegVersion = command('ffmpeg', ['-version']).split(/\r?\n/)[0]
  command('ffprobe', ['-version'])
  const encoders = command('ffmpeg', ['-hide_banner', '-encoders'])
  if (!encoders.includes('libopus')) throw new Error('当前 FFmpeg 不包含 libopus 编码器')
  const filters = command('ffmpeg', ['-hide_banner', '-filters'])
  for (const filter of ['afade', 'astats', 'amix']) {
    if (!filters.includes(filter)) throw new Error(`当前 FFmpeg 不包含 ${filter} 滤镜`)
  }
  await Promise.all(requiredFiles.map(file => access(join(root, 'src', 'audio', file))))
  console.log(`Node ${process.version}`)
  console.log(ffmpegVersion)
  console.log('音频构建环境正常')
}

main().catch(error => { console.error(`环境检查失败：${error.message}`); process.exit(1) })
