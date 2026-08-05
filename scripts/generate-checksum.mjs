import { createHash } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import { basename, resolve } from 'path'

const releaseFile = resolve(process.argv[2] ?? 'Sleep.html')

async function main() {
  const digest = createHash('sha256').update(await readFile(releaseFile)).digest('hex')
  const checksumFile = `${releaseFile}.sha256`
  await writeFile(checksumFile, `${digest}  ${basename(releaseFile)}\n`)
  console.log(`已生成 SHA-256：${checksumFile}`)
}

main().catch(error => { console.error(`SHA-256 生成失败：${error.message}`); process.exit(1) })
