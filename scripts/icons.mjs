// Gera os ícones PNG do PWA a partir de public/icon.svg (uso: node scripts/icons.mjs)
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const b = await chromium.launch({ channel: 'chrome' })
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } })
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await p.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname })
  await p.close()
}
await b.close()
console.log('ok')
