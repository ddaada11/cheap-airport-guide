// 合并器：把「事实库（有价格）」和「域名池（有邀请码）」按名字归一化合成一张推荐总表
// 用法：npm run merge
// 产出：
//   data/shortlist.json  结构化总表（build / 独立站 / 前端都能直接吃）
//   data/shortlist.csv   给人看的版本（Excel / 飞书 / 石墨直接打开，UTF-8 BOM）
//
// 这张表就是「低价机场信息库」的最终形态：一行 = 一家机场 = 可判断「便宜不便宜 + 能不能推」的全部字段。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FACTS = join(root, 'data', 'facts.json')
const POOL = join(root, 'data', 'pool.json')
const OUT_J = join(root, 'data', 'shortlist.json')
const OUT_C = join(root, 'data', 'shortlist.csv')

for (const f of [FACTS, POOL]) {
  if (!existsSync(f)) {
    console.error(`缺 ${f}，先跑 npm run data`)
    process.exit(1)
  }
}

const facts = JSON.parse(readFileSync(FACTS, 'utf8')).items
const pool = JSON.parse(readFileSync(POOL, 'utf8')).items

// ── 面板实测价格（probe.mjs 产出，优先级最高：官方接口当前值）────────────
const PROBE = join(root, 'data', 'probe.json')
const probeByHost = new Map()
if (existsSync(PROBE)) {
  for (const it of JSON.parse(readFileSync(PROBE, 'utf8')).items || []) {
    if (it.minMonthly != null) probeByHost.set(it.host, it)
  }
}

// ── 自己的推广信息（最高优先级，覆盖别人源里抓到的邀请码）──────────────
const MY_AFF = join(root, 'data', 'my-aff.json')
let mine = {}
if (existsSync(MY_AFF)) {
  try {
    mine = JSON.parse(readFileSync(MY_AFF, 'utf8')).aff || {}
  } catch {
    console.warn('my-aff.json 解析失败，忽略')
  }
}
const stripWww = (h) => String(h || '').replace(/^www\./i, '').toLowerCase()
const myAffFor = (host) => {
  const h = stripWww(host)
  if (!h) return null
  for (const [k, v] of Object.entries(mine)) {
    const kk = stripWww(k)
    if (!kk || kk.startsWith('_')) continue
    if (h === kk || h.endsWith('.' + kk)) return v
  }
  return null
}

const normName = (n) =>
  String(n)
    .toLowerCase()
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/机场|加速器|加速|网络|专线|云$|雲$|cloud|vpn/g, '')
    .replace(/[^\w\u4e00-\u9fa5]/g, '')

// ── 域名池索引 ────────────────────────────────────────────────────────
const poolByIdx = new Map()
for (const p of pool) {
  if (p.status === 'mirror') continue // 备用域名已挂在主条目的 mirrors 上
  for (const a of [p.name, p.hostU, p.host]) {
    const k = normName(a)
    if (k && k.length >= 2 && !poolByIdx.has(k)) poolByIdx.set(k, p)
  }
}

/** 名字三级匹配：精确 → 前缀/包含 → 放弃 */
function findPool(f) {
  const names = [f.name, ...(f.aliases || [])]
  for (const a of names) {
    const k = normName(a)
    if (k && poolByIdx.has(k)) return poolByIdx.get(k)
  }
  for (const a of names) {
    const k = normName(a)
    if (!k || k.length < 2) continue
    for (const [pk, pv] of poolByIdx) {
      if (pk.length < 2) continue
      if (pk === k) return pv
      if (pk.length >= 3 && k.length >= 3 && (pk.includes(k) || k.includes(pk))) return pv
    }
  }
  return null
}

/** 价格分层：这是「低价机场」这个选题的核心分类轴 */
const band = (p) => {
  if (p == null) return '未知'
  if (p <= 3) return '① ≤3 元'
  if (p <= 5) return '② 3-5 元'
  if (p <= 10) return '③ 5-10 元'
  if (p <= 15) return '④ 10-15 元'
  if (p <= 20) return '⑤ 15-20 元'
  return '⑥ >20 元'
}

const rows = []
const seenPool = new Set()

for (const f of facts) {
  const p = findPool(f)
  if (p) seenPool.add(p.host)

  const host = p?.host || f.hosts?.[0] || ''
  const my = myAffFor(host)
  const code = my?.code || p?.affCode || f.code || p?.seenCodes?.[0] || ''
  const affUrl = my?.url || p?.affUrl || f.urls?.[0] || f.url || p?.url || ''

  // 价格优先级：面板实测 > 多源观测最低值
  const pb = probeByHost.get(host)
  const minMonthly = pb?.minMonthly ?? f.minMonthly ?? null
  const gb = pb?.gb ?? f.gb ?? null
  const pricePerGb = pb?.pricePerGb ?? f.pricePerGb ?? null
  const priceSource = pb ? 'probe' : f.minMonthly != null ? 'src' : ''

  rows.push({
    name: f.name,
    aliases: f.aliases?.filter((a) => a !== f.name) || [],
    minMonthly,
    gb,
    pricePerGb,
    priceSource,
    cycle: f.cycle || '',
    coupon: f.coupon || '',
    afterCoupon: f.afterCoupon ?? null,
    line: f.line || '',
    protocol: f.protocol || '',
    score: f.score ?? null,
    nodes: f.nodes ?? null,
    trial: !!f.trial,
    band: band(minMonthly),
    host,
    code,
    affUrl,
    isMine: !!my,
    rate: my?.rate || '',
    settle: my?.settle || '',
    mirrors: p?.mirrors || [],
    // 可信度：被几个源同时提到 + 有没有价格 + 有没有域名 + 有没有邀请码
    srcCount: f.sources?.length || 0,
    hasPrice: f.minMonthly != null,
    hasHost: !!host,
    hasCode: !!code,
    priceObs: f.priceObs || [],
    sources: f.sources || [],
    note: f.note || '',
  })
}

