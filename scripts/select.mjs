// 选品器：从 shortlist 里按规则挑出「可以写进推荐」的机场，映射成 data/airports.mjs
// 用法：
//   npm run select              # 只生成草稿 data/airports.draft.mjs，不动正式文件
//   npm run select -- --commit  # 覆盖 data/airports.mjs（会保留人工字段）
//   npm run select -- --max 10  # 价格上限 10 元（默认 15）
//
// 规则（按「低价机场」这个选题定的，不是通用规则）：
//   1. 必须有价格（面板实测 > 多源观测），否则没法排序
//   2. 必须有官网域名（否则读者点不进去）
//   3. 必须有邀请码（否则不结算）
//   4. 默认只收 ≤ --max 元的，超过的是「高价档」，不进低价表
//   5. 已经有正式条目的机场，人工填过的 since / note / flags 一律保留

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHORTLIST = join(root, 'data', 'shortlist.json')
const AFF = join(root, 'data', 'my-aff.json')
const OFFICIAL = join(root, 'data', 'airports.mjs')
const DRAFT = join(root, 'data', 'airports.draft.mjs')

const argv = process.argv.slice(2)
const flag = (n) => argv.includes('--' + n)
const val = (n, d) => {
  const i = argv.indexOf('--' + n)
  if (i === -1) return d
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : d
}
const COMMIT = flag('commit')
const MAX = parseFloat(val('max', '15'))

if (!existsSync(SHORTLIST)) {
  console.error('缺 data/shortlist.json，先跑 npm run merge')
  process.exit(1)
}

const items = JSON.parse(readFileSync(SHORTLIST, 'utf8')).items

// 人工字段备份：正式文件里已经填过的 since / note / flags 不能被脚本冲掉
const manual = new Map()
if (existsSync(OFFICIAL)) {
  try {
    const mod = await import('file://' + OFFICIAL.replace(/\\/g, '/') + '?t=' + Date.now())
    for (const a of mod.default || []) manual.set(a.name, a)
  } catch {
    /* 空文件或语法错误，忽略 */
  }
}

const lineType = (line = '') => {
  if (/IPLC|IEPL|专线/.test(line)) return '专线'
  if (/中转|BGP|CN2|GIA/.test(line)) return '中转'
  if (/直连/.test(line)) return '直连'
  return '—'
}

const picked = items
  .filter((r) => r.hasPrice && r.hasHost && r.hasCode && r.minMonthly <= MAX)
  .sort((a, b) => a.minMonthly - b.minMonthly)

const rows = picked.map((r) => {
  const old = manual.get(r.name) || {}
  const monthly = r.gb
    ? `${r.minMonthly} 元 / ${r.gb}G`
    : `${r.minMonthly} 元起`
  const coupons = r.coupon
    ? [
        {
          off: r.afterCoupon ? `券后 ${r.afterCoupon} 元` : '有券',
          code: r.coupon,
          scope: '',
          until: '',
        },
      ]
    : []
  const flags = [...(old.flags || [])]
  if (!r.isMine) flags.push('🔁') // 🔁 = 邀请码还是别人的，发出去等于替同行打工
  if (r.priceSource !== 'probe') flags.push('📜') // 📜 = 价格来自第三方观测，未实测
  return {
    name: r.name,
    url: r.affUrl || `https://${r.host}`,
    since: old.since || '', // 开业日期抓不到，必须人工补
    type: old.type || lineType(r.line),
    rate: old.rate || '',
    monthly,
    oneTime: old.oneTime || '',
    trial: r.trial ? '有' : old.trial || '-',
    proto: old.proto || (r.protocol ? r.protocol.split('/')[0].trim().slice(0, 8) : ''),
    flags: [...new Set(flags)],
    coupons: coupons.length ? coupons : old.coupons || [],
    note: old.note || (r.pricePerGb ? [`每 GB 约 ${r.pricePerGb} 元`] : []),
    status: old.status || 'active',
    _src: { host: r.host, band: r.band, srcCount: r.srcCount, sources: r.sources },
  }
})

const removed = []
const body =
  '// 由 npm run select 生成。人工字段（since / note / flags）会在下次生成时保留。\n' +
  '// 改数据请改 data/shortlist.json 或 data/my-aff.json，不要手改本文件。\n' +
  'export default ' +
  JSON.stringify(rows, null, 2) +
  '\n\nexport const removed = ' +
  JSON.stringify(removed, null, 2) +
  '\n'

const target = COMMIT ? OFFICIAL : DRAFT
writeFileSync(target, body, 'utf8')

const borrowed = rows.filter((r) => !picked.find((p) => p.name === r.name).isMine).length
console.log(`选中 ${rows.length} 家（≤${MAX} 元，价格+域名+邀请码齐全）→ ${target}`)
console.log(`  其中 ${borrowed} 家的邀请码还不是你自己的（标了 🔁）`)
console.log(`  未标 📜 的 = 面板实测价；标 📜 的 = 来自第三方源，发布前建议自己买一个月核一遍`)
if (!COMMIT) {
  console.log('\n这是草稿。确认无误后：npm run select -- --commit && npm run build')
} else {
  console.log('\n已覆盖 data/airports.mjs，跑 npm run build 出 README')
}
console.log('\n前 15 家：')
for (const r of rows.slice(0, 15)) {
  console.log(`  ${r.monthly.padEnd(18)} ${r.name.padEnd(12)} ${r.type.padEnd(4)} ${r.url}`)
}
