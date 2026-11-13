// 终池构建器 v2：把「价格 + 连通性 + 跑路记录」合成一张「能推 / 不能推」的判定表
// 用法：npm run final
// 前置：npm run merge && npm run paolu && npm run verify（verify 需走代理）
// 产出：data/pool-final.json + data/pool-final.csv
//
// v2 相对 v1 的三处修正：
//   1. 域名反查：extra 条目没写域名的，从跑路名单（214 家的 hosts）里反查补上
//   2. 导航站黑名单：go.clashshome.com / clashmetahub.net 这类跳转站不能当官网
//   3. 判定加「无域名」一档：没有验证过的域名 = 不能推荐，不管价格多好

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const R = (f) => join(root, 'data', f)

const shortlist = existsSync(R('shortlist.json')) ? JSON.parse(readFileSync(R('shortlist.json'), 'utf8')).items : []
const paolu = existsSync(R('paolu.json')) ? JSON.parse(readFileSync(R('paolu.json'), 'utf8')).items : []
const verify = existsSync(R('verify.json')) ? JSON.parse(readFileSync(R('verify.json'), 'utf8')) : { items: [] }
const tgItems = existsSync(R('tg.json')) ? JSON.parse(readFileSync(R('tg.json'), 'utf8')).items : []
const cardItems = existsSync(R('cards.json')) ? JSON.parse(readFileSync(R('cards.json'), 'utf8')).items : []
let extra = []
if (existsSync(R('lowprice-extra.mjs'))) {
  try {
    extra = (await import('file://' + R('lowprice-extra.mjs').replace(/\\/g, '/') + '?t=' + Date.now())).default
  } catch {}
}

/** 导航站 / 跳转站：不是机场官网，不能当主域名 */
const NAV = /jichangcha|jichangyyds|clashmetahub|clashshome|clashxiazai|bj999|why80|dianping\.men$|^dianping\.men|github|t\.me|telegram|youtube|bilibili|zhihu/i

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/机场|加速器|加速|网络|专线|云$|雲$|cloud|vpn/g, '')
    .replace(/[^\w\u4e00-\u9fa5]/g, '')

// 域名 → 连通性
const aliveByHost = new Map()
for (const v of verify.items || []) aliveByHost.set(v.host, v)

// 名字 → 跑路记录 + 域名
const paoluByName = new Map()
for (const p of paolu) {
  const k = norm(p.name)
  if (!k) continue
  const cur = paoluByName.get(k) || { open: 0, closed: 0, issues: [], hosts: [], titles: [] }
  cur.open += p.open || 0
  cur.closed += p.closed || 0
  cur.issues.push(...(p.issues || []))
  cur.hosts.push(...(p.hosts || []))
  if (p.title) cur.titles.push(p.title)
  paoluByName.set(k, cur)
}
function paoluOf(name) {
  const k = norm(name)
  if (!k) return null
  if (paoluByName.has(k)) return paoluByName.get(k)
  for (const [pk, pv] of paoluByName) {
    if (pk.length >= 2 && k.length >= 2 && (pk.includes(k) || k.includes(pk))) return pv
  }
  return null
}

/** 给一个机场找最靠谱的域名：优先自带 → 跑路名单里验证过 alive 的 → 任意非导航站域名 */
function bestHost(candidates, ownHost) {
  const all = [...new Set([ownHost, ...candidates].filter(Boolean))]
    .map((h) => String(h).replace(/^www\./i, '').toLowerCase())
    .filter((h) => h && !NAV.test(h))
  const alive = all.filter((h) => aliveByHost.get(h)?.status === 'alive')
  if (alive.length) return alive.sort((a, b) => (aliveByHost.get(a).ms || 9e9) - (aliveByHost.get(b).ms || 9e9))[0]
  return all[0] || ''
}

const rows = []
const seenName = new Set()

// ① shortlist（自动抓的，价格最可信）
for (const r of shortlist) {
  if (r.minMonthly == null || r.minMonthly > 7) continue
  const p = paoluOf(r.name)
  const host = bestHost([...(r.mirrors || []), ...(p?.hosts || [])], r.host)
  const v = aliveByHost.get(host)
  rows.push({
    name: r.name,
    price: r.minMonthly,
    gb: r.gb,
    perGb: r.pricePerGb,
    cycle: r.cycle,
    host,
    code: r.code,
    affUrl: r.affUrl,
    hasAff: !!r.hasCode,
    line: r.line,
    note: '',
    src: (r.sources || []).slice(0, 2).join(' / '),
    alive: v ? v.status === 'alive' : null,
    httpCode: v?.code ?? null,
    paoluOpen: p?.open ?? 0,
    paoluClosed: p?.closed ?? 0,
    paoluIssues: p?.issues?.slice(0, 3) ?? [],
  })
  seenName.add(norm(r.name))
  if (host) seenName.add('h:' + host)
}

