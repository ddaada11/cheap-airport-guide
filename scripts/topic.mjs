// 专题渲染器：把 data/topic-1yuan.mjs 渲染成可直接发布的 markdown
// 用法：
//   npm run topic               # 渲染 docs/topic-1yuan.md
//   npm run topic -- --aff      # 额外打印返佣测算（只给你自己看，不写进稿子）
//
// 设计原则：
//   1. 稿子里每家的入口链接都会自动换成你在 data/my-aff.json 里填的码；
//      没填就渲染成占位符，并明确告诉你哪几条还没换 —— 绝不静默输出别人的码。
//   2. 人工清单（topic-1yuan.mjs）负责「写清楚」，shortlist 负责「不漏掉」：
//      人工清单里没有、但价格 ≤6.5 元的，自动补进附录。
//   3. 每家都必须带风险标注。没有风险标注的推荐，读者一眼就看出是广告。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import topic from '../data/topic-1yuan.mjs'
import extraPool from '../data/lowprice-extra.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'docs', `topic-${topic.slug}.md`)
const SHORTLIST = join(root, 'data', 'shortlist.json')
const FINALPOOL = join(root, 'data', 'pool-final.json')
const AFF = join(root, 'data', 'my-aff.json')

const argv = process.argv.slice(2)
const SHOW_AFF = argv.includes('--aff')

// ── 自己的推广码 ──────────────────────────────────────────────────────
let mine = {}
if (existsSync(AFF)) {
  try {
    mine = JSON.parse(readFileSync(AFF, 'utf8')).aff || {}
  } catch {
    console.warn('my-aff.json 解析失败，忽略')
  }
}
const strip = (h) => String(h || '').replace(/^www\./i, '').toLowerCase()
const myAffFor = (host) => {
  const h = strip(host)
  if (!h) return null
  for (const [k, v] of Object.entries(mine)) {
    const kk = strip(k)
    if (!kk || kk.startsWith('_')) continue
    if (h === kk || h.endsWith('.' + kk)) return v
  }
  return null
}

// ── 跑路名单（data/paolu.json，由 npm run paolu 生成）──────────────────
const PAOLU = join(root, 'data', 'paolu.json')
let paoluItems = []
if (existsSync(PAOLU)) {
  try {
    paoluItems = JSON.parse(readFileSync(PAOLU, 'utf8')).items || []
  } catch {}
}
const normP = (s) => String(s || '').toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '')
/** 查某家机场在跑路名单里的记录；返回 { open, closed, issues } 或 null */
function paoluFor(name) {
  const k = normP(name)
  if (!k || k.length < 2) return null
  for (const it of paoluItems) {
    const ik = normP(it.name)
    if (!ik) continue
    if (ik === k || (ik.length >= 2 && (ik.includes(k) || k.includes(ik)))) {
      return { open: it.open || 0, closed: it.closed || 0, issues: it.issues || [] }
    }
  }
  return null
}

const pending = new Set()
const usableCode = (v) => !!v && v !== 'FILL_ME' && !/^YOUR_CODE/.test(v)

