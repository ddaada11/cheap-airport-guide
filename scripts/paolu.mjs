// 跑路名单解析器：把 limbopro/Paolujichang 的 issue 标题解析成「机场 → 风险记录」
// 用法：npm run paolu
// 产出：data/paolu.json
//
// 为什么这一步比多抓十个推荐源更重要：
//   推荐源告诉你「谁在卖」，跑路名单告诉你「谁已经死了」。
//   只做前者，你会把已经跑路的机场写进推荐位——这是这个品类最致命的错误。
//
// 数据来源：GitHub issue 标题，格式统一为「[机场跑路/风险反馈]：机场名 域名 补充说明」
//   open   = 问题未解决（大概率还在）
//   closed = 已解决或确认没跑

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'ref', 'paolu-issues.json')
const OUT = join(root, 'data', 'paolu.json')

if (!existsSync(SRC)) {
  console.error('缺 ref/paolu-issues.json，先跑 npm run paolu -- --fetch')
  process.exit(1)
}

const issues = JSON.parse(readFileSync(SRC, 'utf8'))

/** 标题清洗：去掉 [xxx] 前缀和冒号 */
function parseTitle(t) {
  const s = String(t || '')
    .replace(/^\[[^\]]*\]\s*[：:]?\s*/, '')
    .replace(/^【[^】]*】\s*/, '')
    .trim()
  if (!s) return null
  return s
}

/** 从标题里抠机场名与域名 */
function split(s) {
  const hosts = []
  // 域名 / IP / 带路径的入口
  const re = /\b((?:[a-z0-9-]+\.)+(?:com|net|org|cc|io|xyz|top|site|club|vip|me|app|pw|ltd|sb|ink|asia|biz|cfd|you|shs|click|men|monster|cloud|link|life|wiki|info|pro|shop|store|online|tech|space|website|fun|host|press|icu|love|work|art|design|dev|page|bond|cyou|sbs|bid|cf|ga|gq|ml|tk))\b/gi
  let m
  while ((m = re.exec(s))) hosts.push(m[1].toLowerCase())
  const ip = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(s)
  if (ip) hosts.push(ip[1])

  // 名字：第一个域名/说明词之前的部分
  let name = s
  if (hosts.length) {
    const idx = s.toLowerCase().indexOf(hosts[0])
    if (idx > 0) name = s.slice(0, idx)
  }
  name = name
    .replace(/[（(].*?[)）]/g, '')
    .replace(/——.*$|--.*$|-{1,2}\s*.*$/, '')
    .replace(/疑似跑路|已经跑路|已跑路|跑路|避雷|风险提示|待核实|待观察|不推荐|已证实|已经证实|机场|VPN|vpn/gi, '')
    .replace(/[，,。.、!！?？~～\s]+/g, ' ')
    .trim()
  if (!name || name.length > 16) name = ''
  return { name, hosts }
}

const byKey = new Map()
const rows = []
for (const it of issues) {
  const t = parseTitle(it.title)
  if (!t) continue
  const { name, hosts } = split(t)
  if (!name && !hosts.length) continue
  const rec = {
    issue: it.n,
    state: it.state,
    title: String(it.title).slice(0, 90),
    name,
    hosts,
    at: it.created || '',
  }
  rows.push(rec)
  const key = (name || hosts[0] || '').toLowerCase().replace(/\s+/g, '')
  if (!key) continue
  const cur = byKey.get(key) || { name, hosts: [], issues: [], open: 0, closed: 0 }
  cur.hosts = [...new Set([...cur.hosts, ...hosts])]
  cur.issues.push(it.n)
  if (it.state === 'open') cur.open++
  else cur.closed++
  byKey.set(key, cur)
}

const items = [...byKey.values()].sort((a, b) => b.open - a.open || b.issues.length - a.issues.length)
const out = {
  updated: new Date().toISOString(),
  note: '来自 limbopro/Paolujichang 的 issue 标题。open = 问题未解决，closed = 已解决/确认没跑。这是「排除已死机场」的依据，不是「判死刑」的依据——open 也可能是单个用户的问题。',
  total: items.length,
  items,
  raw: rows,
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8')

console.log(`解析 ${rows.length} 条 issue → ${items.length} 家机场 → ${OUT}`)
console.log('\n被反馈最多（open issue 数）的 25 家：')
for (const i of items.slice(0, 25)) {
  console.log(
    `  open ${String(i.open).padStart(2)} / closed ${String(i.closed).padStart(2)}   ${(i.name || i.hosts[0] || '?').padEnd(14)} ${i.hosts.slice(0, 2).join(' ')}`
  )
}
