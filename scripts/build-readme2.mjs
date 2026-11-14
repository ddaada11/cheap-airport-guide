// 第二期 README 生成器（稳定机场）
// 用法：npm run readme2
// 输出：repo2/README.md
// 与第一期（便宜机场）互链，但打不同的搜索词，避免关键词蚕食

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import topic from '../data/topic-2.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(root, 'repo2')
const OUT = join(OUT_DIR, 'README.md')
const AFF = join(root, 'data', 'my-aff.json')
const PRICES = join(root, 'data', 'prices-verified.json')

mkdirSync(OUT_DIR, { recursive: true })

let mine = {}
if (existsSync(AFF)) {
  try {
    mine = JSON.parse(readFileSync(AFF, 'utf8')).aff || {}
  } catch {}
}
let verified = {}
if (existsSync(PRICES)) {
  try {
    const pj = JSON.parse(readFileSync(PRICES, 'utf8'))
    verified = { ...(pj.verified || {}), ...(pj.verified2 || {}) }
  } catch {}
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

function withMyCode(url, code) {
  if (!url) return ''
  if (!usableCode(code)) return url
  if (/[?&](code|aff|ref|invite|invite_code)=/.test(url)) {
    return url.replace(/([?&](?:code|aff|ref|invite|invite_code)=)[^&#]*/i, `$1${code}`)
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
  if (my && usableCode(my.code)) return { url: my.url || withMyCode(it.url, my.code), isMine: true }
  if (it.url && usableCode(it.code)) return { url: it.url, isMine: true }
  return { url: it.url || '', isMine: false }
}

function verifiedPrices(it) {
  for (const h of [it.host, ...(it.hostAlias || [])].filter(Boolean)) {
    if (verified[h]) return verified[h]
  }
  return null
}

const MONTHS = { 月: 1, 季: 3, 半年: 6, 年: 12, 三年: 36 }
const perGbOf = (p) => {
  if (!p || p.gb == null || p.price == null) return null
  const m = MONTHS[p.cycle] ?? 1
  return +(p.price / (p.gb * m)).toFixed(5)
}
const cycleTxt = (c) => ({ 月: '元/月', 年: '元/年', 季: '元/季', 半年: '元/半年', 三年: '元/三年', 不限时: '元' }[c] || `元/${c}`)

const L = []
const push = (...xs) => L.push(...xs)

push(`# 2026 稳定机场推荐：${topic.items.length} 家 IEPL / IPLC 专线机场`, '')
push(
  '> 稳定机场、专线机场、IEPL 机场、IPLC 机场 —— 这份清单只回答一个问题：' +
    '**晚高峰 20:00–23:00 会不会掉线**。纯公网直连的机场不进这份名单。',
  ''
)
push(`**数据核对：${topic.updated}**　｜　收录 **${topic.items.length}** 家　｜　全部为专线或中转线路`, '')
push('')
push(
  '「便宜」和「稳定」是两件事。低价机场走公网直连，白天够用，晚高峰会堵；' +
    '走 IEPL / IPLC 的机场租的是内网通道，晚高峰掉速不明显。这份清单只收后者。',
  ''
)
push('---', '')

// 线路类型说明
push('## 先搞清三种线路', '')
push('| 线路类型 | 走什么 | 晚高峰表现 | 价格带 |')
push('| :--- | :--- | :--- | ---: |')
push('| **IEPL / IPLC 专线** | 内网专线，不经过公网 | 最稳，几乎不掉速 | 15~30 元/月 |')
push('| **BGP 中转** | 国内 BGP 入口 + 跨境中转 | 较稳，偶有波动 | 12~25 元/月 |')
push('| **公网中转 / 优化** | 公网中转 + 路由优化 | 比直连好，晚高峰仍有影响 | 8~20 元/月 |')
push('')
push('> 三种线路的成本差就是价格差。**不存在「又便宜又是专线」这种事**——低于 8 元/月还说自己是专线的，基本都是公网中转包装的。', '')
push('---', '')

// 对比表
push('## 稳定机场快速对比', '')
push('| 机场 | 线路 | 价格 | 入口 |')
push('| :--- | :--- | ---: | :---: |')
for (const it of topic.items) {
  const r = resolve(it)
  const vp = verifiedPrices(it)
  const p0 = vp?.plans?.[0]
  push(`| **${it.name}** | ${it.line || '—'} | ${p0 ? p0.price + ' ' + cycleTxt(p0.cycle) : '待核实'} | ${r.url ? `[注册](${r.url})` : '—'} |`)
}
push('')
push('---', '')

// 逐家
push('## 逐家介绍', '')
for (const it of topic.items) {
  const r = resolve(it)
  const vp = verifiedPrices(it)
  push(`### ${it.name}：${it.tagline}`, '')
  push(`**线路**：${it.line || '待核实'}`, '')
  if (vp) {
    push('| 套餐 | 价格 | 周期 | 月流量 | 每 GB | 说明 |')
    push('| :--- | ---: | :---: | ---: | ---: | :--- |')
    for (const p of vp.plans) {
      push(`| ${p.name} | ${p.price} 元 | ${p.cycle} | ${p.gb}G | ${perGbOf(p)} | ${p.note || ''} |`)
    }
    push('')
    push(`> 价格来源：${vp.source}，核实于 ${vp.at}`, '')
  } else {
    push('> **价格待核实**：套餐页需要注册登录才能看。这个价位的机场改价频繁，本文不写未核实的数字。', '')
  }
  push('**优点：**', '')
  for (const x of it.pros || []) push(`- ✅ ${x}`)
  push('')
  if (it.best) push(`🎯 **适合**：${it.best}`, '')
  if (r.url) push(`👉 **注册入口**：[${it.name}](${r.url})`, '')
  push('')
}
push('---', '')

// FAQ
push('## 常见问题', '')
push('### 稳定机场和便宜机场差在哪？')
push(
  '主要差在线路成本。低价档走公网直连，晚高峰会堵；专线档租的是 IEPL / IPLC 内网通道，' +
    '同样 100G 流量，专线成本是直连的 3~5 倍。这就是为什么专线机场最低也要 15 元/月。',
  ''
)
push('### IEPL 和 IPLC 有什么区别？')
push(
  '两者都是内网专线，主要区别是接入方式和运营商。对普通用户来说：**都不用管，看价格和节点数量就行**。' +
    '宣传上说自己是 IPLC 但月付只要 5 元的，基本是公网中转包装的。',
  ''
)
push('### 晚高峰掉速怎么判断？')
push(
  '工作日 21:00–22:00 连续测三天，取最低值，不是取最快那次。' +
    '这 7 家大多自带线路检测页，注册前可以先看一眼自己所在地区到各入口的延迟。',
  ''
)
push('### 这份清单的价格准吗？')
push(
  '每个套餐都是登录各家后台「购买订阅」页截图抄下来的，标注了核实日期（2026-11-14）。' +
    '不写第三方渠道抄来的数字——那类价格通常已经过期。机场改价不会通知任何人，下单前还是以官网当前页面为准。',
  ''
)
push('### 预算有限，但又想要稳一点，怎么选？')
push(
  '选「公网中转 / 优化」那一档（宇宙云、二猫云），比纯直连稳，价格也比专线低。' +
    '或者看另一份清单：[便宜机场推荐](https://github.com/ddaada11/cheap-airport-guide) —— 那里是 1~6 元档。',
  ''
)
push('---', '')

// 互链
push('## 另一份清单', '')
push('| 清单 | 价格带 | 适合谁 |')
push('| :--- | ---: | :--- |')
push('| [便宜机场推荐](https://github.com/ddaada11/cheap-airport-guide) | 1~6 元/月 | 预算敏感、当备用、轻度使用 |')
push('| **稳定机场推荐**（本文） | 8~30 元/月 | 要开视频会、挂 AI 工具、晚高峰不能断 |')
push('')
push('---', '')
push('')
push(
  '> **免责声明**：本文为个人使用记录与信息整理，不构成购买建议。' +
    '所有服务均由第三方提供，价格、套餐、可用性随时可能变化。请在遵守所在地法律法规的前提下使用。',
  ''
)

const out = L.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n')
writeFileSync(OUT, out, 'utf8')

console.log(`✔ repo2/README.md 已生成（${topic.items.length} 家，${out.split('\n').length} 行，${out.length} 字符）`)
const pending = topic.items.filter((i) => !resolve(i).isMine)
if (pending.length) console.log(`⚠ ${pending.length} 家还没填邀请码：${pending.map((i) => i.name).join('、')}`)