// ② lowprice-extra（人工整理的，域名从跑路名单反查）
for (const e of extra) {
  if (e.price == null || e.price > 7) continue
  const k = norm(e.name)
  if (seenName.has(k)) continue
  const p = paoluOf(e.name)
  const host = bestHost(p?.hosts || [], e.host)
  if (host && seenName.has('h:' + host)) continue
  const v = host ? aliveByHost.get(host) : null
  rows.push({
    name: e.name,
    price: e.price,
    gb: e.gb,
    perGb: e.gb ? +(e.price / e.gb).toFixed(4) : null,
    cycle: e.cycle,
    host,
    code: '',
    affUrl: '',
    hasAff: e.aff === 'known',
    line: e.line,
    note: e.note,
    src: e.src,
    alive: v ? v.status === 'alive' : host ? null : null,
    httpCode: v?.code ?? null,
    paoluOpen: p?.open ?? 0,
    paoluClosed: p?.closed ?? 0,
    paoluIssues: p?.issues?.slice(0, 3) ?? [],
  })
  seenName.add(k)
  if (host) seenName.add('h:' + host)
}

// ②b Telegram 公开频道（@airportshare，409 条，模板统一：注册地址+价格+线路说明）
for (const t of tgItems) {
  if (!t.plans?.length) continue
  const min = t.plans.reduce((m, p) => (p.price < m.price ? p : m), t.plans[0])
  if (min.price == null || min.price > 7) continue
  const k = norm(t.name)
  if (seenName.has(k)) continue
  const host = bestHost([], t.host)
  if (host && seenName.has('h:' + host)) continue
  const v = host ? aliveByHost.get(host) : null
  const p = paoluOf(t.name)
  rows.push({
    name: t.name,
    price: min.price,
    gb: min.gb,
    perGb: min.gb ? +(min.price / min.gb).toFixed(4) : null,
    cycle: min.cycle || '',
    host,
    code: t.code || '',
    affUrl: t.url || '',
    hasAff: !!t.code,
    line: t.note || '',
    note: (t.paid || '').slice(0, 60),
    src: 't.me/airportshare #' + t.id,
    alive: v ? v.status === 'alive' : host ? null : null,
    httpCode: v?.code ?? null,
    paoluOpen: p?.open ?? 0,
    paoluClosed: p?.closed ?? 0,
    paoluIssues: p?.issues?.slice(0, 3) ?? [],
    allPlans: t.plans.map((x) => x.raw).slice(0, 4),
  })
  seenName.add(k)
  if (host) seenName.add('h:' + host)
}

// ②c 测评站卡片（jichangtuijian.uk，73 家，跳转短链已跟到真实入口）
for (const t of cardItems) {
  if (t.price == null || t.price > 7) continue
  const k = norm(t.name)
  if (seenName.has(k)) continue
  const host = bestHost([], t.host)
  if (host && seenName.has('h:' + host)) continue
  const v = host ? aliveByHost.get(host) : null
  const p = paoluOf(t.name)
  rows.push({
    name: t.name,
    price: t.price,
    gb: t.gb,
    perGb: t.gb ? +(t.price / t.gb).toFixed(4) : null,
    cycle: t.cycle || '',
    host,
    code: '',
    affUrl: '',
    hasAff: false,
    line: '',
    note: (t.desc || '').slice(0, 70),
    src: 'jichangtuijian.uk',
    alive: v ? v.status === 'alive' : host ? null : null,
    httpCode: v?.code ?? null,
    paoluOpen: p?.open ?? 0,
    paoluClosed: p?.closed ?? 0,
    paoluIssues: p?.issues?.slice(0, 3) ?? [],
  })
  seenName.add(k)
  if (host) seenName.add('h:' + host)
}

