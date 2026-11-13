// 站点真实性验证器：区分「真机场面板」「域名停放页」「空白页」「连不上」
// 用法：
//   npm run verify:real                    # 验证 topic 里的 5 家
//   npm run verify:real -- --all           # 验证终池全部候选
//   npm run verify:real -- --hosts a.com,b.com
//
// 为什么必须有这一层：
//   HTTP 200 不等于机场活着。大量域名过期后会被停放商接管，返回 200 + 「此域名出售」页面。
//   上一版只看了状态码，把停放页当成可用站点，导致读者点进去看到「域名正在出售」。
//
// 判定：
//   panel   页面有 v2board/xboard 特征（登录/注册/套餐/订阅/忘记密码）→ 可用
//   parked  命中停放页关键词（domain for sale / 域名出售 / sedo / dan.com）→ 剔除
//   blank   200 但内容极少（< 300 字符）→ 剔除
//   dead    连不上（超时/DNS 失败/连接拒绝）→ 剔除
//   unknown 200 但两类特征都没有 → 需人工看一眼

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const R = (f) => join(root, 'data', f)

const argv = process.argv.slice(2)
const flag = (n) => argv.includes('--' + n)
const val = (n, d) => {
  const i = argv.indexOf('--' + n)
  if (i === -1) return d
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : d
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const HEADERS = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'upgrade-insecure-requests': '1',
}

/** 域名停放 / 出售页的特征 */
const PARKED = [
  /domain (?:is |may be )?for sale/i,
  /buy this domain/i,
  /this domain (?:is|may be) for sale/i,
  /the domain (?:name )?has expired/i,
  /域名(?:正在|已)?(?:出售|转让|待售)/,
  /此域名(?:正在)?出售/,
  /购买此域名/,
  /联系.*(?:购买|收购).*域名/,
  /sedo\.com|dan\.com|afternic|hugedomains|bodis\.com|parkingcrew|above\.com|undeveloped\.com/i,
  /domain parking/i,
  /inquire about this domain/i,
  /make an offer on this domain/i,
]

/** 机场面板的特征（v2board / xboard / 自研面板都命中） */
const PANEL = [
  /v2board|xboard/i,
  /(?:登录|登入|註冊|注册|注册账户|创建账户)/,
  /(?:忘记密码|找回密码|重置密码)/,
  /(?:套餐|订阅|流量|节点|到期时间)/,
  /(?:购买|立即购买|续费|充值)/,
  /#\/(?:login|register|plan|dashboard|order)/i,
  /(?:shadowrocket|clash|v2ray|sing-box|hysteria)/i,
]

function classify(html, status, ms, url) {
  const body = String(html || '')
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (status === 0) return { verdict: 'dead', reason: '连不上', len: text.length }
  if (PARKED.some((re) => re.test(body))) {
    return { verdict: 'parked', reason: '域名停放/出售页', len: text.length }
  }
  const panelHits = PANEL.filter((re) => re.test(body)).length
  if (panelHits >= 2) return { verdict: 'panel', reason: `面板特征 ${panelHits} 项`, len: text.length }
  if (text.length < 300) return { verdict: 'blank', reason: `内容仅 ${text.length} 字符`, len: text.length }
  if (panelHits === 1) return { verdict: 'panel', reason: `面板特征 1 项`, len: text.length }
  return { verdict: 'unknown', reason: '无面板特征，需人工确认', len: text.length }
}

async function checkHost(host) {
  const out = { host, at: new Date().toISOString(), status: 0, ms: 0, verdict: 'dead', reason: '', title: '', len: 0 }
  const url = /^https?:/.test(host) ? host : 'https://' + host + '/'
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
    out.ms = Date.now() - t0
    out.status = res.status
    out.finalUrl = res.url
    const html = await res.text()
    const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
    out.title = tm ? tm[1].replace(/\s+/g, ' ').trim().slice(0, 80) : ''
    const c = classify(html, res.status, out.ms, res.url)
    out.verdict = c.verdict
    out.reason = c.reason
    out.len = c.len
  } catch (e) {
    out.ms = Date.now() - t0
    out.reason = String(e.message || e).slice(0, 60)
    out.verdict = 'dead'
  }
  return out
}

// ── 取目标 ────────────────────────────────────────────────────────────
let targets = []
if (val('hosts', '')) {
  targets = val('hosts', '').split(',').map((h) => ({ host: h.trim(), name: h.trim() }))
} else if (flag('all') && existsSync(R('pool-final.json'))) {
  targets = JSON.parse(readFileSync(R('pool-final.json'), 'utf8')).items
    .filter((x) => x.host)
    .map((x) => ({ host: x.host, name: x.name }))
} else {
  // 默认：topic 里那 5 家
  try {
    const mod = await import('file://' + join(root, 'data', 'topic-1yuan.mjs').replace(/\\/g, '/') + '?t=' + Date.now())
    for (const it of mod.default.items || []) {
      for (const h of [it.host, ...(it.hostAlias || [])].filter(Boolean)) {
        targets.push({ host: h, name: it.name })
      }
    }
  } catch {}
}

// 去重
const seen = new Set()
targets = targets.filter((t) => {
  const k = String(t.host).toLowerCase()
  if (seen.has(k)) return false
  seen.add(k)
  return true
})

const CONC = parseInt(val('concurrency', '6'), 10) || 6
const results = []
let done = 0
const queue = [...targets]
async function worker() {
  while (queue.length) {
    const t = queue.shift()
    const r = await checkHost(t.host)
    results.push({ ...r, name: t.name })
    done++
    const icon = r.verdict === 'panel' ? '✅' : r.verdict === 'parked' ? '💰' : r.verdict === 'blank' ? '⬜' : r.verdict === 'unknown' ? '❓' : '✘'
    console.log(
      `[${String(done).padStart(3)}/${targets.length}] ${icon} ${t.host.padEnd(32)} ${String(r.status).padEnd(4)} ${r.verdict.padEnd(8)} ${r.reason}`
    )
  }
}
console.log(`验证 ${targets.length} 个站点，并发 ${CONC}\n`)
await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, worker))

const order = { panel: 0, unknown: 1, blank: 2, parked: 3, dead: 4 }
results.sort((a, b) => order[a.verdict] - order[b.verdict] || a.host.localeCompare(b.host))

const stat = {}
for (const r of results) stat[r.verdict] = (stat[r.verdict] || 0) + 1

writeFileSync(
  R('verify-real.json'),
  JSON.stringify({ updated: new Date().toISOString(), proxy: process.env.HTTPS_PROXY || '(direct)', total: results.length, stat, items: results }, null, 2) + '\n',
  'utf8'
)

console.log(`\n结果 → data/verify-real.json`)
console.log(
  `  ✅ 真面板 ${stat.panel || 0}｜❓ 待确认 ${stat.unknown || 0}｜⬜ 空白 ${stat.blank || 0}｜💰 停放页 ${stat.parked || 0}｜✘ 连不上 ${stat.dead || 0}`
)

const bad = results.filter((r) => r.verdict === 'parked' || r.verdict === 'dead' || r.verdict === 'blank')
if (bad.length) {
  console.log('\n必须从推荐里剔除的：')
  for (const r of bad) console.log(`  ${r.host.padEnd(32)} ${r.name.padEnd(14)} ${r.verdict} — ${r.reason}`)
}
const unk = results.filter((r) => r.verdict === 'unknown')
if (unk.length) {
  console.log('\n需要人工看一眼的：')
  for (const r of unk) console.log(`  ${r.host.padEnd(32)} ${r.name.padEnd(14)} title="${r.title}"`)
}
