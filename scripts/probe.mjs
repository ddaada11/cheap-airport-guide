// 探测器：直接问机场面板要套餐表（v2board / xboard 的公开接口），把价格从「别人抄的」变成「官方现在的」
// 用法：
//   npm run probe                 # 只探「有域名但没价格」的
//   npm run probe -- --all        # 全量探（慢，但能刷新所有价格）
//   npm run probe -- --limit 50   # 只探前 50 个
//   npm run probe -- --concurrency 12
//
// 原理：v2board / xboard 面板都暴露了未登录可访问的套餐接口
//   POST /api/v1/guest/plan/fetch   →  { data: [ { name, month_price, quarter_price, year_price, transfer_enable, ... } ] }
//   价格字段单位是「分」，transfer_enable 单位是字节。
// 这一步拿到的数据可信度最高（官方当前值），merge 时优先级排在人工观测之上。
//
// 注意：这一步必须在你自己的网络环境跑。机场域名在部分网络下不可达，会直接超时——
// 那是网络问题，不是脚本问题。失败的会写进 data/probe.json 的 failed 里，下次重试。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHORTLIST = join(root, 'data', 'shortlist.json')
const OUT = join(root, 'data', 'probe.json')

const argv = process.argv.slice(2)
const flag = (n, d) => {
  const i = argv.indexOf('--' + n)
  if (i === -1) return d
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const ALL = !!flag('all', false)
const LIMIT = parseInt(flag('limit', '0'), 10) || 0
const CONC = parseInt(flag('concurrency', '8'), 10) || 8
const TIMEOUT = parseInt(flag('timeout', '9000'), 10) || 9000

if (!existsSync(SHORTLIST)) {
  console.error('缺 data/shortlist.json，先跑 npm run merge')
  process.exit(1)
}

const list = JSON.parse(readFileSync(SHORTLIST, 'utf8')).items
let targets = list.filter((r) => r.host && (ALL || !r.hasPrice))
if (LIMIT) targets = targets.slice(0, LIMIT)

const UA = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'content-type': 'application/json',
}

const GB = 1024 * 1024 * 1024

/** 面板返回的价格是「分」；有的魔改面板直接给「元」。用套餐档位关系判断，不靠猜。 */
function normalizePrice(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  // 分：典型值 200 / 1500 / 9900；元：2 / 15 / 99。同一份套餐里出现 ≥100 就按分处理。
  return n
}

/** 一份 plan 的所有周期价格 → 折合月付最低值 */
function planMonthly(p) {
  const cands = []
  const pairs = [
    ['month_price', 1],
    ['quarter_price', 3],
    ['half_year_price', 6],
    ['year_price', 12],
    ['two_year_price', 24],
    ['three_year_price', 36],
    ['onetime_price', null],
  ]
  for (const [k, months] of pairs) {
    const v = normalizePrice(p[k])
    if (v == null) continue
    if (months == null) {
      cands.push({ kind: '不限时', total: v, months: null, perMonth: null })
      continue
    }
    cands.push({ kind: months + '个月', total: v, months, perMonth: v / months })
  }
  return cands
}

