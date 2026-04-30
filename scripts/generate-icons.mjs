import sharp from 'sharp'
import { readFileSync } from 'fs'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url))

const sizes = [
  { size: 192, file: 'public/icon-192.png' },
  { size: 512, file: 'public/icon-512.png' },
  { size: 512, file: 'public/icon-512-maskable.png' },
]

for (const { size, file } of sizes) {
  await sharp(svg).resize(size, size).png().toFile(file)
  console.log('wrote', file)
}
