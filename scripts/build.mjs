// README 生成器：数据 → 长文
// 用法：npm run build
// 产物：README.md（覆盖写，不要手改，改 data/*.mjs）

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import site from '../data/site.mjs'
import airports, { removed } from '../data/airports.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const B = '`' // Markdown 行内代码的反引号，避免在模板里写死
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|')
const sortBySince = (a, b) => a.since.localeCompare(b.since)
const c = (s) => B + s + B // 包一层行内代码

/** 官网单元格：🟨 前置，其余标记与协议标识后置，全部 <br> 换行 */
function linkCell(a) {
  const before = a.flags.includes('🟨') ? '🟨<br>' : ''
  const after = [
    ...a.flags.filter((f) => f !== '🟨'),
    a.proto ? c(a.proto) : '',
  ].filter(Boolean)
  const tail = after.length ? '<br>' + after.join('<br>') : ''
  return `${before}[${esc(a.name)}](${a.url})${tail}`
}

function couponCell(a) {
  if (!a.coupons?.length) return '-'
  return a.coupons
    .map((x) => [x.off, x.code ? c(x.code) : '', x.scope, x.until].filter(Boolean).join('<br>'))
    .join('<br><br>')
}

function table(rows) {
  const head =
    '| 开业日期 | 机场官网 | 类型 | 倍率 | 月付套餐 | 不限时套餐 | 试用 | 优惠券 |\n' +
    '| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |'
  const body = rows
    .map(
      (a) =>
        `| ${a.since} | ${linkCell(a)} | ${a.type} | ${a.rate} | ${a.monthly} | ` +
        `${a.oneTime} | ${a.trial} | ${couponCell(a)} |`
    )
    .join('\n')
  return head + '\n' + body
}

function noticeBlock(level, heading) {
  const list = site.notices.filter((n) => n.level === level)
  if (!list.length) return ''
  return `📌 **${heading}**：\n\n` + list.map((n) => `- 🗓 ${n.date} 🗓 ${n.text}`).join('\n')
}

function archiveBlock() {
  if (!site.archive?.length) return ''
  const intro = '📚 **大事留档**：只保留影响过多家机场的事件，方便回看「某段时间为什么这么卡」。'
  const body = site.archive
    .map(
      (g) =>
        `<details>\n  <summary><b>${g.title}</b></summary>\n` +
        g.lines.map((l) => `&nbsp;&nbsp;&nbsp;🗓 ${l}`).join('<br>\n') +
        '\n</details>'
    )
    .join('\n\n')
  return intro + '\n\n' + body
}

// ── 正文静态段落（全部用数组 + join，避免模板嵌套反引号）─────────────
const RULE = '---'

const hero =
  '⚡⚡⚡⚡ 本文很长，但**建议完整读完**，不要直接跳到机场列表。列表只解决「买哪家」，' +
  '前面的部分解决「怎么买才不亏」。如果实在懒得看，请至少记住一句话：' +
  '**任何机场都有跑路的可能性**，**按月付费**，**不要年付**。⚡⚡⚡⚡'

const vpnVsAirport = [
  `🧐 **机场和 VPN 的区别**：两者都能翻墙，手机状态栏也都显示 ${c('VPN')}，但目的不同。`,
  `VPN 为加密通讯而生，出现年代还没有 GFW；机场为绕过 GFW 而生。前者是「把自己裹严实但走姿鬼祟」，后者是「化妆成正常流量」。`,
  `所以哪怕是很贵的境外 VPN，在国内的翻墙效果也常常不如十几块一个月的机场。`,
  `**国内市面上大部分所谓 VPN 和加速器，本质就是套壳机场，只是卖得更贵**。`,
].join('')

const buyingRules = [
  '👍 **购前须知**：',
  '',
  '- 排名：**仅代表开业日期先后**，**不代表体验好坏**。',
  '- 🟨：该机场当前存在问题（节点质量下降、大量节点不可用、被攻击等），**暂不推荐购买**。修复后删除该标识；迟迟不恢复则直接移除。',
  '- 🔥：订阅链接为「阅后即焚」，复制后需在几分钟内导入。**导入后不要再更新订阅**，否则节点会消失。🔥🔥 为严格模式，只能导入一次；🔥🔑 为「用自家节点时可随意更新」。',
  '- 🔒：**只能使用机场提供的客户端**，不能导入订阅。购买前务必确认支持你的设备（软路由 / iOS / Linux 常见不支持）。',
  '- ✋：默认拿不到订阅链接，**需发工单申请**，属于人工清内鬼的手段。',
  '- 📜：有需要单独说明的事项，见表格下方「附加说明」。',
  `- 协议标识：${c('A')} = 少量节点用 AnyTLS，${c('X')} = 少量节点用 xhttp，带 ${c('*')} = 绝大部分或全部节点为该协议。使用前确认客户端版本支持。`,
  `- 倍率：指**流量消耗速度**。${c('0.5')} 倍率节点下载 100 MB 只扣 50 MB。倍率与速度无关，但高倍率节点成本更高、通常体验更好。优先用低倍率节点。`,
  `- 类型：${c('直连')} 便宜、流量足、防失联强，适合当备用；${c('中转')} 稳定性较好、防失联弱，适合当主力；${c('专线')} 性价比低，不建议刻意追。`,
  '- **不要买多**：一个月付 + 一个不限时套餐就够。买多了用不完，跑路了更心疼。',
].join('\n')

const troubleshoot = [
  '🔧 **常见问题排查顺序**（节点全部超时的时候按这个顺序试）：',
  '',
  '1. 换一个节点，再换一个机场，确认是不是单点问题。',
  '2. 连接任意可用节点后更新订阅；仍不行就开全局再更新。',
  '3. 检查套餐是否过期、流量是否用完。',
  `4. ${c('VMess')} 节点检查系统时间与北京时间误差是否超过 90 秒。`,
  '5. 到官网**重置订阅链接**（免费，不是「重置流量」），重新复制导入。',
  '6. 官网进不去 → 可能被同行攻击，也可能被墙。关掉代理再试，或把官网加入直连名单。',
  '7. 重启代理软件 → 重启电脑 → 重启路由器。',
  '8. 升级或更换代理软件。**代理软件在稳不在新**，但也不要用过旧的版本。',
  `9. DNS 相关：把远程 DNS 从 ${c('8.8.8.8')} 换成 ${c('https://dns.google/dns-query')}（DoH），一次只改一项。`,
  `10. 清 DNS 缓存：Windows ${c('ipconfig /flushdns')}，macOS ${c('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder')}。`,
].join('\n')

const active = airports.filter((a) => a.status !== 'dropped').sort(sortBySince)
const notes = active.filter((a) => a.note?.length)

// ── 极简模式：README 只有表格，不放故事/科普/FAQ（data/site.mjs 的 slim 开关）──
const SLIM = site.slim !== false

function slimTable(rows) {
  const head = '| 机场 | 月付 | 不限时 | 优惠券 |\n' + '| :--- | :---: | :---: | :--- |'
  const body = rows
    .map((a) => `| ${linkCell(a)} | ${a.monthly || '-'} | ${a.oneTime || '-'} | ${couponCell(a)} |`)
    .join('\n')
  return head + '\n' + body
}

if (SLIM) {
  const latest = site.notices?.[0]
  const slimParts = [
    `# ${site.repo.title}`,
    '',
    site.description,
    '',
    latest ? `📌 **${latest.date}**：${latest.text}` : '',
    '',
    '👇 **全部按月付费，链接已带邀请码，点进去注册即算支持本站。**',
    '',
    active.length ? slimTable(active) : '_表格整理中，最近会补上。_',
    '',
    notes.length ? '📜 ' + notes.map((a) => `${a.name}：${a.note.join('；')}`).join('<br>') : '',
    '',
    removed.length
      ? '🪦 **已移除**：\n\n' + removed.map((r) => `- ${r.name}（${r.until}）：${r.reason}`).join('\n')
      : '',
    '',
    '> **任何机场都可能跑路。只买按月，不要年付。**',
    '',
    site.footer,
    '',
  ]
  const outSlim = slimParts.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n')
  writeFileSync(join(root, 'README.md'), outSlim, 'utf8')
  console.log(`✔ README.md 已生成（极简版）：${active.length} 家在列，${outSlim.length} 字符`)
  process.exit(0)
}