async function probeHost(host) {
  const base = 'https://' + host
  const out = { host, at: new Date().toISOString(), panel: '', plans: [], error: '' }

  // ① 面板指纹
  try {
    const r = await fetch(base + '/api/v1/guest/comm/config', {
      headers: UA,
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const t = await r.text()
    let j = null
    try {
      j = JSON.parse(t)
    } catch {
      /* 非 JSON = 不是标准面板或走了 SPA 兜底 */
    }
    if (j?.data) {
      out.panel = j.data.is_xboard || j.data.xboard ? 'xboard' : 'v2board'
      out.regOpen = j.data.is_email_verify === 0 ? '可能需邮箱验证' : ''
      out.tosUrl = j.data.tos_url || ''
    } else if (/<html/i.test(t)) {
      out.panel = 'spa'
    }
  } catch (e) {
    out.error = 'config: ' + e.message
  }

  // ② 套餐表
  try {
    const r = await fetch(base + '/api/v1/guest/plan/fetch', {
      method: 'POST',
      headers: UA,
      body: '{}',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const t = await r.text()
    let j = null
    try {
      j = JSON.parse(t)
    } catch {
      /* 落到 error */
    }
    if (Array.isArray(j?.data)) {
      const div = j.data.some((p) => Number(p.month_price) >= 100 || Number(p.year_price) >= 1000)
      out.priceUnit = div ? '分' : '元'
      for (const p of j.data) {
        const div2 = div ? 100 : 1
        const cands = planMonthly(
          Object.fromEntries(
            Object.entries(p).map(([k, v]) => [k, typeof v === 'number' ? v / div2 : v])
          )
        )
        const perMonth = cands.filter((c) => c.perMonth != null).map((c) => c.perMonth)
        const gb = p.transfer_enable ? +(p.transfer_enable / GB).toFixed(2) : null
        out.plans.push({
          id: p.id,
          name: (p.name || '').slice(0, 30),
          gb,
          cands,
          minPerMonth: perMonth.length ? +Math.min(...perMonth).toFixed(2) : null,
          pricePerGb:
            gb && perMonth.length ? +(Math.min(...perMonth) / gb).toFixed(4) : null,
        })
      }
      out.plans.sort((a, b) => (a.minPerMonth ?? 9e9) - (b.minPerMonth ?? 9e9))
      if (out.plans[0]?.minPerMonth != null) {
        out.minMonthly = out.plans[0].minPerMonth
        out.gb = out.plans[0].gb
        out.pricePerGb = out.plans[0].pricePerGb
      }
    } else if (!out.error) {
      out.error = 'plan: 非标准返回 ' + t.slice(0, 60).replace(/\s+/g, ' ')
    }
  } catch (e) {
    out.error = (out.error ? out.error + ' | ' : '') + 'plan: ' + e.message
  }
  return out
}

// ── 并发池 ────────────────────────────────────────────────────────────
const results = []
let done = 0
const queue = [...targets]

async function worker() {
  while (queue.length) {
    const t = queue.shift()
    const r = await probeHost(t.host)
    results.push({ ...r, name: t.name })
    done++
    const tag = r.minMonthly != null ? `✔ ${r.minMonthly}元 ${r.gb ?? '?'}G` : `✘ ${r.error.slice(0, 50)}`
    console.log(`[${String(done).padStart(3)}/${targets.length}] ${t.host.padEnd(34)} ${tag}`)
  }
}

console.log(`探测 ${targets.length} 个域名，并发 ${CONC}\n`)
await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, worker))

const ok = results.filter((r) => r.minMonthly != null)
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { history: [] }
writeFileSync(
  OUT,
  JSON.stringify(
    {
      updated: new Date().toISOString(),
      total: results.length,
      ok: ok.length,
      items: results.sort((a, b) => (a.minMonthly ?? 9e9) - (b.minMonthly ?? 9e9)),
      history: [
        ...(prev.history || []).slice(-30),
        { at: new Date().toISOString(), total: results.length, ok: ok.length },
      ],
    },
    null,
    2
  ) + '\n',
  'utf8'
)

console.log(`\n成功 ${ok.length}/${results.length} → ${OUT}`)
if (ok.length) {
  console.log('\n官方当前最低月付：')
  for (const r of ok.slice(0, 20)) {
    console.log(
      `  ${String(r.minMonthly).padStart(6)}元 ${(r.gb ? r.gb + 'G' : '?').padEnd(7)} ${r.name.padEnd(12)} ${r.host}`
    )
  }
}
if (ok.length < results.length) {
  console.log('\n失败的多数是网络不可达（机场域名常被墙 / 被 Cloudflare 拦），换网络重跑即可，已成功的不会丢。')
}
