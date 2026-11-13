// 事实抽取器：从 ref/sources/*.md 抽结构化机场事实
// 用法：npm run enrich
// 产出：data/facts.json
//
// 两类源，两种解析：
//   ① 表格型（机场查 / 机场YYDS / clashmetahub）→ 机场名 + 最低月付 + 优惠码 + 评分 + 节点数 + 线路
//   ② 长文型（低价机场推荐 / hwanz / RandomJackor）→ 标题里的「机场名(价格/流量)」+ 标题附近 8 行内的注册链接
// ② 是关键：它是唯一能把「机场名 → 价格」和「机场名 → 官网域名 + 邀请码」绑在同一行的地方。
//
// 为什么不并入 discover：discover 只认链接（域名是产出物），enrich 认的是字段（价格是产出物）。
// 两者在 build 阶段按名字归一化后合并。

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = join(root, 'ref', 'sources')
const OUT = join(root, 'data', 'facts.json')

const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{2705}\u{26A0}\u{1F6AB}]/gu

/** 不是机场官网的域名（导航站 / 平台 / 社交）——表格里链接指向这些时只记跳转地址，不当官网 */
const NAV_HOST =
  /jichangcha\.com|jichangyyds\.com|clashmetahub\.net|clashshome\\.com|clashxiazai\\.com|bj999\\.cc|why80\\.com|dianping\\.men|github|t\.me|telegram|youtube|bilibili|zhihu|juejin|v2ex/i

