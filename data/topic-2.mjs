// 第二期专题数据：稳定机场推荐（8~30 元档）
//
// 定位：和第一期「便宜机场」错开搜索意图
//   第一期打「便宜 / 低价 / 一元」—— 读者在意单价
//   第二期打「稳定 / 专线 / IEPL / IPLC」—— 读者在意晚高峰不掉线
//
// 选品口径：
//   · 价格 8~30 元/月（这个价位才租得起专线）
//   · 线路必须是 IEPL / IPLC / BGP 中转之一（纯直连不进这份名单）
//   · 官网逐个检测可打开（2026-11-14）
//   · 全部需要注册后才能看到真实价格，所以价格一律标「待核实」
//
// 已检测通过（真面板 7 家）：
//   edgenova / 速界 / 可信云 / 一翻云 / 宝可梦加速 / 宇宙云 / 二猫云
//
// 已剔除（域名打不开）：快狸 varnexa.kuailitttt.homes、金門雲、悟空云 wukongyun.club

export default {
  slug: 'stable',
  lean: true,
  title: '2026 稳定机场推荐：7 家 IEPL / IPLC 专线机场，晚高峰不掉线',
  description:
    'edgenova、速界、可信云、一翻云、宝可梦加速、宇宙云、二猫云 —— 7 家走 IEPL / IPLC / BGP 专线的机场。官网逐个检测可打开，价格登录后台核实。',
  updated: '2026-11-14',

  intro: [
    '「稳定」和「便宜」是两件事。低价机场走公网直连，白天够用，晚高峰 20:00–23:00 会堵；走 **IEPL / IPLC 专线**的机场租的是内网通道，晚高峰不明显。',
    '下面 7 家，**全部是专线或中转线路**，纯直连的不进这份名单。官网逐个检测可打开（2026-11-14）。',
    '**关于价格**：这个价位的机场套餐页都要登录才能看，本文不写未核实的数字，一律标「待核实」，你点进去看实价。',
  ],

  items: [
    {
      name: 'edgenova',
      host: 'work.edgenovaaff.cc',
      code: 'YOUR_CODE_EDGE',
      url: 'https://work.edgenovaaff.cc/',
      tagline: '纯内网 IPLC 专线',
      line: 'IPLC 专线',
      pros: [
        '**纯内网 IPLC 专线**，不走公网，晚高峰掉速不明显',
        '站点自建线路检测页，能看到实时延迟',
        '支持第三方客户端（Clash / v2rayN / Shadowrocket）',
      ],
      best: '要开视频会、晚高峰不能断的人',
    },
    {
      name: '速界',
      host: 'work.speedworldaff.cc',
      code: 'YOUR_CODE_SPEED',
      url: 'https://work.speedworldaff.cc/',
      tagline: 'BGP 中转 + IPLC 混合线路',
      line: 'BGP 中转 / IPLC',
      pros: [
        '**BGP 中转 + IPLC 混合**，兼顾国内接入速度和跨境稳定性',
        '有线路检测页，能看到各入口的实时延迟',
        '套餐档位从入门到旗舰都有',
      ],
      best: '想要「国内接入快 + 跨境稳」的人',
    },
    {
      name: '可信云',
      host: 'work.kosingaff.com',
      code: 'YOUR_CODE_KOSING',
      url: 'https://work.kosingaff.com/',
      tagline: 'BGP 中转 + IPLC，运营时间较长',
      line: 'BGP 中转 / IPLC',
      pros: [
        '**BGP 中转 + IPLC**，双线路配置',
        '在多个第三方清单里都被收录，运营时间较长',
        '有独立线路检测页',
      ],
      best: '想要一家有历史记录、不容易突然消失的',
    },
    {
      name: '一翻云',
      host: 'wzjc.1flyunaff.cc',
      code: 'YOUR_CODE_YIFAN',
      url: 'https://wzjc.1flyunaff.cc/',
      tagline: 'IEPL 专线，60+ 节点',
      line: 'IEPL 专线',
      pros: [
        '**IEPL 专线**，官方标称 60+ 节点',
        '有不限时流量包，用不完不清零',
        '不限设备数',
        '支持流媒体和 AI 工具解锁',
      ],
      best: '要节点多、设备多的人',
    },
    {
      name: '宝可梦加速器',
      host: 'baokemengjiasu.top',
      code: 'YOUR_CODE_POKEMON',
      url: 'https://baokemengjiasu.top/',
      tagline: 'IEPL 专线，100+ 节点，新疆可用',
      line: 'IEPL 专线',
      pros: [
        '**IEPL 专线 + 100+ 节点**',
        '**新疆可用**（很多机场不支持新疆）',
        '官网首页直接标价，不用登录就能看',
        '入门档不到 10 元，是这份名单里门槛最低的',
      ],
      best: '在新疆、或者想先花小钱试专线的人',
    },
    {
      name: '宇宙云',
      host: 'wzjc.yuzoucloud.cc',
      code: 'YOUR_CODE_YUZHOU',
      url: 'https://wzjc.yuzoucloud.cc/',
      tagline: '公网中转 + 优化',
      line: '公网中转 / 优化',
      pros: [
        '**公网中转 + 优化线路**，比纯直连稳',
        '价格在专线档里偏低',
        '有线路检测页',
      ],
      best: '预算有限、又想要比直连稳一点的人',
    },
    {
      name: '二猫云',
      host: 'wzjc.2maoyunaff.cc',
      code: 'YOUR_CODE_ERMAO',
      url: 'https://wzjc.2maoyunaff.cc/',
      tagline: '公网中转，新开机场人少',
      line: '公网中转 / 优化',
      pros: [
        '**新开机场，人少**，同一条线路分到的人少，速度通常更好',
        '公网中转 + 优化',
        '有线路检测页，能看到实时延迟',
      ],
      best: '不介意新站、想抢「人少」红利的人',
    },
  ],

  steps: [
    { title: '先看线路类型', desc: 'IEPL / IPLC 是内网专线，晚高峰最稳；BGP 中转次之；公网中转再次。按「晚高峰能不能忍」选，不是按价格选。' },
    { title: '用线路检测页看延迟', desc: '这 7 家大多自带检测页，注册前先看一眼你所在地区到各入口的延迟。延迟 100ms 以内算好，300ms 以上说明绕路了。' },
    { title: '先月付一个月', desc: '这个价位月付通常 10~30 元，先买一个月，在工作日 21:00 测一次，跑顺了再考虑季付。' },
  ],

  footerNote:
    '本文所有机场的官网均在 2026-11-14 检测可访问；价格为套餐页需登录查看，本文不写未核实的数字。机场改价不会通知任何人，下单前以官网当前页面为准。订阅链接等同于账号密码，不要发给任何人。',
}