const parts = [
  `# ${site.repo.title}`,
  '',
  site.description,
  '',
  hero,
  '',
  RULE,
  '',
  noticeBlock('important', '重要通知'),
  '',
  RULE,
  '',
  noticeBlock('minor', '次要通知'),
  '',
  RULE,
  '',
  archiveBlock(),
  '',
  RULE,
  '',
  site.stance.map((s) => `> 📌 ${s}`).join('\n>\n'),
  '',
  RULE,
  '',
  '📝 ' + site.story.join('\n\n'),
  '',
  RULE,
  '',
  vpnVsAirport,
  '',
  RULE,
  '',
  buyingRules,
  '',
  RULE,
  '',
  '👇 **机场列表**：',
  '',
  table(active),
  '',
  notes.length
    ? '📜 附加说明：\n\n' +
      notes.map((a) => `- ${a.name}：\n` + a.note.map((n) => `    - ${n}`).join('\n')).join('\n')
    : '',
  '',
  RULE,
  '',
  troubleshoot,
  '',
  RULE,
  '',
  removed.length
    ? '🪦 **已移除的机场**：\n\n' + removed.map((r) => `- ${r.name}（${r.until}）：${r.reason}`).join('\n') + '\n\n' + RULE + '\n'
    : '',
  site.footer,
  '',
]

// 保留空行：Markdown 的标题、表格、分隔线前都必须有空行才能正确渲染
const out = parts.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n')

writeFileSync(join(root, 'README.md'), out, 'utf8')
console.log(`✔ README.md 已生成：${active.length} 家在列，${removed.length} 家已移除，${out.length} 字符`)
