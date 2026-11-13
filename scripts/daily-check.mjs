// 每日可用性检测：给「天天有真内容更新」用，不是凑 commit
// 用法：npm run daily
// 产出：
//   data/uptime.json     每家机场的历史检测记录（保留 30 天）
//   README.md            更新「最近 7 天可用性」区块
//
// 为什么这个能天天更新而价格不能：
//   价格一个月才动一次，但「今天这家能不能打开、多快」每天都在变。
//   这个表格是读者真正想看的东西（能看出哪家稳），也是搜索引擎喜欢的「新鲜数据」。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import topic from '../data/topic-1yuan.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const UPTIME = join(root, 'data', 'uptime.json')
const README = join(root, 'README.md')
const KEEP_DAYS = 30

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const PARKED = /domain (?:is |may be )?for sale|buy this domain|this website is for sale|domain parking|sedoparking|godaddy\.com\/forsale|dan\.com|域名(?:正在|已)?(?:出售|转让)|此域名出售/i

/** 今天（UTC+8）的日期字符串 */
const today = () => {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

/** 探测一家：返回 { ok, ms, code, note } */
async function probe(host) {
  const url = 'https://' + host + '/'
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })
    const ms = Date.now() - t0
    const html = (await res.text()).slice(0, 3000)
    if (PARKED.test(html)) return { ok: false, ms, code: res.status, note: '停放页' }
    // 200 / 301 / 302 / 403(Cloudflare) 都算活
    const ok = [200, 301, 302, 403].includes(res.status)
    return { ok, ms, code: res.status, note: ok ? '' : `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, code: 0, note: String(e.message || e).slice(0, 40) }
  }
}

// ── 读取历史 ──────────────────────────────────────────────────────────
let hist = { updated: '', days: {} }
if (existsSync(UPTIME)) {
  try {
    hist = JSON.parse(readFileSync(UPTIME, 'utf8'))
  } catch {}
}
if (!hist.days) hist.days = {}

// ── 今天探测 ──────────────────────────────────────────────────────────
const day = today()
const results = {}
console.log(`检测 ${topic.items.length} 家机场（${day}）...\n`)
for (const it of topic.items) {
  const hosts = [it.host, ...(it.hostAlias || [])].filter(Boolean)
  let best = null
  for (const h of hosts) {
    const r = await probe(h)
    if (r.ok) {
      best = { ...r, host: h }
      break
    }
    if (!best) best = { ...r, host: h }
  }
  results[it.name] = best
  const icon = best.ok ? '✅' : '❌'
  console.log(`  ${icon} ${it.name.padEnd(12)} ${String(best.code).padEnd(4)} ${String(best.ms).padStart(5)}ms  ${best.note}`)
}

hist.days[day] = results
hist.updated = new Date().toISOString()

// 只保留最近 KEEP_DAYS 天
const keys = Object.keys(hist.days).sort()
while (keys.length > KEEP_DAYS) delete hist.days[keys.shift()]

writeFileSync(UPTIME, JSON.stringify(hist, null, 2) + '\n', 'utf8')
console.log(`\n✔ 已记录 ${day}，历史共 ${Object.keys(hist.days).length} 天 → data/uptime.json`)

// ── 生成 README 区块 ──────────────────────────────────────────────────
const days = Object.keys(hist.days).sort().slice(-7)
const fmtDay = (d) => d.slice(5) // MM-DD
const cell = (r) => {
  if (!r) return '—'
  if (!r.ok) return '❌'
  return r.ms < 500 ? '✅' : r.ms < 1500 ? '✅' : '🟡'
}

const lines = []
lines.push('## 最近 7 天可用性（每日自动检测）', '')
lines.push('> 每天早上自动探测各家官网，`✅` 表示能正常打开（<1.5 秒），`🟡` 表示能打开但偏慢，`❌` 表示打不开。**这一列比任何评测都真实——连续 7 天全绿说明这家站是活的。**', '')
lines.push(`| 机场 | ${days.map(fmtDay).join(' | ')} | 可用率 |`)
lines.push(`| :--- | ${days.map(() => ':---:').join(' | ')} | ---: |`)
for (const it of topic.items) {
  const cells = days.map((d) => cell(hist.days[d]?.[it.name]))
  const okCount = cells.filter((c) => c === '✅' || c === '🟡').length
  const rate = days.length ? Math.round((okCount / days.length) * 100) + '%' : '—'
  lines.push(`| **${it.name}** | ${cells.join(' | ')} | ${rate} |`)
}
lines.push('')
lines.push(`*最近一次检测：${day}（北京时间）｜检测节点：GitHub Actions（境外）*`, '')

const block = lines.join('\n')

// ── 写回 README ───────────────────────────────────────────────────────
if (existsSync(README)) {
  let md = readFileSync(README, 'utf8')
  const START = '<!-- UPTIME:START -->'
  const END = '<!-- UPTIME:END -->'
  if (md.includes(START) && md.includes(END)) {
    const re = new RegExp(START + '[\\s\\S]*?' + END)
    md = md.replace(re, `${START}\n${block}\n${END}`)
  } else {
    // 第一次：插在「逐家介绍」之前
    const anchor = '## 逐家介绍'
    if (md.includes(anchor)) {
      md = md.replace(anchor, `${START}\n${block}\n${END}\n\n---\n\n${anchor}`)
    } else {
      md += `\n${START}\n${block}\n${END}\n`
    }
  }
  writeFileSync(README, md, 'utf8')
  console.log('✔ README.md 的可用性区块已更新')
}

// ── 变化摘要（给 commit message 用）──────────────────────────────────
const prevDay = days[days.length - 2]
if (prevDay) {
  const changed = topic.items.filter((it) => {
    const a = hist.days[prevDay]?.[it.name]?.ok
    const b = hist.days[day]?.[it.name]?.ok
    return a !== b
  })
  if (changed.length) {
    console.log(`\n状态变化（对比 ${prevDay}）：`)
    for (const it of changed) {
      const now = hist.days[day][it.name]?.ok
      console.log(`  ${it.name}: ${now ? '恢复可用' : '打不开了'}`)
    }
  } else {
    console.log('\n所有机场状态与昨天一致')
  }
}
