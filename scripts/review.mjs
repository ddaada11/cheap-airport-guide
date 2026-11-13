// 本地审核服务：浏览器里勾选机场、填邀请码，保存即写回 data/pool.json
// 用法：npm run review → http://127.0.0.1:7788
// 「生成 README 并发布」会把已收录的条目写进 data/airports.mjs 并重跑 build

import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFileSync, exec } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 7788
const POOL = join(root, 'data', 'pool.json')
const AIRPORTS = join(root, 'data', 'airports.mjs')

const readPool = () => JSON.parse(readFileSync(POOL, 'utf8'))
const writePool = (p) => writeFileSync(POOL, JSON.stringify(p, null, 2) + '\n', 'utf8')

/** 邀请码参数名，不同面板不一样 */
const CODE_KEYS = ['code', 'aff', 'ref', 'invite', 'inviter', 'promo']

/**
 * 把邀请码写进注册链接。
 * 大量机场用 vue hash 路由（https://x.com/#/register?code=XXX），参数在 hash 里，
 * 不能只靠 URL.searchParams，必须单独处理。
 */
function withCode(rawUrl, code) {
  if (!code) return rawUrl
  const hashAt = rawUrl.indexOf('#')
  if (hashAt >= 0) {
    const head = rawUrl.slice(0, hashAt)
    const hash = rawUrl.slice(hashAt + 1)
    const qAt = hash.indexOf('?')
    if (qAt >= 0) {
      const path = hash.slice(0, qAt)
      const qs = new URLSearchParams(hash.slice(qAt + 1))
      let hit = false
      for (const k of CODE_KEYS) {
        if (qs.has(k)) {
          qs.set(k, code)
          hit = true
        }
      }
      if (!hit) qs.set('code', code)
      return head + '#' + path + '?' + qs.toString()
    }
    return head + '#' + hash + (hash.includes('?') ? '&' : '?') + 'code=' + encodeURIComponent(code)
  }
  try {
    const u = new URL(rawUrl)
    let hit = false
    for (const k of CODE_KEYS) {
      if (u.searchParams.has(k)) {
        u.searchParams.set(k, code)
        hit = true
      }
    }
    if (!hit) u.searchParams.set('code', code)
    return u.toString()
  } catch {
    return rawUrl
  }
}

/** 已收录条目 → airports.mjs 的条目结构 */
function toAirport(i) {
  return {
    name: i.name || i.host,
    since: i.since || '',
    // 后台生成的完整推广链接优先（最准），否则按参数名把码拼回去
    url: i.affUrl || withCode(i.url, i.affCode),
    affCode: i.affCode || '',
    type: i.type || '直连',
    rate: i.rate || '1',
    monthly: i.monthly || i.price || '-',
    oneTime: i.oneTime || '-',
    trial: i.trial || '-',
    coupons: i.coupons || [],
    flags: i.flags || [],
    proto: i.proto || '',
    note: i.note || [],
    status: 'active',
  }
}

function publish() {
  const pool = readPool()
  const approved = pool.items.filter((i) => i.status === 'approved')
  const coded = approved.filter((i) => i.affUrl || i.affCode)
  if (!coded.length) throw new Error('还没有任何一家填了推广链接，生成出来点了也不算业绩')

  const list = approved.map(toAirport)
  const header = '// 由 npm run review 生成，不要手改；改 data/pool.json 后重新发布\n'
  writeFileSync(AIRPORTS, header + 'export default ' + JSON.stringify(list, null, 2) + '\n\nexport const removed = []\n', 'utf8')

  const out = execFileSync('node', [join(root, 'scripts', 'build.mjs')], { cwd: root, encoding: 'utf8' })
  return `已写入 ${list.length} 家（${coded.length} 家带邀请码）\n${out.trim()}`
}

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', (c) => {
      buf += c
      if (buf.length > 1e6) reject(new Error('body too large'))
    })
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, readFileSync(join(root, 'scripts', 'review.html'), 'utf8'), 'text/html; charset=utf-8')
    }
    if (req.method === 'GET' && url.pathname === '/api/pool') {
      return send(res, 200, readPool())
    }
    if (req.method === 'POST' && url.pathname === '/api/item') {
      const { host, patch } = await readBody(req)
      const pool = readPool()
      const item = pool.items.find((i) => i.host === host)
      if (!item) return send(res, 404, { error: 'not found: ' + host })
      // 只允许改这几个字段，防止手滑写坏结构
      for (const k of ['status', 'affUrl', 'affCode', 'name', 'price', 'type', 'monthly', 'oneTime', 'trial']) {
        if (k in patch) item[k] = patch[k]
      }
      item.updated = new Date().toISOString()
      pool.updated = item.updated
      writePool(pool)
      return send(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/publish') {
      return send(res, 200, { message: publish() })
    }
    send(res, 404, { error: 'not found' })
  } catch (e) {
    send(res, 500, { error: e.message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`
  console.log(`审核页已启动：${url}`)
  console.log('勾选「收录」→ 填你的邀请码（填了自动收录）→ 点「生成 README 并发布」')
  if (!process.env.NO_OPEN) {
    const cmd =
      process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`
    exec(cmd, () => {})
  }
})
