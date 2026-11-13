// 数据体检 + 链接巡检
// 用法：npm run check          （只做静态校验）
//      npm run check -- --net  （额外发 HEAD 请求，看注册页是否 200）

import airports, { removed } from '../data/airports.mjs'
import site from '../data/site.mjs'

const NET = process.argv.includes('--net')
const errors = []
const warns = []

// 极简模式只强制这几个字段；since / rate / monthly 有就校验，没有不拦
const REQUIRED = ['name', 'url', 'affCode', 'type']

for (const a of airports) {
  const tag = a.name || '(未命名)'
  for (const k of REQUIRED) {
    if (!a[k]) errors.push(`${tag}: 缺字段 ${k}`)
  }
  if (a.since && !/^\d{4}\.\d{2}\.\d{2}$/.test(a.since)) {
    errors.push(`${tag}: since 格式应为 YYYY.MM.DD，当前 "${a.since}"`)
  }
  if (a.affCode && a.url && !a.url.includes(a.affCode)) {
    errors.push(`${tag}: url 里没有带上邀请码 ${a.affCode} —— 这条点进去不算你的业绩`)
  }
  if (a.url && !/^https:\/\//.test(a.url)) errors.push(`${tag}: url 必须 https`)
  if (!['active', 'paused', 'dropped'].includes(a.status)) {
    errors.push(`${tag}: status 只能是 active / paused / dropped`)
  }
  if (!['直连', '直连+', '中转', '专线'].includes(a.type)) {
    warns.push(`${tag}: type "${a.type}" 不在常规取值里，确认是否手误`)
  }
  if (a.coupons?.some((c) => !c.until)) {
    warns.push(`${tag}: 有优惠券没写有效期，过期不删会被读者当骗子`)
  }
  if (a.flags?.includes('🟨') && a.status === 'active') {
    warns.push(`${tag}: 带 🟨 却仍是 active，读者会困惑（这是有意的可以忽略）`)
  }
}

// 重复检测
const seen = new Map()
for (const a of airports) {
  let host = ''
  try {
    host = a.url ? new URL(a.url).host : ''
  } catch {
    errors.push(`${a.name}: url 不是合法链接（${a.url}）`)
  }
  if (!host) continue
  if (seen.has(host)) warns.push(`域名重复：${host}（${seen.get(host)} / ${a.name}）`)
  seen.set(host, a.name)
}

// 元信息体检
if (site.description.length < 80) warns.push('description 太短，关键词覆盖不足')
if (site.topics.length > 20) warns.push('topics 超过 20 个，GitHub 只认前 20 个')
if (!site.notices.length) warns.push('通知区为空 —— 这块是「还在维护」的证明，建议保留至少一条')

// 网络巡检
if (NET) {
  const targets = airports.filter((a) => a.status === 'active')
  const results = await Promise.all(
    targets.map(async (a) => {
      const t0 = Date.now()
      try {
        const ctl = AbortSignal.timeout(12000)
        const res = await fetch(a.url, { method: 'GET', redirect: 'follow', signal: ctl })
        return { name: a.name, status: res.status, ms: Date.now() - t0, ok: res.status < 400 }
      } catch (e) {
        return { name: a.name, status: 'ERR', ms: Date.now() - t0, ok: false, err: e.message }
      }
    })
  )
  console.log('\n── 网络巡检 ──')
  for (const r of results) {
    const mark = r.ok ? '✔' : '✘'
    console.log(`${mark} ${r.name.padEnd(14)} ${String(r.status).padEnd(5)} ${r.ms}ms ${r.err ?? ''}`)
    if (!r.ok) warns.push(`${r.name}: 注册页不可达（${r.status}）—— 可能被墙、被攻击，或已跑路`)
  }
}

console.log(`\n── 汇总 ──`)
console.log(`机场：${airports.length} 条（active ${airports.filter((a) => a.status === 'active').length}）｜已移除 ${removed.length} 条`)
for (const e of errors) console.log(`✘ ${e}`)
for (const w of warns) console.log(`⚠ ${w}`)
if (!errors.length && !warns.length) console.log('✔ 全部通过')
process.exit(errors.length ? 1 : 0)
