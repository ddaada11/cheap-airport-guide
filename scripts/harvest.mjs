// 快照器：把 data/sources.mjs 里每个源的原文落到 ref/sources/
// 用法：npm run harvest
// 作用：① 让 enrich 能离线反复解析（不必每次重抓）② 留存证据，价格对不上时能回溯是哪一天的哪一版

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sources from '../data/sources.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(root, 'ref', 'sources')
mkdirSync(DIR, { recursive: true })

const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
let ok = 0
const fail = []

for (const s of sources) {
  const slug = s.name.replace(/\//g, '__')
  try {
    if (s.type === 'github') {
      let text = null
      for (const branch of ['main', 'master']) {
        try {
          const res = await fetch(`https://raw.githubusercontent.com/${s.name}/${branch}/README.md`, {
            headers: UA,
            signal: AbortSignal.timeout(25000),
          })
          if (res.ok) {
            text = await res.text()
            break
          }
        } catch {
          /* 换分支 */
        }
      }
      if (!text) throw new Error('README 拉取失败')
      writeFileSync(join(DIR, slug + '.md'), text, 'utf8')
      console.log(`✔ ${s.name}  ${text.length} 字符`)
      ok++
    } else {
      const res = await fetch(s.url, { headers: UA, signal: AbortSignal.timeout(25000) })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const text = await res.text()
      writeFileSync(join(DIR, slug + '.html'), text, 'utf8')
      console.log(`✔ ${s.name}  ${text.length} 字符`)
      ok++
    }
  } catch (e) {
    fail.push(`${s.name}: ${e.message}`)
    console.log(`✘ ${s.name}  ${e.message}`)
  }
}

console.log(`\n快照完成 ${ok}/${sources.length} → ${DIR}`)
if (fail.length) console.log('失败：\n- ' + fail.join('\n- '))
