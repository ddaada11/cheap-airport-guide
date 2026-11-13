// 纯推荐版渲染器 v2：价格只写核实过的，未核实一律标「待核实」
// 用法：npm run topic
//
// v2 的核心改动（因为写错价格会毁掉整个推荐的可信度）：
//   · 价格不再从 topic 数据文件里读，只从 data/prices-verified.json 读
//   · 没有核实记录的机场，套餐表和对比表里都显示「待核实」，不写任何数字
//   · 第三方渠道（TG 频道等）的价格只作为「线索」出现在内部文件里，不进正文

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import topic from '../data/topic-1yuan.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'docs', `topic-${topic.slug}.md`)
const AFF = join(root, 'data', 'my-aff.json')
const PRICES = join(root, 'data', 'prices-verified.json')

let mine = {}
if (existsSync(AFF)) {
  try {
    mine = JSON.parse(readFileSync(AFF, 'utf8')).aff || {}
  } catch {
    console.warn('my-aff.json 解析失败，忽略')
  }
}

let verified = {}
if (existsSync(PRICES)) {
  try {
    verified = JSON.parse(readFileSync(PRICES, 'utf8')).verified || {}
  } catch {
    console.warn('prices-verified.json 解析失败，忽略')
  }
}

const strip = (h) => String(h || '').replace(/^www\./i, '').toLowerCase()
const usableCode = (v) => !!v && v !== 'FILL_ME' && !/^YOUR_CODE/.test(v)

function myAffFor(host) {
  const h = strip(host)
  if (!h) return null
  for (const [k, v] of Object.entries(mine)) {
    const kk = strip(k)
    if (!kk || kk.startsWith('_')) continue
    if (h === kk || h.endsWith('.' + kk)) return v
  }
  return null
}

/** 取核实过的价格；找不到返回 null（渲染成「待核实」） */
function verifiedPrices(it) {
  for (const h of [it.host, ...(it.hostAlias || [])].filter(Boolean)) {
    if (verified[h]) return verified[h]
  }
  return null
}

const pending = new Set()

