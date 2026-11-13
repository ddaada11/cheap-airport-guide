// 采集源：从这些地方捞机场域名
// type = 'github' → 抓 README 原始内容，正则提链接（结构化程度最高，优先用）
// type = 'html'   → 抓页面正文，正则提链接（导航站，噪音大）
//
// weight 说明（用于排序与可信度加权）：
//   3 = 结构化清单型仓库：表格里有价格 / 套餐 / 优惠码，且带邀请码链接
//   2 = 评测型仓库：单篇长文写 10~30 家，价格写在正文里
//   1 = 导航站 / 聚合页：只给域名，几乎没价格
//
// 维护规则：连续两次 discover 都失败的源直接删掉，不要留着刷日志。

export default [
  // ── 一元档专项源（第一期专题用：1 元 / 2 元 / 超低价）────────────────
  { name: 'chaopianyijichang/1yuanjichang', type: 'github', weight: 3 },
  { name: 'jichangtuijian2027/dijiajichang-bijiao', type: 'github', weight: 3 },

  // ── 结构化清单型（最高优先，价格 / 套餐 / 优惠码都在表格里）──────────
  { name: 'KaWaIDeSuNe/dijiajichang', type: 'github', weight: 3 },
  { name: 'KaWaIDeSuNe/xingjiabijichang', type: 'github', weight: 3 },
  { name: 'jichangx/2026-jichangcha-tuijian', type: 'github', weight: 3 },
  { name: 'jichangyyds-net/jichang-tuijian-shice', type: 'github', weight: 3 },
  { name: 'clashvpnss/jichang-tuijian-2026', type: 'github', weight: 3 },
  { name: 'jctz123/jichangtizi-youhuima', type: 'github', weight: 3 },
  { name: 'Abao130/xingjiabijichang', type: 'github', weight: 3 },
  { name: 'xingjiabijichang2027/pianyijichang', type: 'github', weight: 3 },

  // ── 评测型（长文，价格在正文，用来交叉验证价格是否过期）──────────────
  { name: 'hwanz/SSR-V2ray-Trojan', type: 'github', weight: 2 },
  { name: 'DiningFactory/panda-vpn-pro', type: 'github', weight: 2 },
  { name: 'lynkco01/jichangtuijian', type: 'github', weight: 2 },
  { name: 'nigewen/airport-notes', type: 'github', weight: 2 },
  { name: 'RandomJackor/jichangtuijian2026', type: 'github', weight: 2 },
  { name: 'clashhubs/jichang-tuijian-clash', type: 'github', weight: 2 },
  { name: 'clash-vless/2026-jichang-tuijian', type: 'github', weight: 2 },
  { name: 'jichang007/mianfeijichang', type: 'github', weight: 2 },
  { name: 'selierlin/Share-SSR-V2ray', type: 'github', weight: 2 },
  { name: 'clashbk/clash', type: 'github', weight: 2 },

  // ── 导航站（噪音大，但能补到新开的小机场）─────────────────────────
  // 说明：ffq.la（403）与 jichangtuijian.vip（连接失败）连续两轮抓不到，按维护规则已移除。
  // 要恢复的话，先手动确认站点还活着，再取消注释。
  // { name: 'ffq.la', type: 'html', url: 'https://www.ffq.la/', weight: 1 },
  // { name: 'jichangtuijian.vip', type: 'html', url: 'https://jichangtuijian.vip/', weight: 1 },
]
