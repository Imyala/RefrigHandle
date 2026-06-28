import sharp from 'sharp'
import { readFileSync } from 'fs'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url))

// Standard icons: the rounded-badge SVG as-is.
for (const { size, file } of [
  { size: 192, file: 'public/icon-192.png' },
  { size: 512, file: 'public/icon-512.png' },
]) {
  await sharp(svg).resize(size, size).png().toFile(file)
  console.log('wrote', file)
}

// Maskable icon: Android adaptive-icon masks crop the icon to a circle or
// rounded square and only guarantee the inner ~80% "safe zone" is visible.
// The standard badge (with its own rounded corners) gets its edges clipped
// and shows transparent corners. So the maskable variant uses a FULL-BLEED
// background (the brand colour, no rounding) with the badge scaled to 80%
// and centred, so the logo is never cropped whatever mask the launcher
// applies.
const MASK = 512
const INNER = Math.round(MASK * 0.8)
const pad = Math.round((MASK - INNER) / 2)
const inner = await sharp(svg).resize(INNER, INNER).png().toBuffer()
await sharp({
  create: { width: MASK, height: MASK, channels: 4, background: '#0f172a' },
})
  .composite([{ input: inner, top: pad, left: pad }])
  .png()
  .toFile('public/icon-512-maskable.png')
console.log('wrote public/icon-512-maskable.png (maskable, safe-zone padded)')