// 域名池里没被任何事实命中的（有域名没价格）也要进表 —— 它们是「待补价格」的候选
for (const p of pool) {
  if (p.status === 'mirror' || p.status === 'rejected' || seenPool.has(p.host)) continue
  const my = myAffFor(p.host)
  const pb = probeByHost.get(p.host)
  rows.push({
    name: p.name || p.host,
    aliases: [],
    minMonthly: pb?.minMonthly ?? null,
    gb: pb?.gb ?? null,
    pricePerGb: pb?.pricePerGb ?? null,
    priceSource: pb ? 'probe' : '',
    cycle: '',
    coupon: '',
    afterCoupon: null,
    line: p.type || '',
    protocol: '',
    score: null,
    nodes: null,
    trial: !!p.trial,
    band: band(pb?.minMonthly ?? null),
    host: p.host,
    code: my?.code || p.affCode || p.seenCodes?.[0] || '',
    affUrl: my?.url || p.affUrl || p.url || '',
    isMine: !!my,
    rate: my?.rate || '',
    settle: my?.settle || '',
    mirrors: p.mirrors || [],
    srcCount: p.source?.length || 0,
    hasPrice: pb?.minMonthly != null,
    hasHost: true,
    hasCode: !!(my?.code || p.affCode || p.seenCodes?.[0]),
    priceObs: [],
    sources: p.source || [],
    note: p.price ? '池内抓到的价格：' + p.price : '',
  })
}

// 排序：有价格的按价格升序在前，无价格的按来源数降序在后
rows.sort((a, b) => {
  if (a.hasPrice !== b.hasPrice) return a.hasPrice ? -1 : 1
  if (a.hasPrice) return a.minMonthly - b.minMonthly
  return b.srcCount - a.srcCount
})

const stat = {
  total: rows.length,
  withPrice: rows.filter((r) => r.hasPrice).length,
  withHost: rows.filter((r) => r.hasHost).length,
  withCode: rows.filter((r) => r.hasCode).length,
  mine: rows.filter((r) => r.isMine).length,
  recommendable: rows.filter((r) => r.hasPrice && r.hasHost && r.hasCode).length,
  bands: {},
}
for (const r of rows) stat.bands[r.band] = (stat.bands[r.band] || 0) + 1

writeFileSync(
  OUT_J,
  JSON.stringify({ updated: new Date().toISOString(), stat, items: rows }, null, 2) + '\n',
  'utf8'
)

// ── CSV ──────────────────────────────────────────────────────────────
const HEADER = [
  '机场名',
  '最低月付',
  '流量G',
  '每GB成本',
  '周期',
  '优惠码',
  '券后价',
  '线路',
  '协议',
  '评分',
  '节点数',
  '试用',
  '价格档',
  '价格来源',
  '主域名',
  '邀请码',
  '是否我的码',
  '返佣比例',
  '注册链接',
  '备用域名',
  '来源数',
  '数据源',
]
const esc = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const lines = [HEADER.join(',')]
for (const r of rows) {
  lines.push(
    [
      r.name,
      r.minMonthly ?? '',
      r.gb ?? '',
      r.pricePerGb ?? '',
      r.cycle,
      r.coupon,
      r.afterCoupon ?? '',
      r.line,
      r.protocol,
      r.score ?? '',
      r.nodes ?? '',
      r.trial ? '是' : '',
      r.band,
      r.priceSource === 'probe' ? '面板实测' : r.priceSource === 'src' ? '源观测' : '',
      r.host,
      r.code,
      r.isMine ? '是' : '',
      r.rate,
      r.affUrl,
      r.mirrors.join(' '),
      r.srcCount,
      r.sources.join(' '),
    ]
      .map(esc)
      .join(',')
  )
}
writeFileSync(OUT_C, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8')

console.log(`合并完成 ${rows.length} 家 → ${OUT_J}`)
console.log(`  CSV → ${OUT_C}`)
console.log(
  `  有价格 ${stat.withPrice}｜有域名 ${stat.withHost}｜有邀请码 ${stat.withCode}｜三者齐全（可直接推）${stat.recommendable}｜用的是你的码 ${stat.mine}`
)
if (!stat.mine) console.log('  ⚠ 还没填 data/my-aff.json：表里的邀请码都是别人（同行作者）的，挂出去等于替别人打工')
console.log('  价格分层：', stat.bands)
console.log('\n可直接推的（价格+域名+邀请码齐全），按价格升序：')
for (const r of rows.filter((r) => r.hasPrice && r.hasHost && r.hasCode).slice(0, 30)) {
  console.log(
    `  ${String(r.minMonthly).padStart(5)}元 ${(r.gb ? r.gb + 'G' : '?').padEnd(6)} ${r.name.padEnd(12)} ${(r.line || '').slice(0, 12).padEnd(13)} ${r.host}`
  )
}
