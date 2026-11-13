// 测评站卡片解析器：把 jichangtuijian.uk 首页的 80+ 家机场卡片拆成结构化数据
// 用法：
//   npm run cards            # 解析已存盘的 HTML
//   npm run cards -- --fetch # 先走代理抓最新首页，再解析
//
// 关键动作：卡片上的注册链接有两种——
//   ① /vpn/xxx.html        站内详情页，要再抓一层
//   ② c.jichangs.com/xxx   测评站自己的跳转短链，**跟一次 302 就能拿到真实官网域名**
// 第 ② 种是这次能补上十几家缺域名机场的原因。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const HTML = join(root, 'ref', 'sources', 'jichangtuijian.uk.html')
const OUT = join(root, 'data', 'cards.json')

const argv = process.argv.slice(2)
const DO_FETCH = argv.includes('--fetch')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

if (DO_FETCH) {
  try {
    const res = await fetch('https://jichangtuijian.uk/', {
      headers: { 'user-agent': UA, accept: 'text/html' },
      signal: AbortSignal.timeout(30000),
    })
    if (res.ok) {
      const html = await res.text()
      writeFileSync(HTML, html, 'utf8')
      console.log(`✔ 抓取首页 ${html.length} 字符`)
    }
  } catch (e) {
    console.log('抓取失败（需要代理）：', e.message)
  }
}

if (!existsSync(HTML)) {
  console.error('缺 ref/sources/jichangtuijian.uk.html')
  process.exit(1)
}
const html = readFileSync(HTML, 'utf8')

// 卡片：<a href="..."><article class="box"><h2 class="title">✈️名字</h2><p class="details">描述</p>
const CARD =
  /<a[^>]*href="([^"]+)"[^>]*>\s*<!--\[-->.*?<h2[^>]*class="title"[^>]*>([\s\S]*?)<\/h2>\s*<p[^>]*class="details"[^>]*>([\s\S]*?)<\/p>/g

const strip = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

const items = []
let m
while ((m = CARD.exec(html))) {
  const [, href, title, details] = m
  const name = strip(title).replace(/^[\s✈️]+|[\s✈️]+$/g, '')
  const desc = strip(details)
  if (!name || name.length > 20) continue
  if (items.some((i) => i.name === name)) continue

  // 价格：抓「X元」「X 元」里第一个出现的数字
  let price = null
  let cycle = ''
  const pm =
    /(\d+(?:\.\d+)?)\s*元\s*\/?\s*(年|月|季|半年)?/.exec(desc) ||
    /年付[^\d]{0,6}(\d+(?:\.\d+)?)\s*元/.exec(desc)
  if (pm) {
    price = parseFloat(pm[1])
    cycle = pm[2] || (/年付|每年/.test(desc) ? '年' : /月付|\/月/.test(desc) ? '月' : '')
  }
  // 流量
  let gb = null
  const gm = /(\d+(?:\.\d+)?)\s*(?:GB|G|g)\b/.exec(desc)
  if (gm) gb = parseFloat(gm[1])
  // 优惠码
  let coupon = ''
  const cm = /优惠码[：:]\s*([A-Za-z0-9_-]{2,20})/.exec(desc) || /请输入\s*([A-Za-z0-9_-]{2,20})/.exec(desc)
  if (cm) coupon = cm[1]

  items.push({ name, href, desc, price, cycle, gb, coupon, host: '' })
}

console.log(`解析出 ${items.length} 家卡片`)

// ── 跟随跳转拿真实域名 ────────────────────────────────────────────────
const NAV = /jichangs\.com|jichangtuijian|jichangcha|jichangyyds|clashmetahub|clashshome|bj999|why80/i

/** 跟一次重定向，拿最终域名 */
function hostOfUrl(u) {
  try {
    const x = new URL(u)
    const h = x.hostname.replace(/^www\./, '').toLowerCase()
    const port = x.port && x.port !== '443' && x.port !== '80' ? ':' + x.port : ''
    return h + port
  } catch {
    return ''
  }
}

/** 手动跟 301/302：不 follow，直接读 Location（IP:端口 的站证书无效，follow 会抛错） */
async function resolveHost(url, depth = 0) {
  if (depth > 3 || !/^https?:/.test(url)) return ''
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') || ''
      const h = hostOfUrl(new URL(loc, url).href)
      if (h && !NAV.test(h)) return h
      if (loc) return await resolveHost(new URL(loc, url).href, depth + 1)
      return ''
    }
    // 200：可能是 meta refresh 中间页
    const body = (await res.text()).slice(0, 4000)
    const meta = /url=([^"'\s>]+)/i.exec(body)
    if (meta) {
      const h = hostOfUrl(new URL(meta[1], url).href)
      if (h && !NAV.test(h)) return h
    }
    const h = hostOfUrl(res.url || url)
    return h && !NAV.test(h) ? h : ''
  } catch {
    return ''
  }
}

/** 站内详情页 → 抠出它的跳转短链 */
async function hostFromDetail(href) {
  const url = new URL(href, 'https://jichangtuijian.uk/').href
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return ''
    const h = await res.text()
    const links = [...h.matchAll(/href="(https?:\/\/[^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => !/jichangtuijian|\.css|\.js$|\.png|\.jpg|\.webp|github\.com|vercel|vitepress|npmjs/i.test(u))
    // 优先 c.jichangs.com 短链，其次任何非导航站外链
    const jump = links.find((u) => /jichangs\.com\//.test(u)) || links.find((u) => !NAV.test(new URL(u).hostname))
    if (!jump) return ''
    const h2 = await resolveHost(jump)
    if (h2) return h2
    const uj = new URL(jump)
    const pj = uj.port && uj.port !== '443' && uj.port !== '80' ? ':' + uj.port : ''
    return uj.hostname.replace(/^www\./, '').toLowerCase() + pj
  } catch {
    return ''
  }
}

let resolved = 0
const queue = [...items]
async function worker() {
  while (queue.length) {
    const it = queue.shift()
    const href = it.href
    if (/^https?:/.test(href) && !NAV.test(href)) {
      try {
        it.host = new URL(href).hostname.replace(/^www\./, '').toLowerCase()
        resolved++
      } catch {}
      continue
    }
    if (/^https?:/.test(href)) {
      const h = await resolveHost(href)
      if (h) {
        it.host = h
        it.via = 'jump'
        resolved++
      }
      continue
    }
    // 站内详情页
    const h = await hostFromDetail(href)
    if (h) {
      it.host = h
      it.via = 'detail'
      resolved++
    }
    console.log(`  ${it.name.padEnd(16)} ${h || '(未解析)'}`)
  }
}
await Promise.all(Array.from({ length: 5 }, worker))

writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), total: items.length, resolved, items }, null, 2) + '\n', 'utf8')

console.log(`解析出域名 ${resolved}/${items.length} → ${OUT}`)
console.log('\n1~7 元档：')
for (const it of items.filter((i) => i.price != null && i.price <= 7).sort((a, b) => a.price - b.price)) {
  console.log(`  ${String(it.price).padStart(5)}元/${it.cycle || '?'}  ${(it.gb ? it.gb + 'G' : '?').padEnd(6)} ${it.name.padEnd(14)} ${it.host || '(未解析)'}`)
}
