// Telegram 公开频道采集器：抓 t.me/s/<channel> 的预览页（不需要登录）
// 用法：
//   npm run tg                      # 默认抓 airportshare 20 页
//   npm run tg -- --pages 60        # 抓 60 页
//   npm run tg -- --channel jichangtj
//
// 为什么这条线比 GitHub 更值：
//   频道 @airportshare 的每条消息都是统一模板，带「注册地址 + 邀请码 + 免费额度 + 收费套餐 + 线路说明」。
//   一个模板顶别人一篇评测，而且更新频率以天计。GitHub 仓库大多是抄它的。
//
// 翻页：t.me/s/<channel>?before=<消息ID>，每次取当前页最早的一条 ID 继续往前。

import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'data', 'tg.json')

const argv = process.argv.slice(2)
const val = (n, d) => {
  const i = argv.indexOf('--' + n)
  if (i === -1) return d
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : d
}
const CHANNEL = val('channel', 'airportshare')
const PAGES = parseInt(val('pages', '20'), 10) || 20
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const decode = (s) =>
  String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, '')
    .trim()

/** 「3.88元/100G/月，6.88元/200G/月」→ [{price,gb,cycle}] */
function parsePlans(text) {
  const out = []
  const t = String(text || '')
  const re = /(\d+(?:\.\d+)?)\s*元\s*\/?\s*(\d+(?:\.\d+)?)\s*(G|GB|T)?\s*\/?\s*(月|年|季|半年|不限时)?/gi
  let m
  while ((m = re.exec(t))) {
    const price = parseFloat(m[1])
    let gb = m[2] ? parseFloat(m[2]) : null
    if (m[3] && /^t$/i.test(m[3]) && gb) gb *= 1024
    const cycle = m[4] || ''
    out.push({ price, gb, cycle, raw: m[0].trim() })
  }
  return out
}

/** 解析一条消息 */
function parseMsg(text) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean)
  const get = (key) => {
    const re = new RegExp('◽️?\\s*' + key + '\\s*[:：]\\s*(.*)$')
    for (const l of lines) {
      const m = re.exec(l)
      if (m) return m[1].trim()
    }
    return ''
  }
  const name = get('名称')
  if (!name) return null
  const url = get('注册地址')
  const free = get('免费')
  const paid = get('收费')
  const note = get('说明')
  const score = get('推荐指数')
  const tg = get('TG频道')
  const plans = parsePlans(paid)
  const freePlans = parsePlans(free)
  let host = ''
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {}
  const code = (/[?&](?:code|invite|aff|ref)=([\w-]+)/.exec(url) || [])[1] || ''
  return { name, url, host, code, free, paid, note, score, tg, plans, freePlans }
}

const byId = new Map()
let before = ''
let page = 0

while (page < PAGES) {
  const url = `https://t.me/s/${CHANNEL}${before ? '?before=' + before : ''}`
  let html = ''
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) })
    if (!res.ok) {
      console.log(`HTTP ${res.status} @ page ${page + 1}`)
      break
    }
    html = await res.text()
  } catch (e) {
    console.log(`抓取失败 page ${page + 1}: ${e.message}`)
    break
  }

  // 按消息块切
  const blocks = html.split('<div class="tgme_widget_message_wrap').slice(1)
  let minId = Infinity
  let added = 0
  for (const b of blocks) {
    const idm = /data-post="[^/]+\/(\d+)"/.exec(b)
    if (!idm) continue
    const id = parseInt(idm[1], 10)
    if (id < minId) minId = id
    if (byId.has(id)) continue
    const tm = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(b)
    if (!tm) continue
    const text = decode(tm[1])
    const rec = parseMsg(text)
    byId.set(id, { id, text: text.slice(0, 1200), ...(rec || {}) })
    if (rec) added++
  }
  page++
  console.log(`page ${page}: +${blocks.length} 块，新增有效 ${added}，最早 id ${minId === Infinity ? '?' : minId}`)
  if (minId === Infinity || minId <= 1) break
  if (before === String(minId)) break
  before = String(minId)
  await new Promise((r) => setTimeout(r, 600)) // 别把 t.me 打急
}

const items = [...byId.values()].filter((x) => x.name).sort((a, b) => b.id - a.id)
const withHost = items.filter((i) => i.host)

// 合并上一次结果（增量抓取不丢历史）
let prev = { items: [] }
if (existsSync(OUT)) {
  try {
    prev = JSON.parse(readFileSync(OUT, 'utf8'))
  } catch {}
}
const merged = new Map()
for (const it of prev.items || []) merged.set(it.id, it)
for (const it of items) merged.set(it.id, it)
const all = [...merged.values()].sort((a, b) => b.id - a.id)

writeFileSync(
  OUT,
  JSON.stringify(
    {
      updated: new Date().toISOString(),
      channel: CHANNEL,
      total: all.length,
      withHost: all.filter((i) => i.host).length,
      items: all,
    },
    null,
    2
  ) + '\n',
  'utf8'
)

console.log(`\n共 ${all.length} 条机场记录（带域名 ${all.filter((i) => i.host).length} 条）→ ${OUT}`)
const cheap = all.filter((i) => i.plans?.length && Math.min(...i.plans.map((p) => p.price)) <= 7)
console.log(`\n≤7 元档 ${cheap.length} 家（按最低价升序）：`)
for (const i of cheap.sort((a, b) => Math.min(...a.plans.map((p) => p.price)) - Math.min(...b.plans.map((p) => p.price))).slice(0, 40)) {
  const p = i.plans.reduce((m, x) => (x.price < m.price ? x : m), i.plans[0])
  console.log(`  ${String(p.price).padStart(5)}元 ${(p.gb ? p.gb + 'G' : '?').padEnd(6)} ${i.name.padEnd(14)} ${(i.host || '—').padEnd(28)} ${i.note || ''}`)
}