function withMyCode(url, code) {
  if (!url) return ''
  if (!usableCode(code)) return url
  if (/[?&](code|aff|ref|invite)=/.test(url)) {
    return url.replace(/([?&](?:code|aff|ref|invite)=)[^&#]*/i, `$1${code}`)
  }
  return url + (url.includes('?') ? '&' : '?') + 'code=' + code
}

function resolve(it) {
  const hosts = [it.host, ...(it.hostAlias || [])].filter(Boolean)
  let my = null
  for (const h of hosts) {
    my = myAffFor(h)
    if (my) break
  }
  if (my && usableCode(my.code)) {
    return { url: my.url || withMyCode(it.url, my.code), isMine: true }
  }
  if (it.url && usableCode(it.code)) return { url: it.url, isMine: true }
  pending.add(it.name)
  const clean = String(it.url || '')
    .replace(/[?&](?:code|aff|ref|invite|inviter|promo)=YOUR_CODE_[A-Z0-9_]+/gi, '')
    .replace(/[?&]$/, '')
    .replace(/#$/, '')
  return { url: clean, isMine: false }
}

const money = (v) => (v == null ? '—' : String(v))
const gbTxt = (v) => (v == null ? '—' : `${v}G`)
const perGbTxt = (v) => (v == null ? '—' : String(v))
const cycleTxt = (c) => ({ 月: '元/月', 年: '元/年', 季: '元/季', 不限时: '元', 半年: '元/半年' }[c] || `元/${c}`)
const MONTHS = { 月: 1, 季: 3, 半年: 6, 年: 12 }
/** 每 GB 成本 = 总价 ÷ (每月流量 × 月数)。年付必须摊到 12 个月，否则会高估 12 倍 */
const perGbOf = (p) => {
  if (!p || p.gb == null || p.price == null) return null
  const m = MONTHS[p.cycle] ?? 1
  return +(p.price / (p.gb * m)).toFixed(5)
}

const L = []
const push = (...xs) => L.push(...xs)

push(`# ${topic.title}`, '')
push(`> 数据核对：**${topic.updated}**　｜　收录 **${topic.items.length}** 家　｜　全部支持月付`, '')
for (const p of topic.intro || []) push(p, '')
push('---', '')

// 快速对比
push('## 快速对比', '')
push('| 机场 | 价格 | 流量 | 每 GB | 线路 | 免费试用 | 入口 |')
push('| :--- | ---: | ---: | ---: | :--- | :--- | :---: |')
for (const it of topic.items) {
  const r = resolve(it)
  const vp = verifiedPrices(it)
  const p0 = vp?.plans?.[0]
  const priceTxt = p0 ? `${money(p0.price)} ${cycleTxt(p0.cycle)}` : '待核实'
  const gbOut = p0 ? gbTxt(p0.gb) : '待核实'
  const perGbOut = perGbOf(p0) ?? '—'
  push(
    `| **${it.name}** | ${priceTxt} | ${gbOut} | ${perGbOut} | ${it.line || '—'} | ${it.trial || '—'} | ${
      r.url ? `[进入](${r.url})${r.isMine ? '' : ' ⚠️'}` : '_待补充_'
    } |`
  )
}
push('')
push('> 「待核实」= 套餐页需要注册登录才能看，本文不猜价格。括号里是核实日期。', '')
push('---', '')

// 逐家
push('## 逐家介绍', '')
for (const it of topic.items) {
  const r = resolve(it)
  const vp = verifiedPrices(it)
  push(`### ${it.name} —— ${it.tagline}`, '')

  if (vp) {
    push(`| 套餐 | 价格 | 周期 | 流量 | 每 GB | 备注 |`)
    push('| :--- | ---: | :---: | ---: | ---: | :--- |')
    for (const p of vp.plans) {
      push(
        `| ${p.name} | ${money(p.price)} 元 | ${p.cycle} | ${gbTxt(p.gb)} | ${perGbOf(p) ?? '—'} | ${p.note || ''} |`
      )
    }
    push('')
    push(`> 价格来源：${vp.source}，核实于 ${vp.at}`, '')
  } else {
    push('| 套餐 | 价格 | 流量 | 备注 |')
    push('| :--- | :---: | :---: | :--- |')
    push('| 全部档位 | **待核实** | — | 套餐页需要注册登录后才能查看 |')
    push('')
    push(
      '> **本文不写未核实的数字。** 这类低价机场改价频繁，从第三方抄来的价格往往已经过期。' +
        '点下面的入口注册后，套餐页会显示当前实价。',
      ''
    )
  }

  push('**优点：**', '')
  for (const x of it.pros || []) push(`- ✅ ${x}`)
  push('')
  if (it.best) push(`🎯 **适合**：${it.best}`, '')
  if (r.url) push(`👉 **入口**：[${it.name}](${r.url})${r.isMine ? '' : '　⚠️ 待填邀请码'}`, '')
  push('')
}

// 三步上手
if (topic.steps?.length) {
  push('---', '')
  push('## 三步上手', '')
  topic.steps.forEach((s, i) => {
    push(`**${i + 1}. ${s.title}**`, '')
    push(s.desc, '')
  })
}

// 结尾
if (topic.footerNote) {
  push('---', '')
  push(`> ${topic.footerNote}`, '')
}

const out = L.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n')
writeFileSync(OUT, out, 'utf8')

const vCount = topic.items.filter((i) => verifiedPrices(i)).length
console.log(`✔ 已生成 ${OUT}（${topic.items.length} 家，其中 ${vCount} 家价格已核实，${topic.items.length - vCount} 家标「待核实」）`)
if (pending.size) console.log(`⚠ ${pending.size} 家还没填自己的邀请码：${[...pending].join('、')}`)
