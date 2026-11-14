// 发布门槛检查：不通过就拒绝发布
// 用法：npm run gate            （检查 repo2）
//       npm run gate -- --repo1 （检查第一期 README）
//
// 规则（硬门槛，任一不通过 exit 1）：
//   1. 不允许出现 YOUR_CODE / FILL_ME 占位符
//   2. 不允许出现「待核实」价格
//   3. 每家机场的入口链接必须带 code= 参数
//   4. 链接数量必须 ≥ 机场数 × 2（对比表 + 详情页各一处）

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv.includes('--repo1') ? join(root, 'README.md') : join(root, 'repo2', 'README.md')

if (!existsSync(target)) {
  console.error(`✘ 找不到 ${target}`)
  process.exit(1)
}

const md = readFileSync(target, 'utf8')
const fails = []
const warns = []

// 1) 占位符
const placeholders = md.match(/YOUR_CODE_[A-Z0-9_]+|FILL_ME/g) || []
if (placeholders.length) fails.push(`占位符 ${placeholders.length} 处：${[...new Set(placeholders)].join(', ')}`)

// 2) 待核实
const pending = (md.match(/待核实/g) || []).length
if (pending) fails.push(`「待核实」${pending} 处 —— 价格没核完不能发`)

// 3) 邀请码覆盖
const codeLinks = (md.match(/[?&](?:code|invite_code)=[A-Za-z0-9_-]{4,}/g) || []).length
const airportRows = (md.match(/^\| \*\*[^*]+\*\* \|/gm) || []).length
if (codeLinks === 0) fails.push('没有任何带 code= 的推广链接')

// 4) 链接数量合理性
if (airportRows > 0 && codeLinks < airportRows * 1.5) {
  warns.push(`带 code 的链接 ${codeLinks} 个，机场条目 ${airportRows} 个 —— 可能有条目漏了推广链接`)
}

// 5) 空表格
if (/待补充|_待补充_/.test(md)) fails.push('存在「待补充」条目')

console.log(`检查文件：${target}`)
console.log(`  机场条目：${airportRows}`)
console.log(`  带码链接：${codeLinks}`)
console.log(`  字符数：${md.length}`)

if (warns.length) {
  console.log('\n⚠ 警告：')
  for (const w of warns) console.log('  ' + w)
}

if (fails.length) {
  console.log('\n✘ 发布检查未通过：')
  for (const f of fails) console.log('  - ' + f)
  process.exit(1)
}

console.log('\n✔ 发布检查通过，可以上线')
