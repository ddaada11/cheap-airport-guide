// 连通性验证器：把候选池里的每个域名真打一遍，分出「活着 / 死了 / 被 Cloudflare 挡」
// 用法：
//   npm run verify            # 走系统代理（NODE_USE_ENV_PROXY=1 + HTTPS_PROXY）
//   npm run verify -- --direct   # 不走代理
//   npm run verify -- --limit 50
//
// 判定规则（这个品类必须区分，否则会误杀一半）：
//   200 / 301 / 302 / 401 / 403(带 cf 头)  → alive     站点在，能连
//   403 且无 cf 头 + 返回 nginx/apache 默认页 → blocked  可能只挡了爬虫
//   000 / ETIMEDOUT / ENOTFOUND / ECONNREFUSED → dead  真的连不上
//
// 注意：403 不等于死。这个品类大量站点挂了 Cloudflare 挑战，浏览器能开、curl 开不了。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHORTLIST = join(root, 'data', 'shortlist.json')
const EXTRA = join(root, 'data', 'lowprice-extra.mjs')
const PAOLU = join(root, 'data', 'paolu.json')
const OUT = join(root, 'data', 'verify.json')

const argv = process.argv.slice(2)
const flag = (n) => argv.includes('--' + n)
const val = (n, d) => {
  const i = argv.indexOf('--' + n)
  if (i === -1) return d
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : d
}
const LIMIT = parseInt(val('limit', '0'), 10) || 0
const CONC = parseInt(val('concurrency', '7'), 10) || 7
const TIMEOUT = parseInt(val('timeout', '12000'), 10) || 12000

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const HEADERS = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'cache-control': 'no-cache',
  'upgrade-insecure-requests': '1',
  'sec-ch-ua': '"Chromium";v="120", "Not(A:Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
}

// ── 待验证域名集合 ────────────────────────────────────────────────────
const targets = new Map() // host -> { name, src }
const add = (host, name, src) => {
  const h = String(host || '').replace(/^www\./i, '').toLowerCase()
  if (!h || !/\./.test(h)) return
  if (!targets.has(h)) targets.set(h, { host: h, name: name || h, src: src || '' })
}

if (existsSync(SHORTLIST)) {
  for (const r of JSON.parse(readFileSync(SHORTLIST, 'utf8')).items) {
    if (r.host && r.hasHost) add(r.host, r.name, 'shortlist')
    for (const m of r.mirrors || []) add(m, r.name, 'mirror')
  }
}
if (existsSync(EXTRA)) {
  try {
    const mod = await import('file://' + EXTRA.replace(/\\/g, '/') + '?t=' + Date.now())
    for (const e of mod.default || []) if (e.host) add(e.host, e.name, 'extra')
  } catch {}
}
if (existsSync(join(root, 'data', 'tg.json'))) {
  try {
    for (const it of JSON.parse(readFileSync(join(root, 'data', 'tg.json'), 'utf8')).items) {
      if (it.host) add(it.host, it.name, 'tg')
    }
  } catch {}
}
if (existsSync(join(root, 'data', 'cards.json'))) {
  try {
    for (const it of JSON.parse(readFileSync(join(root, 'data', 'cards.json'), 'utf8')).items) {
      if (it.host) add(it.host, it.name, 'cards')
    }
  } catch {}
}
if (existsSync(PAOLU)) {
  for (const it of JSON.parse(readFileSync(PAOLU, 'utf8')).items) {
    for (const h of it.hosts || []) add(h, it.name, 'paolu')
  }
}

let list = [...targets.values()]
if (LIMIT) list = list.slice(0, LIMIT)

// ── 探测 ─────────────────────────────────────────────────────────────
async function check(t) {
  const url = 'https://' + t.host + '/'
  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const ms = Date.now() - started
    const code = res.status
    const server = res.headers.get('server') || ''
    const cf = res.headers.get('cf-ray') || res.headers.get('cf-mitigated') || ''
    const loc = res.headers.get('location') || ''
    let body = ''
    try {
      body = (await res.text()).slice(0, 1200)
    } catch {}

    let status = 'alive'
    let note = ''
    if (code === 403) {
      if (/cloudflare/i.test(server) || cf || /just a moment|cf-challenge|Attention Required/i.test(body)) {
        status = 'alive'
        note = 'Cloudflare 挑战（浏览器可开）'
      } else {
        status = 'blocked'
        note = '403 无 CF 头，可能只挡爬虫'
      }
    } else if (code === 404 || code === 410) {
      status = 'blocked'
      note = 'HTTP ' + code
    } else if (code >= 500) {
      status = 'blocked'
      note = '服务端错误 ' + code
    }
    // 面板指纹
    const isPanel = /v2board|xboard|登录|注册|订阅|套餐|login|register|plan/i.test(body)
    return { ...t, url, status, code, ms, server, note, panel: isPanel, loc: loc.slice(0, 80) }
  } catch (e) {
    const ms = Date.now() - started
    const msg = String(e.message || e)
    const dead = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timeout|aborted|fetch failed/i.test(msg)
    return { ...t, url, status: dead ? 'dead' : 'error', code: 0, ms, note: msg.slice(0, 80) }
  }
}

const results = []
let done = 0
const queue = [...list]
async function worker() {
  while (queue.length) {
    const t = queue.shift()
    const r = await check(t)
    results.push(r)
    done++
    const tag = r.status === 'alive' ? `✔ ${r.code} ${r.ms}ms` : r.status === 'blocked' ? `? ${r.code}` : `✘ ${r.note}`
    console.log(`[${String(done).padStart(3)}/${list.length}] ${t.host.padEnd(34)} ${tag}`)
  }
}
console.log(`验证 ${list.length} 个域名，并发 ${CONC}，超时 ${TIMEOUT}ms\n`)
await Promise.all(Array.from({ length: Math.min(CONC, list.length) }, worker))

const byStatus = { alive: [], blocked: [], dead: [], error: [] }
for (const r of results) byStatus[r.status].push(r)
for (const k of Object.keys(byStatus)) byStatus[k].sort((a, b) => a.ms - b.ms)

writeFileSync(
  OUT,
  JSON.stringify(
    {
      updated: new Date().toISOString(),
      proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '(direct)',
      total: results.length,
      summary: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, v.length])),
      items: results.sort((a, b) => a.status.localeCompare(b.status) || a.ms - b.ms),
    },
    null,
    2
  ) + '\n',
  'utf8'
)

console.log(`\n结果 → ${OUT}`)
console.log(`  活着 ${byStatus.alive.length}｜被挡 ${byStatus.blocked.length}｜连不上 ${byStatus.dead.length}｜异常 ${byStatus.error.length}`)
console.log('\n连不上的（建议从推荐池里剔除）：')
for (const r of byStatus.dead.slice(0, 30)) console.log(`  ${r.host.padEnd(34)} ${r.name.padEnd(14)} ${r.note}`)
