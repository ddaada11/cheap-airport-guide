// 采集器：从 sources.mjs 列出的源里捞出机场注册链接，合并进 data/pool.json
// 用法：npm run discover
// 特点：只增不删；已有条目的 status / affCode / 人工字段不会被覆盖

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { domainToUnicode } from 'node:url'
import sources from '../data/sources.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const POOL = join(root, 'data', 'pool.json')

// ── 黑名单：永远不是机场官网的域名 ──────────────────────────────────
const BLACK = [
  // 平台 / 代码托管
  'github.com', 'githubusercontent.com', 'github.io', 'gitee.com', 'gitlab.com', 'gitcode.com',
  // 社交 / 视频
  't.me', 'telegram.org', 'telegram.me', 'discord.gg', 'discord.com', 'youtube.com', 'youtu.be',
  'bilibili.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'weibo.com',
  // 搜索 / 内容平台
  'google.com', 'googleusercontent.com', 'gstatic.com', 'bing.com', 'baidu.com', 'zhihu.com',
  'juejin.cn', 'v2ex.com', 'sspai.com', 'jianshu.com', 'csdn.net', 'hostloc.com', 'nodeseek.com',
  'linux.do', '52pojie.cn', 'chiphell.com', 'douyin.com', 'xiaohongshu.com',
  // 基础设施 / 徽章 / 静态资源
  'shields.io', 'badge.fury.io', 'imgur.com', 'wikipedia.org', 'npmjs.com', 'nodejs.org',
  'mozilla.org', 'cloudflare.com', 'vercel.com', 'netlify.app', 'pages.dev', 'workers.dev',
  'w3.org', 'creativecommons.org', 'apache.org', 'komarev.com', 'mega.nz', 'reurl.cc',
  // 短链 / 网盘 / 邮箱
  'bit.ly', 't.cn', 'tinyurl.com', 'pan.baidu.com', 'aliyundrive.com', '123pan.com',
  'gmail.com', 'outlook.com', 'qq.com', '163.com', 'aliyun.com', 'tencent.com',
  // 硬件 / 教程站（会被「IPv6 怎么关」这类段落误抓）
  'asus.com', 'asus.com.cn', 'tp-link.com', 'tp-link.com.cn', 'rapidseedbox.com', 'adguard-dns.io',
  'luyouwang.net', 'jcrank.com', 'jichangtuijian.com', 'jichangcesu.com', 'tuijianvpn.com',
  'dera.page', 'webadorsite.com', 'star-history.com',
  // 语雀 / 京东图床（表格里的截图链接会被当成机场）
  'yuque.com', 'yuque.men', 'cdn.nlark.com', '360buyimg.com', '360buyimg.men',
]

/** 路径特征：文章 / 帮助页，不是注册页 */
const ARTICLE_PATH = /\.(html?|php|aspx?)(\?|$)|^\/(blog|kb|faq|support|article|news|docs|wiki)\//i

