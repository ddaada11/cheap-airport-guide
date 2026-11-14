// GitHub README 生成器（SEO 版）
// 用法：npm run readme
// 输入：data/topic-1yuan.mjs（正文数据）+ data/prices-verified.json（核实价格）+ data/my-aff.json（邀请码）
// 输出：README.md（仓库首页）
//
// SEO 设计：
//   ① 标题层：H1 含主词「便宜机场推荐」，H2 含「一元机场」「低价机场」「常见问题」
//   ② 首段：3 句内自然出现 5 个同义词（便宜机场 / 一元机场 / 低价机场 / 平价机场 / 性价比机场）
//   ③ 表格：结构化数据，搜索引擎和 AI 摘要都偏好这种格式
//   ④ FAQ：覆盖长尾问句（哪个好 / 还能用吗 / 怎么选 / 怎么导入）
//   ⑤ 不堆砌：每个词只出现必要的次数，避免被判 spam

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import topic from '../data/topic-1yuan.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'README.md')
const AFF = join(root, 'data', 'my-aff.json')
const PRICES = join(root, 'data', 'prices-verified.json')

let mine = {}
if (existsSync(AFF)) {
  try {
    mine = JSON.parse(readFileSync(AFF, 'utf8')).aff || {}
  } catch {}
}
let verified = {}
if (existsSync(PRICES)) {
  try {
    verified = JSON.parse(readFileSync(PRICES, 'utf8')).verified || {}
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

push(`# 2026 便宜机场推荐：${topic.items.length} 家实测可用的低价机场（附套餐与每 GB 成本）`, '')
push(
  '> 便宜机场、一元机场、低价机场、平价机场、性价比机场 —— 这份清单只做一件事：' +
    '把「每块钱能买多少流量」算清楚。所有机场的官网都逐个打开验证过，所有价格都是登录后台截图核实的。',
  ''
)
push(`**数据核对：${topic.updated}**　｜　收录 **${topic.items.length}** 家　｜　全部支持月付或年付`, '')
push('')
push(
  '网上大部分「便宜机场推荐」有三个问题：链接点开是域名出售页、价格是几个月前抄的、' +
    '只写「几元一个月」不告诉你给多少流量。这份清单逐条解决：',
  ''
)
push('| 常见问题 | 这份清单怎么做的 |')
push('| :--- | :--- |')
push('| 链接点开是域名出售页 | 每个官网都单独打开验证，跳停放页、只剩空页面的全部剔除 |')
push('| 价格是几个月前抄的 | 价格全部来自登录后「购买订阅」页的截图，标注核实日期 |')
push('| 只写几元一个月 | 同时给出月流量和**每 GB 成本**，同样 100G 最便宜的 0.2 元、最贵的 2 元 |')
push('')
push('---', '')

// 对比表
push('## 便宜机场快速对比（按每 GB 成本排序）', '')
push('| 机场 | 价格 | 月流量 | 每 GB | 线路 | 入口 |')
push('| :--- | ---: | ---: | ---: | :--- | :---: |')
const sorted = [...topic.items].sort((a, b) => {
  const pa = verifiedPrices(a)?.plans?.[0]
  const pb = verifiedPrices(b)?.plans?.[0]
  return (perGbOf(pa) ?? 99) - (perGbOf(pb) ?? 99)
})
for (const it of sorted) {
  const r = resolve(it)
  const p0 = verifiedPrices(it)?.plans?.[0]
  push(
    `| **${it.name}** | ${p0 ? p0.price + ' ' + cycleTxt(p0.cycle) : '待核实'} | ${
      p0 ? p0.gb + 'G' : '—'
    } | ${perGbOf(p0) ?? '—'} | ${it.line || '—'} | ${r.url ? `[注册](${r.url})` : '—'} |`
  )
}
push('')
push('> 每 GB 成本 = 总价 ÷（月流量 × 月数）。年付按 12 个月摊、三年付按 36 个月摊。', '')
push('---', '')

// 逐家
push('## 逐家介绍', '')
for (const it of sorted) {
  const r = resolve(it)
  const vp = verifiedPrices(it)
  push(`### ${it.name}：${it.tagline}`, '')
  if (vp) {
    push('| 套餐 | 价格 | 周期 | 月流量 | 每 GB | 说明 |')
    push('| :--- | ---: | :---: | ---: | ---: | :--- |')
    for (const p of vp.plans) {
      push(`| ${p.name} | ${p.price} 元 | ${p.cycle} | ${p.gb}G | ${perGbOf(p)} | ${p.note || ''} |`)
    }
    push('')
    push(`> 价格来源：${vp.source}，核实于 ${vp.at}`, '')
  }
  push('**优点：**', '')
  for (const x of it.pros || []) push(`- ✅ ${x}`)
  push('')
  if (it.best) push(`🎯 **适合**：${it.best}`, '')
  if (r.url) push(`👉 **注册入口**：[${it.name}](${r.url})`, '')
  push('')
}
push('---', '')

// FAQ（长尾词）
push('## 常见问题', '')
push('### 便宜机场哪个好？')
push(
  '看每 GB 成本，不看「几元一个月」。同样 100G，有的收 0.2 元、有的收 2 元，差 10 倍。' +
    '预算最紧就选每 GB 0.002~0.006 元那一档，日常刷视频、查资料完全够用。',
  ''
)
push('### 一元机场还能用吗？')
push(
  '「一元机场」这个品类里，真正月付 1 元的站大部分已经关站了。现在能正常用的，' +
    '基本是「年付 12~13 元、折合每月 1 元」这种形态。本文收录的都是官网能打开、价格能核实的。',
  ''
)
push('### 便宜机场和贵机场差在哪？')
push(
  '主要差在线路。低价档走公网直连，晚高峰（20:00–23:00）会慢；高价档租的是 IPLC / IEPL 专线，' +
    '晚高峰不明显。如果只是白天用、或者当备用，低价档够用；如果要开视频会、跑大流量任务，加钱上专线更省心。',
  ''
)
push('### 机场订阅怎么导入 Clash / 小火箭？')
push('1. 在机场后台复制**订阅链接**（那一长串 URL，不是节点二维码）。', '')
push('2. Windows 装 Clash Verge，安卓装 FlClash，iOS 装 Shadowrocket（小火箭）。', '')
push('3. 在客户端里「导入订阅」→ 粘贴链接 → 更新 → 选延迟最低的节点。', '')
push('4. 订阅链接等同于账号密码，**不要发给任何人**。', '')
push('')
push('### 为什么不推荐一次买三年？')
push(
  '三年付确实更便宜（本文里有 36 元三年的），但这个价位的机场平均寿命以月计。' +
    '第一次买，一律选最短周期，跑顺了再考虑长期。',
  ''
)
push('---', '')

// 互链（指向第二期：稳定机场）
push('## 另一份清单', '')
push('| 清单 | 价格带 | 适合谁 |')
push('| :--- | ---: | :--- |')
push('| **便宜机场推荐**（本文） | 1~6 元/月 | 预算敏感、当备用、轻度使用 |')
push('| [稳定机场推荐](https://github.com/ddaada11/stable-airport-guide) | 8~30 元/月 | 要开视频会、挂 AI 工具、晚高峰不能断 |')
push('')
push('> 两份清单的机场**不重叠**：本文只收 1~6 元档，专线机场（IEPL / IPLC）都在另一份里。', '')
push('---', '')
push('')

// 数据来源
push('## 数据来源与更新', '')
push('这份清单的数据是脚本采集 + 人工核实的组合：', '')
push('| 环节 | 做法 |')
push('| :--- | :--- |')
push('| 机场发现 | 抓 GitHub 推荐仓库、机场测评站、Telegram 公开频道（`t.me/s/` 无需登录） |')
push('| 域名验证 | 逐个抓 HTML 判断是「真面板」还是「域名停放页」，看结构不看状态码 |')
push('| 价格核实 | 登录每家后台「购买订阅」页截图，人工录入 |')
push('| 每 GB 成本 | 按周期摊到月，再除以月流量 |')
push('')
push('**所有价格标注核实日期，机场改价不会通知任何人，下单前请以官网当前页面为准。**', '')
push('')
push('如果这篇清单对你有用，点一下右上角的 `star`，这是我保持更新的动力。', '')
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

console.log(`✔ README.md 已生成（${topic.items.length} 家，${out.split('\n').length} 行，${out.length} 字符）`)
const pending = topic.items.filter((i) => !resolve(i).isMine)
if (pending.length) console.log(`⚠ 还有 ${pending.length} 家没填邀请码：${pending.map((i) => i.name).join('、')}`)
else console.log('✔ 所有入口都带上了你的邀请码')