// ③ 跑路名单里 alive 的域名，只要名字看起来是机场、且没被收过 → 补进候选（用户口径：没跑的全要）
const EXTRA_BLOCK = /^(镜像网站|google|clashx|订阅链接|顶级域名|低价评级一览|unknown|test)/i
for (const p of paolu) {
  const k = norm(p.name)
  if (!k || seenName.has(k)) continue
  if (EXTRA_BLOCK.test(p.name || '')) continue
  const host = bestHost(p.hosts || [], '')
  if (!host) continue
  if (seenName.has('h:' + host)) continue
  const v = aliveByHost.get(host)
  if (v?.status !== 'alive') continue // 只收验证过活着的
  if (p.open > 0) continue // 有未解决 issue 的不自动收
  rows.push({
    name: p.name,
    price: null,
    gb: null,
    perGb: null,
    cycle: '',
    host,
    code: '',
    affUrl: '',
    hasAff: false,
    line: '',
    note: '跑路名单里无未解决记录，域名验证可访问；价格待查',
    src: 'paolu + verify',
    alive: true,
    httpCode: v.code,
    paoluOpen: p.open || 0,
    paoluClosed: p.closed || 0,
    paoluIssues: (p.issues || []).slice(0, 3),
  })
  seenName.add(k)
  seenName.add('h:' + host)
}

// ── 判定 ─────────────────────────────────────────────────────────────
const DEAD_WORDS = /已证实跑路|确认跑路|已经跑路|已跑路|跑路了|彻底跑路|停止运营|TG群解散/i
for (const r of rows) {
  if (!r.host) r.verdict = 'nohost'
  else if (r.alive === false) r.verdict = 'dead'
  else if (r.alive === null) r.verdict = 'unverified'
  else if (r.paoluOpen > 0 && DEAD_WORDS.test(r.note || '')) r.verdict = 'dead'
  else if (r.paoluOpen > 0) r.verdict = 'watch'
  else r.verdict = 'safe'
}

const ORDER = { safe: 0, watch: 1, unverified: 2, nohost: 3, dead: 4 }
rows.sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || (a.price ?? 99) - (b.price ?? 99))

const stat = {
  total: rows.length,
  safe: rows.filter((r) => r.verdict === 'safe').length,
  watch: rows.filter((r) => r.verdict === 'watch').length,
  unverified: rows.filter((r) => r.verdict === 'unverified').length,
  nohost: rows.filter((r) => r.verdict === 'nohost').length,
  dead: rows.filter((r) => r.verdict === 'dead').length,
  withAff: rows.filter((r) => r.hasAff).length,
}

writeFileSync(R('pool-final.json'), JSON.stringify({ updated: new Date().toISOString(), stat, items: rows }, null, 2) + '\n', 'utf8')

const esc = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const head = ['机场名', '判定', '价格', '周期', '流量G', '每GB', '主域名', '连通', 'HTTP', '跑路未解决', '跑路已解决', '有推广', '线路', '备注']
const lines = [head.join(',')]
for (const r of rows) {
  lines.push(
    [
      r.name,
      { safe: '可推', watch: '可推(有记录)', unverified: '待验证', nohost: '无域名', dead: '剔除' }[r.verdict],
      r.price ?? '',
      r.cycle,
      r.gb ?? '',
      r.perGb ?? '',
      r.host,
      r.alive === true ? '活' : r.alive === false ? '死' : '未验',
      r.httpCode ?? '',
      r.paoluOpen || '',
      r.paoluClosed || '',
      r.hasAff ? '有' : '待确认',
      r.line,
      r.note,
    ]
      .map(esc)
      .join(',')
  )
}
writeFileSync(R('pool-final.csv'), '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8')

console.log(`终池 ${rows.length} 家（≤7 元档）`)
console.log(`  可推 ${stat.safe}｜可推(有记录) ${stat.watch}｜待验证 ${stat.unverified}｜无域名 ${stat.nohost}｜剔除 ${stat.dead}｜有推广 ${stat.withAff}`)
console.log('\n=== 可推（safe）===')
for (const r of rows.filter((x) => x.verdict === 'safe')) {
  console.log(
    `  ${String(r.price ?? '?').padStart(5)}元 ${(r.gb ? r.gb + 'G' : '?').padEnd(6)} ${r.name.padEnd(14)} ${(r.host || '—').padEnd(30)} ${r.hasAff ? '有推广' : '待确认'}`
  )
}
console.log('\n=== 可推但有跑路记录（watch）===')
for (const r of rows.filter((x) => x.verdict === 'watch')) {
  console.log(`  ${String(r.price ?? '?').padStart(5)}元 ${r.name.padEnd(14)} ${(r.host || '—').padEnd(30)} open ${r.paoluOpen} / closed ${r.paoluClosed}`)
}
console.log('\n=== 域名验证过的（跑路名单补入，价格待查）===')
for (const r of rows.filter((x) => x.verdict === 'safe' && x.price == null)) {
  console.log(`  ${r.name.padEnd(16)} ${r.host}`)
}
