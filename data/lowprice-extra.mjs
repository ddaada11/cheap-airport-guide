// 低价候选池（第二轮扩充）：从测评站卡片列表里挖到的 1~7 元档机场
//
// 来源：jichangtuijian.uk 首页（2026-11-13 抓取，服务端渲染，本地网络不可达）
//       + vpnnew.net / tuijianvpn.com / jichang2026/zuipianyijichang
//
// 为什么要单独一份：
//   这一批机场里大部分**没有公开的推广链接**（测评站给的是它自己的跳转 c.jichangs.com/xxx）。
//   所以它们不能直接进推荐位，但必须留在候选池里——等你去注册确认有没有 aff，
//   有 aff 就升级进 topic-1yuan.mjs，没有就继续躺在附录。
//
// aff 字段：
//   'known'   = 已确认有推广（源里带 code）
//   'unknown' = 未确认，需要注册后去后台看
//   'none'    = 确认不给推广

export default [
  // ── 1~3 元档 ──────────────────────────────────────────────────────
  { name: '老百姓自己的机场', price: 6, cycle: '月', gb: 60, line: '未公开', note: '提供 1G 免费试用', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '宝云', price: 4, cycle: '月', gb: 200, line: '未公开', note: '季付 19 元 500G/月；一次性流量包 29 元起；2-6 台设备', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '鲤云', price: 5, cycle: '月', gb: 100, line: '未公开', note: '季付 16 元 128G/月，年付 96 元 256G/月；8 折码 liyun888', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '九云', price: 6, cycle: '月', gb: 150, line: '海外中转 + 智能路由', note: '季付 18 元 200G；支持 Netflix/ChatGPT/TikTok', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '锦云', price: 6, cycle: '月', gb: 50, line: '中转高速', note: '年付 99 元 128G/月，不限时 100 元 100G；24 小时客服', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '宝可梦星云', price: 6.9, cycle: '月', gb: 100, line: '未公开', note: '新用户 9 折码 9999', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '财路云', price: 7, cycle: '月', gb: 25, line: '三网优化精品线路', note: '**标称 50G 但 ×2 倍率，实际约 25G**', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '白羊星', price: 12, cycle: '月', gb: 100, line: '轻量级', note: '年付 8 折码 xn888；注意这是月付 12 元，不是年付 12 元', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '尔湾云', price: 10, cycle: '年', gb: 50, line: '未公开', note: '年付低至 10 元 50G/月，7 折码 ss12 → **真·一元档**', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '疾风云', price: 10, cycle: '年', gb: 50, line: '未公开', note: '年付低至 10 元 50G/月，年费 7 折码 jf2025 → **真·一元档**', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '肥猫云', price: 6, cycle: '月', gb: 60, line: '大带宽不限速专线', note: '年付 72 元（6 元/月），8 折码 newyear202685', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '拓扑门', price: 5.99, cycle: '月', gb: 100, line: '90+ 节点', note: '支持试用；5 台设备；新客 9 折码 topman', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '淘气兔', price: 7.8, cycle: '月', gb: 100, line: '全中转', note: '跑路名单里有 1 条记录（open 1 / closed 1）', aff: 'unknown', src: 'jichangtuijian.uk / limbopro #325 附近' },
  { name: '网际快车', price: 6.8, cycle: '不限时', gb: 20, line: '回国家宽', note: '**新疆可用**；游戏专用节点；不限设备；体验券 888888', aff: 'unknown', src: 'jichangtuijian.uk' },

  // ── 5~10 元档（低价档的「加钱升级」区间）──────────────────────────
  { name: '银河云', price: 8, cycle: '月', gb: 50, line: '未公开', note: '年付 96 元；8 折码 0080', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '小旋风', price: 8, cycle: '月', gb: 60, line: '企业级 IPLC + 三网优化', note: 'Trojan；智能负载均衡；年付', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '青云梯', price: 8, cycle: '月', gb: 60, line: '未公开', note: '年付；优惠码 0080', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: 'xxyun', price: 8.88, cycle: '月', gb: 100, line: '未公开', note: '新用户 85 折码 xxyun85', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '渔云 CloudFisher', price: 9, cycle: '月', gb: 120, line: '未公开', note: '年付 60 元折合 5 元/月', aff: 'unknown', src: 'jichangtuijian.uk' },
  { name: '可乐云', price: 9.9, cycle: '月', gb: 300, line: '未公开', note: '注册试用 1 小时；跑路名单 #379 有「连续多日全部节点超时」记录', aff: 'unknown', src: 'jichangtuijian.uk / limbopro #379' },
  { name: '拼好连', price: 9.9, cycle: '月', gb: null, line: '未公开', note: '支持 Netflix/YouTube；跑路名单 #379 附近有记录', aff: 'unknown', src: 'jichangtuijian.uk' },

  // ── 已确认有推广、但价格不在 1 元档的（留作升级推荐）──────────────
  { name: '寰宇云', price: 7.5, cycle: '月', gb: null, line: '未公开', note: '支持 1 元试用；年付 89 元折合 7.5 元/月', aff: 'unknown', src: 'jichangtuijian.uk' },
]