function cell(raw) {
  return String(raw || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(EMOJI, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}
const codeOf = (u) => {
  const m = /[?&](?:code|aff|ref|invite|inviter|promo)=([\w-]{3,})/i.exec(u)
  return m ? m[1] : ''
}

// ── 价格 / 套餐解析 ──────────────────────────────────────────────────
/** 「8 元/月 60GB(年付)」「¥12.75」「25 元起」「260元/半年200G/月」「2/月100G」→ 结构化 */
export function parsePlan(text) {
  const s = cell(text)
  if (!s || /^[-—–]+$/.test(s) || /数据不足|未公开|暂无/.test(s)) return null
  const out = {}
  const price =
    /[¥￥]\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*元|(?:^|[^\d.])(\d+(?:\.\d+)?)\s*\/\s*(?:月|年|季)/.exec(s)
  if (price) out.price = parseFloat(price[1] || price[2] || price[3])
  const gb = /(\d+(?:\.\d+)?)\s*(?:GB|G|g)\b/.exec(s)
  if (gb) out.gb = parseFloat(gb[1])
  if (/年付|每年|\/年|半年/.test(s)) out.cycle = /半年/.test(s) ? '半年' : '年付'
  else if (/季付|\/季/.test(s)) out.cycle = '季付'
  else if (/月付|\/月/.test(s)) out.cycle = '月付'
  if (/不限时|一次性|买断|永久/.test(s)) out.cycle = '不限时'
  if (/试用|免费/.test(s)) out.trial = true
  return Object.keys(out).length ? out : null
}

const numOf = (t) => {
  const m = /(\d+(?:\.\d+)?)/.exec(cell(t))
  return m ? parseFloat(m[1]) : null
}

// ── ① 表格型 ────────────────────────────────────────────────────────
const COLS = [
  ['name', /^(机场|品牌|名称|机场品牌|机场名称)$/],
  ['minPlan', /最低套餐|最低月付|起价|标称起价|月付/],
  ['coupon', /优惠码|优惠券|券码/],
  ['afterCoupon', /券后/],
  ['score', /评分|得分/],
  ['nodes', /节点数|节点/],
  ['line', /线路/],
  ['protocol', /协议/],
  ['tier', /档位|分类|类型/],
  ['rank', /^排名$|^#$/],
]

/** 不是机场名的表头/分组词 */
const NOT_A_NAME = /机场品牌|^品牌$|^名称$|合计|总计|说明|示例|^(其他|性价比最高|低价走量|主流性价比|高价档|档位|价格区间|本期|项目)$/

function mapHeader(cells) {
  const map = {}
  cells.forEach((c, i) => {
    const t = cell(c)
    for (const [field, re] of COLS) {
      if (map[field] !== undefined) continue
      if (re.test(t)) {
        map[field] = i
        break
      }
    }
  })
  return map
}

function parseRow(cells, map) {
  if (map.name === undefined) return null
  const name = cell(cells[map.name])
  if (!name || name.length < 2 || name.length > 20) return null
  if (NOT_A_NAME.test(name)) return null
  if (/^[-—–:]+$/.test(name)) return null

  const rec = { name, via: 'table' }
  if (map.minPlan !== undefined) rec.plan = parsePlan(cells[map.minPlan])
  if (map.coupon !== undefined) {
    const c = cell(cells[map.coupon])
    if (c && !/^[-—–]+$/.test(c) && c.length <= 24) rec.coupon = c
  }
  if (map.afterCoupon !== undefined) {
    const v = numOf(cells[map.afterCoupon])
    if (v) rec.afterCoupon = v
  }
  if (map.score !== undefined) {
    const v = numOf(cells[map.score])
    if (v) rec.score = v
  }
  if (map.nodes !== undefined) {
    const v = numOf(cells[map.nodes])
    if (v) rec.nodes = v
  }
  for (const [f, i] of [
    ['line', map.line],
    ['protocol', map.protocol],
    ['tier', map.tier],
  ]) {
    if (i === undefined) continue
    const v = cell(cells[i])
    if (v && v.length <= 40 && !/^[-—–]+$/.test(v)) rec[f] = v
  }
  if (!rec.plan && !rec.coupon && !rec.score && !rec.line && !rec.protocol && !rec.tier) return null
  return rec
}

function parseTables(md) {
  const lines = md.split('\n')
  const rows = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|/.test(lines[i])) continue
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue
    const header = lines[i].split('|').slice(1, -1)
    const map = mapHeader(header)
    let j = i + 2
    for (; j < lines.length; j++) {
      if (!/^\s*\|/.test(lines[j])) break
      const rec = parseRow(lines[j].split('|').slice(1, -1), map)
      if (rec) rows.push(rec)
    }
    i = j - 1
  }
  return rows
}

// ── ② 长文型 ────────────────────────────────────────────────────────
const HEAD = /^(#{2,4})\s+(.+)$/
const TITLE_STOP =
  /^(目录|购买|客户端|总结|机场推荐|本期|完整|逐家|省流|免责|特别|关于|如何|什么|怎么|为什么|前言|更新|声明|注意事项|测试|测速|价格档位|三步|这份|一句话|本期核对|风险|常见|延伸|参考|数据|对比|榜单|排行|导航|术语|问答|FAQ|订阅|教程|使用|安装|配置|下载|优惠|活动|公告|说明|收录|核对|新收录|哪家|是否|可以|需要|建议|如何选择|如何判断|怎么选|怎么买|买机场|不推荐|低价走量|主流性价比|高价档|档位|价格区间|其他)/i

/** 从标题里抠出机场名与括号参数 */
function nameFromTitle(title) {
  let s = cell(title)
  s = s
    .replace(/^[\d０-９]+\s*[.、·]\s*/, '')
    .replace(/^[一二三四五六七八九十百]+\s*[、.]\s*/, '')
    .replace(/^[①-⑳]\s*/, '')
    .replace(/^[·•]\s*/, '')

  let planText = ''
  const par = /[（(]([^（()）]{2,70})[)）]\s*$/.exec(s)
  if (par) {
    planText = par[1]
    s = s.slice(0, par.index)
  }

  s = s.split(/[｜|]/)[0]
  s = s.split(/\s+[-—–]\s+/)[0]
  s = s.replace(/机场|加速器|加速|官网|测评|评测|推荐|价格|套餐|怎么样|深度/g, '').trim()
  s = s.replace(/^[\s·•]+|[\s·•]+$/g, '')
  if (!s || s.length < 2 || s.length > 18) return null
  if (TITLE_STOP.test(s)) return null
  if (/^[a-z]{1,2}$/i.test(s)) return null
  return { name: s, planText }
}

function parseProse(md) {
  const lines = md.split('\n')
  const rows = []
  for (let i = 0; i < lines.length; i++) {
    const m = HEAD.exec(lines[i])
    if (!m) continue
    const t = nameFromTitle(m[2])
    if (!t) continue

    const rec = { name: t.name, via: 'prose' }
    const plan = parsePlan(t.planText)
    if (plan) rec.plan = plan
    else if (t.planText) rec.note = t.planText.slice(0, 40)

    // 标题后 8 行内找第一个真官网链接（跳过导航站跳转链接）
    for (let j = i + 1; j < Math.min(i + 9, lines.length); j++) {
      if (HEAD.test(lines[j])) break
      const link = /\]\((https?:\/\/[^\s)]+)\)/.exec(lines[j])
      if (!link) continue
      const host = hostOf(link[1])
      if (!host) continue
      if (NAV_HOST.test(host)) {
        rec.jumpUrl = rec.jumpUrl || link[1]
        continue
      }
      rec.url = link[1]
      rec.host = host
      rec.code = codeOf(link[1])
      break
    }

    if (!rec.plan && !rec.url && !rec.note) continue
    rows.push(rec)
  }
  return rows
}