const isBlack = (host, path) => {
  if (/\.(edu\.cn|gov\.cn|edu|gov)$/i.test(host)) return true
  if (ARTICLE_PATH.test(path)) return true
  return (
    BLACK.some((b) => host === b || host.endsWith('.' + b)) ||
    /^(?:localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(host)
  )
}

/** 归一化域名：去 www、转小写 */
const normHost = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

/** 强信号：注册页 / 带邀请码 —— 说明这家在做推广，一定有 aff 计划 */
function signalOf(u) {
  try {
    const url = new URL(u)
    const s = url.pathname + url.search
    if (/[?&](?:code|aff|ref|invite|inviter|promo)=[\w-]{3,}/i.test(s)) return 'strong'
    if (/\/(auth\/)?(register|signup|reg)(\/|\?|$)/i.test(url.pathname)) return 'strong'
    return 'weak'
  } catch {
    return 'weak'
  }
}

/** 抠出别人用的邀请码（各种面板参数名都不一样） */
function codeOf(u) {
  const m = /[?&](?:code|aff|ref|invite|inviter|promo)=([\w-]{3,})/i.exec(u)
  return m ? m[1] : ''
}

/** 从整行文本里猜价格 */
function priceOf(line) {
  const m = /[¥￥]\s*(\d+(?:\.\d+)?)/.exec(line) || /(\d+(?:\.\d+)?)\s*元/.exec(line)
  return m ? '¥' + m[1] : ''
}

/** 通用词：这些链接文字不是机场名 */
const GENERIC =
  /^(备用|备用地址|官网|官方网站|网址|官网地址|点击进入|点击|进入|链接|注册|前往|地址|这里|此站|点我|立即|查看|更多|详情|官网链接|注册地址|官网入口|传送|直达|\d+)$/

/** 卖点词：表格里这些单元格是「解锁/线路/速度」不是名字 */
const SELLING =
  /解锁|流媒体|ChatGPT|全平台|支持|稳定|全球|中级|主流|套餐|倍率|流量|节点|试用|优惠|价格|速度|延迟|测速|推荐|开业|更新|IEPL|IPLC|专线|中转|直连|BGP|Hysteria|EMBY|住宅|原生|赠送|三网|移动|联通|电信|GIA|CN2|\/月|\/年|\/季/

/** 日期单元格 */
const DATE_CELL = /^\d{4}[.\-/年]\d{1,2}([.\-/月]\d{1,2})?/

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/gu

/** 清洗名称：剥 HTML、emoji、通用后缀、尾部编号 */
function cleanName(raw) {
  let s = String(raw || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\|/g, ' ')
    .replace(EMOJI, '')
    .replace(/[*_`~]/g, '')
    .replace(/\bbr\b/gi, '')
    .replace(/\s+/g, '')
    .trim()
  s = s.replace(/^(?:点击进入|点击|进入|前往|立即|注册|打开)/, '')
  s = s.replace(/(?:永久机场|永久地址|备用机场|官网地址|官方网站|官网链接|官网入口|备用地址|官网|地址|链接|入口|网址|主页|首页)+[\d\s]*$/g, '')
  s = s.replace(/\d+$/, '')
  return s.trim()
}

/** 从域名推断一个可读的名字（去 TLD，去掉数字前缀） */
function hostName(host) {
  const parts = host.split('.')
  const main = parts.length > 2 ? parts[parts.length - 2] : parts[0]
  return main.replace(/^[\d-]+/, '').replace(/[^a-z0-9]/gi, '') || host
}

/** punycode 域名 → 中文，便于审核时辨认（xn--mes358aby2apfg.com → 赔钱机场.com） */
function hostUnicode(host) {
  try {
    return domainToUnicode(host)
  } catch {
    return host
  }
}

/** 把 HTML 的 <a href> 统一成 markdown 形态，后面走同一套解析 */
function htmlToMd(text) {
  return text.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
    const clean = label.replace(/<[^>]+>/g, '').trim().slice(0, 60)
    return `[${clean}](${href})`
  })
}

const MD_LINK = /\[([^\]\n]{0,80})\]\(\s*(https?:\/\/[^\s)]+)\s*\)/g

/** 表格行里，链接左边的单元格通常是机场名 */
function nameFromRow(line, linkIndex) {
  if (!line.trim().startsWith('|')) return ''
  const cells = line.split('|').map((s) => s.trim())
  for (let i = linkIndex; i >= 1; i--) {
    const cell = cleanName(cells[i]?.replace(MD_LINK, ''))
    if (!cell || cell.length > 24) continue
    if (GENERIC.test(cell) || SELLING.test(cell) || DATE_CELL.test(cell)) continue
    if (/^[-:\s]+$/.test(cell)) continue
    return cell
  }
  return ''
}

/** 从一篇文本里抽候选 */
function extract(text, sourceName) {
  const found = []
  const body = htmlToMd(text)
  for (const line of body.split('\n')) {
    const hits = [...line.matchAll(MD_LINK)]
    if (!hits.length) continue
    const price = priceOf(line)
    for (const h of hits) {
      const [, label, rawUrl] = h
      const host = normHost(rawUrl)
      if (!host) continue
      let path = '/'
      try {
        path = new URL(rawUrl).pathname
      } catch {
        /* 保持默认 */
      }
      if (isBlack(host, path)) continue

      const linkIndex = line.slice(0, h.index).split('|').length - 1
      const fromLabel = cleanName(label)
      const rowName = nameFromRow(line, linkIndex)
      const usable = (s) => s && s.length >= 2 && !GENERIC.test(s) && !SELLING.test(s) && !DATE_CELL.test(s)
      const name = usable(fromLabel) ? fromLabel : usable(rowName) ? rowName : hostName(host)

      found.push({
        host,
        name: name.slice(0, 30),
        url: rawUrl,
        signal: signalOf(rawUrl),
        seenCode: codeOf(rawUrl),
        price,
        source: sourceName,
      })
    }
  }
  return found
}

/** 拉一个源的内容；github 源自动试 main / master */
async function fetchSource(s) {
  const timeout = AbortSignal.timeout(25000)
  if (s.type === 'github') {
    for (const branch of ['main', 'master']) {
      const url = `https://raw.githubusercontent.com/${s.name}/${branch}/README.md`
      try {
        const res = await fetch(url, { signal: timeout, headers: { 'user-agent': 'Mozilla/5.0' } })
        if (res.ok) return { text: await res.text(), via: url }
      } catch {
        /* 换下一个分支 */
      }
    }
    throw new Error('README 拉取失败（main/master 都不通）')
  }
  const res = await fetch(s.url, {
    signal: timeout,
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return { text: await res.text(), via: s.url }
}

// ── 主流程 ────────────────────────────────────────────────────────────
const now = new Date().toISOString()
const pool = existsSync(POOL) ? JSON.parse(readFileSync(POOL, 'utf8')) : { updated: now, items: [] }
const byHost = new Map(pool.items.map((it) => [it.host, it]))
const fresh = []
const errors = []

for (const s of sources) {
  try {
    const { text, via } = await fetchSource(s)
    const found = extract(text, s.name)
    for (const f of found) {
      const old = byHost.get(f.host)
      if (old) {
        // 已存在：只更新来源 / 时间 / 码，人工字段一律不动
        if (!old.source.includes(f.source)) old.source.push(f.source)
        old.lastSeen = now
        old.signal = old.signal === 'strong' ? 'strong' : f.signal
        if (f.seenCode && !old.seenCodes.includes(f.seenCode)) old.seenCodes.push(f.seenCode)
        if (f.price && !old.price) old.price = f.price
        // 名称自愈：空名 / 与域名同义 / 命中卖点词（IEPL专线、三网BGP、¥6.4/月）→ 用新算的覆盖
        const dirtyName = (n) =>
          !n || SELLING.test(n) || DATE_CELL.test(n) || /(?:官网|永久机场|备用地址|入口|地址)$/.test(n)
        const sameAsHost = (n) => n === hostName(old.host)
        if ((dirtyName(old.name) || sameAsHost(old.name)) && !dirtyName(f.name)) old.name = f.name
      } else {
        const item = {
          host: f.host,
          hostU: hostUnicode(f.host),
          name: f.name,
          url: f.url,
          signal: f.signal,
          seenCodes: f.seenCode ? [f.seenCode] : [],
          price: f.price,
          source: [f.source],
          status: 'pending',
          affUrl: '',
          affCode: '',
          type: '',
          monthly: '',
          oneTime: '',
          trial: '',
          coupons: [],
          note: [],
          firstSeen: now,
          lastSeen: now,
        }
        byHost.set(f.host, item)
        pool.items.push(item)
        fresh.push(item)
      }
    }
    console.log(`✔ ${s.name}：抽到 ${found.length} 条链接`)
  } catch (e) {
    errors.push(`${s.name}: ${e.message}`)
    console.log(`✘ ${s.name}：${e.message}`)
  }
}

// ── 聚合同一机场的备用域名：同一个邀请码 = 同一家 ─────────────────────
// 组内选主域名：strong 优先，其次域名短、路径浅
const groups = new Map()
for (const it of pool.items) {
  // 有邀请码 → 按码归组（最准）；没有码 → 按清洗后的名字归组（同一家常有 4~6 个备用域名）
  const nm = (it.name || '').toLowerCase().replace(/\s+/g, '')
  const key = it.seenCodes[0]
    ? 'code:' + it.seenCodes[0].toLowerCase()
    : nm && nm !== hostName(it.host).toLowerCase()
      ? 'name:' + nm
      : 'host:' + it.host
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(it)
}
const rank = (i) =>
  (i.signal === 'strong' ? 0 : 100) + i.host.length + (i.url.split('/').length - 3) * 5
let merged = 0
for (const [, list] of groups) {
  if (list.length < 2) continue
  list.sort((a, b) => rank(a) - rank(b))
  const [main, ...rest] = list
  for (const r of rest) {
    if (r.status !== 'pending') continue // 人工处理过的不动
    main.mirrors = [...(main.mirrors || []), r.host]
    main.source = [...new Set([...main.source, ...r.source])]
    if (!main.price && r.price) main.price = r.price
    if (!main.name || main.name === hostName(main.host)) main.name = r.name
    r.status = 'mirror' // 保留记录，但不进审核队列
    merged++
  }
}

pool.updated = now
pool.items.sort((a, b) => {
  if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
  if (a.signal !== b.signal) return a.signal === 'strong' ? -1 : 1
  return b.source.length - a.source.length
})
writeFileSync(POOL, JSON.stringify(pool, null, 2) + '\n', 'utf8')

const cnt = (s) => pool.items.filter((i) => i.status === s).length
const pending = pool.items.filter((i) => i.status === 'pending')
console.log('')
console.log(`本次新增 ${fresh.length} 条｜候选池 ${pool.items.length} 条（合并备用域名 ${merged} 个）`)
console.log(`待审 ${cnt('pending')}｜已收录 ${cnt('approved')}｜已跳过 ${cnt('rejected')}｜备用域名 ${cnt('mirror')}`)
console.log(`强信号（带邀请码/注册页）${pending.filter((i) => i.signal === 'strong').length} 条`)
if (errors.length) console.log(`\n失败源 ${errors.length} 个：\n- ` + errors.join('\n- '))
console.log('\n下一步：npm run review → http://127.0.0.1:7788')
