// 站点真实性检测（本地版）：抓完整 HTML，区分真面板 / 停放页 / 空响应
// 用法：
//   npm run check:site -- --hosts a.com,b.com
//   npm run check:site -- --file data/hosts.txt
//   npm run check:site -- --topic        # 检测 topic 里的全部域名
//
// 与 verify-real.mjs 的区别：这个脚本抓完整 HTML 并分析 SPA 结构，
// 不依赖 JS 渲染。v2board/xboard 的 HTML 骨架里一定有 <div id="app"> 和 js 入口，
// 停放页则一定带 godaddy/sedo/dan 的标记或「for sale」字样。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const val = (n, d) => {
  const i = argv.indexOf('--' + n)
  if (i === -1) return d
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : d
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const H = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9',
  'upgrade-insecure-requests': '1',
}

const PARKED = /domain (?:is |may be )?for sale|buy this domain|this website is for sale|domain parking|sedoparking|godaddy\.com\/forsale|dan\.com|afternic|hugedomains|bodis\.com|parkingcrew|域名(?:正在|已)?(?:出售|转让)|此域名出售|购买此域名/i
const PANEL_MARK = /v2board|xboard|id="app"|id="root"|<div id=app|#\/(?:login|register|plan)/i

async function check(host) {
  const url = /^https?:/.test(host) ? host : 'https://' + host + '/'
  const t0 = Date.now()
  const r = { host, at: new Date().toISOString(), status: 0, ms: 0, verdict: 'dead', title: '', len: 0, note: '' }
  try {
    const res = await fetch(url, { headers: H, redirect: 'follow', signal: AbortSignal.timeout(18000) })
    r.status = res.status
    r.ms = Date.now() - t0
    r.finalUrl = res.url
    const html = await res.text()
    r.len = html.length
    const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
    r.title = tm ? tm[1].replace(/\s+/g, ' ').trim().slice(0, 60) : ''

    if (PARKED.test(html)) {
      r.verdict = 'parked'
      r.note = '域名停放/出售页'
    } else if (html.length < 150) {
      r.verdict = 'empty'
      r.note = `响应仅 ${html.length} 字节`
    } else if (PANEL_MARK.test(html)) {
      r.verdict = 'panel'
      r.note = 'SPA 面板骨架'
    } else if (/<script[^>]+src=/i.test(html)) {
      r.verdict = 'spa-other'
      r.note = '有 JS 但无面板特征'
    } else {
      r.verdict = 'unknown'
      r.note = '静态页，无面板特征'
    }
  } catch (e) {
    r.ms = Date.now() - t0
    r.note = String(e.message || e).slice(0, 60)
    r.verdict = 'dead'
  }
  return r
}

// ── 目标 ──────────────────────────────────────────────────────────────
let hosts = []
if (val('hosts', '')) hosts = val('hosts', '').split(',').map((s) => s.trim()).filter(Boolean)
else if (val('file', '')) hosts = readFileSync(val('file', ''), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
else if (argv.includes('--topic') && existsSync(join(root, 'data', 'topic-1yuan.mjs'))) {
  const mod = await import('file://' + join(root, 'data', 'topic-1yuan.mjs').replace(/\\/g, '/') + '?t=' + Date.now())
  for (const it of mod.default.items || []) {
    for (const h of [it.host, ...(it.hostAlias || [])].filter(Boolean)) hosts.push(h)
  }
}

hosts = [...new Set(hosts.map((h) => h.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()))]
if (!hosts.length) {
  console.error('没有目标。用 --hosts / --file / --topic')
  process.exit(1)
}

const CONC = 6
const out = []
let done = 0
const q = [...hosts]
async function worker() {
  while (q.length) {
    const h = q.shift()
    const r = await check(h)
    out.push(r)
    done++
    const icon = { panel: '✅', 'spa-other': '❓', unknown: '❓', parked: '💰', empty: '⬜', dead: '✘' }[r.verdict]
    console.log(`[${String(done).padStart(2)}/${hosts.length}] ${icon} ${h.padEnd(30)} ${String(r.status).padEnd(4)} ${r.verdict.padEnd(10)} ${r.title || r.note}`)
  }
}
console.log(`检测 ${hosts.length} 个站点\n`)
await Promise.all(Array.from({ length: Math.min(CONC, hosts.length) }, worker))

const ORDER = { panel: 0, 'spa-other': 1, unknown: 2, empty: 3, parked: 4, dead: 5 }
out.sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict])

const prevPath = join(root, 'data', 'site-check.json')
let prev = { items: [] }
if (existsSync(prevPath)) {
  try {
    prev = JSON.parse(readFileSync(prevPath, 'utf8'))
  } catch {}
}
const merged = new Map()
for (const it of prev.items || []) merged.set(it.host, it)
for (const it of out) merged.set(it.host, it)
const all = [...merged.values()]

writeFileSync(prevPath, JSON.stringify({ updated: new Date().toISOString(), total: all.length, items: all }, null, 2) + '\n', 'utf8')

const stat = {}
for (const r of out) stat[r.verdict] = (stat[r.verdict] || 0) + 1
console.log(`\n✅ 真面板 ${stat.panel || 0}｜❓ 待确认 ${(stat['spa-other'] || 0) + (stat.unknown || 0)}｜⬜ 空 ${stat.empty || 0}｜💰 停放 ${stat.parked || 0}｜✘ 死 ${stat.dead || 0}`)
const bad = out.filter((r) => ['parked', 'empty', 'dead'].includes(r.verdict))
if (bad.length) {
  console.log('\n不能用的：')
  for (const r of bad) console.log(`  ${r.host.padEnd(30)} ${r.verdict.padEnd(8)} ${r.title || r.note}`)
}