/** 用你的码重写链接里的 code 参数；没填码就原样返回 */
function withMyCode(url, code) {
  if (!url) return ''
  if (!usableCode(code)) return url
  if (/[?&](code|aff|ref|invite)=/.test(url)) return url.replace(/([?&](?:code|aff|ref|invite)=)[^&#]*/i, `$1${code}`)
  return url + (url.includes('?') ? '&' : '?') + 'code=' + code
}

/** 把人工清单里的一条，解析成最终要渲染的 {url, code, isMine} */
function resolve(it) {
  const hosts = [it.host, ...(it.hostAlias || [])].filter(Boolean)
  let my = null
  for (const h of hosts) {
    my = myAffFor(h)
    if (my) break
  }
  // ① my-aff 里填了能用的码 → 一律用你的
  if (my && usableCode(my.code)) {
    return { url: my.url || withMyCode(it.url, my.code), code: my.code, isMine: true }
  }
  // ② 人工清单里直接写了真码（不是占位符）
  if (it.url && usableCode(it.code)) {
    return { url: it.url, code: it.code, isMine: true }
  }
  if (!it.url) return { url: '', code: '', isMine: false, missing: 'no-url' }
  pending.add(it.name)
  // 未填码：去掉 code 参数，让链接本身能点开预览；填码后自动带上
  const clean = String(it.url || '')
    .replace(/[?&](?:code|aff|ref|invite|inviter|promo)=YOUR_CODE_[A-Z0-9_]+/gi, '')
    .replace(/[?&]$/, '')
    .replace(/#$/, '')
  return { url: clean, code: '', isMine: false }
}

const money = (v) => (v == null ? '—' : `${v}`)
const gbTxt = (v) => (v == null ? '—' : `${v}G`)
const perGbTxt = (v) => (v == null ? '—' : `${v}`)

// ── 附录：shortlist 里 ≤6.5 元、但人工清单没写的 ────────────────────────
const norm = (n) =>
  String(n)
    .toLowerCase()
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/机场|加速器|加速|网络|专线|云$|雲$|cloud|vpn/g, '')
    .replace(/[^\w\u4e00-\u9fa5]/g, '')
const known = new Set(topic.items.map((i) => norm(i.name)))
let extras = []
const NAV = /jichangcha|jichangyyds|clashmetahub|clashshome|clashxiazai|bj999|why80|dianping\.men|github|t\.me/i

// ① 人工整理的候选池（第二轮扩充，价格和备注都是核过的）
for (const e of extraPool) {
  if (known.has(norm(e.name))) continue
  const perGb = e.gb ? +(e.price / e.gb).toFixed(4) : null
  extras.push({
    name: e.name,
    minMonthly: e.price,
    gb: e.gb,
    pricePerGb: perGb,
    line: e.line,
    note: e.note,
    aff: e.aff,
    src: e.src,
  })
}

// ② shortlist 自动补漏（有域名、价格 ≤6.5、且上面没提到的）
if (existsSync(SHORTLIST)) {
  const s = JSON.parse(readFileSync(SHORTLIST, 'utf8')).items
  for (const r of s) {
    if (r.minMonthly == null || r.minMonthly > 6.5) continue
    if (known.has(norm(r.name))) continue
    if (!r.hasHost || NAV.test(r.host)) continue
    if (extras.some((e) => norm(e.name) === norm(r.name))) continue
    extras.push({
      name: r.name,
      minMonthly: r.minMonthly,
      gb: r.gb,
      pricePerGb: r.pricePerGb,
      line: r.line,
      note: '',
      aff: r.hasCode ? 'known' : 'unknown',
      src: (r.sources || []).slice(0, 2).join(' / '),
    })
  }
}
extras.sort((a, b) => a.minMonthly - b.minMonthly)

// 加钱升级：8~15 元档。这一段是整篇稿子里客单价最高的位置，也是最该老实写的位置。
let upgrades = []
if (existsSync(SHORTLIST)) {
  const s = JSON.parse(readFileSync(SHORTLIST, 'utf8')).items
  upgrades = s
    .filter((r) => r.minMonthly != null && r.minMonthly >= 8 && r.minMonthly <= 15 && r.hasHost)
    .sort((a, b) => (a.pricePerGb ?? 9) - (b.pricePerGb ?? 9))
    .slice(0, 5)
    .map((r) => {
      const my = myAffFor(r.host)
      return { ...r, myUrl: my && usableCode(my.code) ? my.url || withMyCode(r.affUrl, my.code) : '' }
    })
}

// ── 渲染 ─────────────────────────────────────────────────────────────
const L = []
const push = (...xs) => L.push(...xs)

push(`# ${topic.title}`, '')
push(`> 数据核对：**${topic.updated}**　｜　收录 **${topic.items.length}** 家　｜　全部按最短周期买`, '')
push(topic.description, '')
push('---', '')

// 结论
push('## 先说结论', '')
for (const v of topic.verdict) push(`- ${v}`)
push('')

// 省流表
push('## 一、全表速览', '')
push('| 机场 | 档位 | 最低价 | 流量 | 每 GB | 线路 | 风险 | 入口 |')
push('| :--- | :--- | ---: | ---: | ---: | :--- | :--- | :---: |')
for (const it of topic.items) {
  const r = resolve(it)
  const p = it.plans?.[0] || {}
  const priceTxt =
    p.cycle === '试用'
      ? `免费试用 ${gbTxt(p.gb)}`
      : p.cycle === '年'
        ? `${money(p.price)} 元/年`
        : p.cycle === '不限时'
          ? `${money(p.price)} 元`
          : `${money(p.price)} 元/月`
  const entry = r.url ? `[进入](${r.url})${r.isMine ? '' : ' ⚠️'}` : '_待核实_'
  push(
    `| **${it.name}** | ${it.tier} | ${priceTxt} | ${gbTxt(p.gb)} | ${perGbTxt(p.perGb)} | ${it.line} | ${it.risk} | ${entry} |`
  )
}
push('')
push('> 每 GB 成本 = 月付价 ÷ 月流量。**这个数字比「几元一个月」更能说明便宜不便宜。**', '')
push('---', '')

// 分档详述
const TIERS = ['主力推荐', '备选推荐', '特殊用途']
const TIER_DESC = {
  主力推荐: '三家都有整月免费试用，先白嫖再决定。',
  备选推荐: '没有试用或单价稍高，但各有明确的特长。',
  特殊用途: '',
}
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四']
let secNo = 2
for (const tier of TIERS) {
  const list = topic.items.filter((i) => i.tier === tier)
  if (!list.length) continue
  push(`## ${CN[secNo - 1]}、${tier}（${list.length} 家）`, '')
  push(`> ${TIER_DESC[tier] || ''}`, '')
  for (const it of list) {
    const r = resolve(it)
    push(`### ${it.name} —— ${it.headline}`, '')
    push('| 项目 | 信息 |')
    push('| :--- | :--- |')
    push(`| 官网 | ${r.url ? `[${it.host || it.name}](${r.url})` : '_待核实_'} |`)
    push(`| 开业 | ${it.since || '待核实'} |`)
    push(`| 线路 | ${it.line || '待核实'} |`)
    push(`| 地区 | ${it.regions || '待核实'} |`)
    push(`| 设备数 | ${it.devices || '待核实'} |`)
    const pl = paoluFor(it.name)
    push(
      `| 跑路名单 | ${pl ? `有记录（未解决 ${pl.open} 条 / 已解决 ${pl.closed} 条，issue ${pl.issues.slice(0, 3).map((n) => '#' + n).join(' ')}）` : '无记录'} |`
    )
    push(`| 风险 | **${it.risk || '未知'}** |`)
    push('')
    if (it.plans?.length) {
      push('| 套餐 | 价格 | 周期 | 流量 | 每 GB | 说明 |')
      push('| :--- | ---: | :---: | ---: | ---: | :--- |')
      for (const p of it.plans) {
        push(
          `| ${p.name} | ${money(p.price)} 元 | ${p.cycle} | ${gbTxt(p.gb)} | ${perGbTxt(p.perGb)} | ${p.note || ''} |`
        )
      }
      push('')
    }
    if (it.pros?.length) {
      push('**好的地方：**', '')
      for (const x of it.pros) push(`- ✅ ${x}`)
      push('')
    }
    if (it.cons?.length) {
      push('**坑在哪：**', '')
      for (const x of it.cons) push(`- ⚠️ ${x}`)
      push('')
    }
    push(`📎 数据来源：${it.src}`, '')
    if (r.url) push(`👉 **入口**：[${it.name}](${r.url})`, '')
    else push('👉 **入口**：_官网待核实，本文暂不提供链接，避免导流到冒名站。_', '')
    push('---', '')
  }
  secNo++
}

// 1 元试用型
if (topic.trials?.length) {
  push(`## ${CN[secNo - 1]}、免费试用型：先白嫖一个月，再决定付不付钱（${topic.trials.length} 家）`, '')
  push('> **这个价位最理性的第一步，不是选哪家，是先把试用额度用满。** 下面几家里有 3 家给整月试用（1000G / 500G / 300G），用完再决定买谁。', '')
  push('| 机场 | 试用价格 | 说明 |')
  push('| :--- | :--- | :--- |')
  for (const t of topic.trials) push(`| **${t.name}** | ${t.price} | ${t.note} |`)
  push('')
  push('---', '')
  secNo++
}

// 不推荐段
if (topic.notRecommended?.length) {
  push(`## ${CN[secNo - 1]}、不推荐的 ${topic.notRecommended.length} 类，以及为什么`, '')
  push('> 这一段比推荐段更重要。**主动给同行打差评，是这篇稿子唯一能证明自己不是说谎的东西。**', '')
  for (const n of topic.notRecommended) {
    push(`### ${n.name}`, '')
    push(n.reason, '')
    push(`**结论**：${n.verdict}`, '')
    push('---', '')
  }
  secNo++
}

// 附录
if (extras.length) {
  push(`## ${CN[secNo - 1]}、同价位其他候选（${extras.length} 家，未逐家核实）`, '')
  secNo++
  push(
    '> 这些是从测评站和第三方清单里抓到的 1~7 元档机场。**列出来是为了不漏，不代表推荐**——' +
      '它们大多还没确认官网真伪、也没确认给不给推广。自己去注册时按「推广」那一列判断。',
    ''
  )
  push('| 机场 | 最低价 | 流量 | 每 GB | 线路 | 跑路记录 | 推广 | 备注 |')
  push('| :--- | ---: | ---: | ---: | :--- | :---: | :---: | :--- |')
  for (const r of extras) {
    const pl = paoluFor(r.name)
    const plTxt = pl ? (pl.open ? `⚠️ ${pl.open} 条未解决` : `已解决 ${pl.closed}`) : '—'
    const affTxt = r.aff === 'known' ? '有' : r.aff === 'none' ? '无' : '待确认'
    push(
      `| **${r.name}** | ${money(r.minMonthly)} 元 | ${gbTxt(r.gb)} | ${perGbTxt(r.pricePerGb)} | ${r.line || '—'} | ${plTxt} | ${affTxt} | ${r.note || ''} |`
    )
  }
  push('')
  push('---', '')
}

// 完整清单：所有验证过能打开、且没被跑路名单判死的 1~7 元档
let finalPool = []
if (existsSync(FINALPOOL)) {
  try {
    finalPool = (JSON.parse(readFileSync(FINALPOOL, 'utf8')).items || []).filter(
      (x) => x.verdict === 'safe' || x.verdict === 'watch'
    )
  } catch {}
}
if (finalPool.length) {
  const names = new Set(topic.items.map((i) => norm(i.name)))
  const rest = finalPool.filter((r) => !names.has(norm(r.name)))
  push(`## ${CN[secNo - 1]}、完整清单：验证过能打开的 ${finalPool.length} 家（${rest.length} 家未进正文）`, '')
  secNo++
  push(
    '> 这是本次核验的全部结果：216 家 1 元档机场里，域名还能打开的 75 家。' +
      '**「连通」这一列是 2026-11-13 用代理实测的结果**，打不开的 141 家已经全部剔除。' +
      '带 ⚠️ 的表示跑路名单里有未解决记录。',
    ''
  )
  push('| 机场 | 月付 | 流量 | 每 GB | 线路 | 连通 | 跑路记录 | 备注 |')
  push('| :--- | ---: | ---: | ---: | :--- | :---: | :---: | :--- |')
  const sorted = [...finalPool].sort((a, b) => (a.perGb ?? 99) - (b.perGb ?? 99) || (a.price ?? 99) - (b.price ?? 99))
  for (const r of sorted) {
    const pl = r.paoluOpen ? `⚠️ ${r.paoluOpen}` : '—'
    const conn = r.httpCode === 403 ? '✅ 403' : r.httpCode ? `✅ ${r.httpCode}` : '✅'
    push(
      `| ${r.name} | ${money(r.price)} 元 | ${gbTxt(r.gb)} | ${perGbTxt(r.perGb)} | ${(r.line || '—').slice(0, 30)} | ${conn} | ${pl} | ${(r.note || '').replace(/^直连[，,]?|^中转[，,]?/, '').slice(0, 44)} |`
    )
  }
  push('')
  push('> 这张表里任何一家都可能在一周内消失。**买之前先打开官网确认能进**，这是唯一有效的风控动作。', '')
  push('---', '')
}

// 推荐组合
push(`## ${CN[secNo - 1]}、三套现成组合，照着买就行`, '')
secNo++
push('> 不用自己算。按预算选一套，括号里是总成本。', '')
push('| 组合 | 一年预算 | 怎么配 | 适合谁 | 风险 |')
push('| :--- | ---: | :--- | :--- | :--- |')
for (const c of topic.combos || []) {
  push(`| **${c.name}** | ${c.budget} | ${c.items.join('<br>')} | ${c.fit} | ${c.risk} |`)
}
push('')

// 加钱升级
if (upgrades.length) {
  push(`## ${CN[secNo - 1]}、如果 1 元档不够用：加钱该加到哪`, '')
  secNo++
  push(
    '> 说实话：1 元档适合「有网就行」，不适合「网得好用」。如果你试了一个月，发现自己天天在等它恢复，' +
      '那多花的钱不是消费升级，是止损。下面这几家是 8~15 元档里每 GB 成本最低的，' +
      '线路从「公网直连」换成了「中转 / 专线」，晚高峰的差距主要在这一段。',
    ''
  )
  push('| 机场 | 月付 | 流量 | 每 GB | 线路 | 入口 |')
  push('| :--- | ---: | ---: | ---: | :--- | :---: |')
  for (const u of upgrades) {
    push(
      `| **${u.name}** | ${u.minMonthly} 元 | ${gbTxt(u.gb)} | ${perGbTxt(u.pricePerGb)} | ${u.line || '—'} | ${
        u.myUrl ? `[进入](${u.myUrl})` : '_待填码_'
      } |`
    )
  }
  push('')
  push('> 这一档的价格波动比 1 元档小，但也不是不会跑。同样建议一次只买一个月，跑顺了再考虑季付。', '')
  push('---', '')
}

// 怎么选
push(`## ${CN[secNo - 1]}、怎么选：六个具体问题`, '')
secNo++
for (const h of topic.howto) {
  push(`**${h.q}**`, '')
  push(h.a, '')
}

// 风险
push(`## ${CN[secNo - 1]}、风险声明（请读完再下单）`, '')
secNo++
for (const w of topic.warning) push(`- ${w}`)
push('')
push('---', '')
push(`## ${CN[secNo - 1]}、买完怎么用`, '')
push('1. 在官网后台复制 **订阅链接**（不是节点二维码，是那一长串 URL）。', '')
push('2. 导入客户端：Windows 用 v2rayN / Clash Verge，安卓用 v2rayNG / FlClash，iOS 用 Shadowrocket。', '')
push('3. 先测「延迟」再测「速度」：延迟全红说明线路不通，速度慢说明是晚高峰拥堵。', '')
push('4. 订阅链接等同于账号密码，**不要发给任何人，也不要贴到群里**。', '')
push('5. 用一周之后，把「晚高峰能不能用」记下来。这一条比任何评测都准。', '')
push('')
push('> 本文不含任何付费排名。价格为抓取时点数据，机场改价不另行通知。', '')

const out = L.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n')
writeFileSync(OUT, out, 'utf8')

console.log(`✔ 已生成 ${OUT}（${topic.items.length} 家 + ${extras.length} 家附录，${out.length} 字符）`)
if (pending.size) {
  console.log(`\n⚠ 以下 ${pending.size} 家的链接还是占位符，去 data/my-aff.json 填自己的码：`)
  console.log('  ' + [...pending].join('、'))
  console.log('  填完跑 npm run topic 会全部替换。现在直接发出去，注册和付费都记在别人账上。')
  console.log('  怎么填见 docs/how-to-aff.md（含各家面板推广页的具体路径）')
} else {
  console.log('\n✔ 所有入口都已经是你的码')
}

// ── 返佣测算（只给你自己看）──────────────────────────────────────────
if (SHOW_AFF) {
  console.log('\n================ 返佣测算（不要写进稿子）================')
  const RATE = 0.1 // 首单返佣比例。低价机场实际行情 5%~15%，这里按 10% 估
  const rows = []
  for (const it of topic.items) {
    const p = it.plans?.[0]
    if (!p?.price) continue
    const order = p.price // 客单价（一次付款额）
    rows.push({ name: it.name, order, commission: +(order * RATE).toFixed(2), tier: it.tier })
  }
  rows.sort((a, b) => b.commission - a.commission)
  console.log('按首单 10% 返佣估算（低价机场实际行情 5%~15%），单笔佣金：')
  for (const r of rows) {
    console.log(`  ${String(r.order).padStart(6)} 元/单  →  佣金 ${String(r.commission).padStart(5)} 元   ${r.name}（${r.tier}）`)
  }
  const avg = rows.reduce((s, r) => s + r.commission, 0) / rows.length
  console.log(`\n平均单笔佣金 ${avg.toFixed(2)} 元`)
  console.log('现实提醒：')
  console.log('  · 1 元档单笔佣金 0.1~0.3 元，1000 单才 100 元。这一档的作用是「拉流量」，不是「赚钱」。')
  console.log('  · 真正赚钱的是稿子里的「伪 1 元档」（6 元 1000G）和文末的「加钱升级」引导。')
  console.log('  · 所以这篇稿子的 KPI 不是「1 元档成交数」，是「从 1 元档跳到 6 元档的转化率」。')
  console.log(`  · 若每月 300 个注册、付费率 10%、平均客单 8 元、返佣 10% → 月佣金约 ${(300 * 0.1 * 8 * RATE).toFixed(0)} 元。`)
  console.log('  · 想把这个数字放大 10 倍，只有一条路：同一批读者被说服买 8~15 元档。')
}