// ── 名字归一化（跨源合并键）──────────────────────────────────────────
const normName = (n) =>
  String(n)
    .toLowerCase()
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/机场|加速器|加速|网络|专线|云$|雲$|cloud|vpn/g, '')
    .replace(/[^\w\u4e00-\u9fa5]/g, '')

// ── 主流程 ──────────────────────────────────────────────────────────
if (!existsSync(SRC_DIR)) {
  console.error('缺 ref/sources，先跑 npm run harvest')
  process.exit(1)
}

const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.md'))
const byKey = new Map()
const perSource = []

for (const f of files) {
  const src = f.replace(/\.md$/, '')
  const md = readFileSync(join(SRC_DIR, f), 'utf8')
  const rows = [...parseTables(md), ...parseProse(md)]
  let useful = 0

  for (const r of rows) {
    const key = normName(r.name)
    if (!key || key.length < 2) continue
    const cur = byKey.get(key) || { name: r.name, aliases: [], sources: [] }
    cur.sources = [...new Set([...cur.sources, src])]
    if (!cur.aliases.includes(r.name)) cur.aliases.push(r.name)

    if (r.plan?.price != null) {
      cur.priceObs = [
        ...(cur.priceObs || []),
        { v: r.plan.price, gb: r.plan.gb ?? null, cycle: r.plan.cycle || '', src },
      ]
      if (cur.minMonthly == null || r.plan.price < cur.minMonthly) cur.minMonthly = r.plan.price
      if (r.plan.gb && (cur.gb == null || r.plan.gb > cur.gb)) cur.gb = r.plan.gb
      if (r.plan.cycle) cur.cycle = r.plan.cycle
      if (r.plan.trial) cur.trial = true
      if (r.plan.gb) {
        const pg = +(r.plan.price / r.plan.gb).toFixed(4)
        if (cur.pricePerGb == null || pg < cur.pricePerGb) cur.pricePerGb = pg
      }
    }
    if (r.coupon && !cur.coupon) cur.coupon = r.coupon
    if (r.afterCoupon != null && (cur.afterCoupon == null || r.afterCoupon < cur.afterCoupon))
      cur.afterCoupon = r.afterCoupon
    if (r.score != null && (cur.score == null || r.score > cur.score)) cur.score = r.score
    if (r.nodes != null && (cur.nodes == null || r.nodes > cur.nodes)) cur.nodes = r.nodes
    for (const f2 of ['line', 'protocol', 'tier', 'note']) if (r[f2] && !cur[f2]) cur[f2] = r[f2]
    // 域名与邀请码：有真域名就记，多个域名视为备用入口
    if (r.host) {
      cur.hosts = [...new Set([...(cur.hosts || []), r.host])]
      if (r.url) cur.urls = [...new Set([...(cur.urls || []), r.url])]
      if (r.code && !cur.code) cur.code = r.code
    }
    if (r.jumpUrl) cur.jumpUrl = cur.jumpUrl || r.jumpUrl
    byKey.set(key, cur)
    useful++
  }
  perSource.push({ src, rows: rows.length, useful })
}

const items = [...byKey.values()]
  .filter((i) => i.minMonthly != null || i.coupon || i.line || i.hosts)
  .sort((a, b) => (a.minMonthly ?? 999) - (b.minMonthly ?? 999))

const out = {
  updated: new Date().toISOString(),
  note: 'scripts/enrich.mjs 从 ref/sources/*.md 抽取。minMonthly 取多源观测最低值；priceObs 保留全部原始观测，便于发现「同一家报价不一致」',
  sources: perSource,
  items,
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8')

const withHost = items.filter((i) => i.hosts?.length).length
console.log(`源文件 ${files.length} 份`)
for (const s of perSource.filter((x) => x.useful)) console.log(`  ${s.src}: 记录 ${s.rows} → 有效 ${s.useful}`)
console.log(`\n机场事实 ${items.length} 条（其中 ${withHost} 条已绑定官网域名）→ ${OUT}`)
console.log('\n最低价 TOP 25：')
for (const i of items.slice(0, 25)) {
  console.log(
    `  ${String(i.minMonthly).padStart(6)}元  ${(i.gb ? i.gb + 'G' : '?').padEnd(6)} ${(i.pricePerGb ?? '').toString().padEnd(7)} ${i.name.padEnd(12)} ${(i.line || '').slice(0, 14).padEnd(15)} ${i.coupon ? '券:' + i.coupon : ''} ${i.hosts ? '· ' + i.hosts[0] : ''}`
  )
}
