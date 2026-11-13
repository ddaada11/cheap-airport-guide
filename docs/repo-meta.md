# GitHub 发布配置（照抄即可）

## 一、仓库名

```
cheap-airport-guide
```

备选：`jichang-tuijian`、`cheap-jichang`、`yiyuan-jichang`

**为什么用英文短名**：GitHub 搜索对仓库名的权重最高，英文短词更容易被搜到，也方便别人口口相传。中文名会被转成拼音，反而丢失关键词。

---

## 二、Description（仓库简介，≤350 字符）

直接复制这段：

```
2026 便宜机场推荐 | 一元机场、低价机场、平价机场实测清单。6 家官网验证可用的机场，附套餐价格、月流量、每 GB 成本与注册入口。支持 Clash、V2ray、Shadowrocket 小火箭、sing-box 订阅。所有价格登录后台截图核实，链接直达注册页。
```

**为什么这么写**：GitHub 的仓库搜索会命中 description，这段塞了 6 个同义词（便宜机场 / 一元机场 / 低价机场 / 平价机场 / 实测清单 / 机场推荐）+ 4 个客户端名（Clash / V2ray / Shadowrocket / sing-box）。搜索结果里显示的摘要就是这段，关键词密度直接决定点击率。

---

## 三、Topics（12 个）

在仓库页面右上角 ⚙️ 里填：

```
airport
clash
v2ray
vpn
proxy
shadowrocket
sing-box
cheap-airport
jichang
v2rayng
hysteria2
subscription
```

**为什么要填满 12 个**：Topics 是 GitHub 搜索的第二入口，用户搜 `clash`、`v2ray`、`airport` 都能命中。少填一个就少一个入口。

---

## 四、发布步骤

### 方式 A：网页创建 + 命令行推送（推荐）

**第 1 步**：打开 https://github.com/new

- Repository name 填 `cheap-airport-guide`
- Description 粘贴上面那段
- 选 **Public**
- **不要**勾选 "Add a README file"（本地已经有了）
- 点 Create repository

**第 2 步**：把下面的命令发我，或者你自己在项目目录里跑（把 `你的用户名` 换成实际用户名）：

```bash
git remote add origin https://github.com/你的用户名/cheap-airport-guide.git
git push -u origin main
```

推送时会弹窗要求登录 GitHub，用浏览器授权即可。

### 方式 B：给我一个 Token，我直接创建并推送

1. 打开 https://github.com/settings/tokens?type=beta
2. 点 Generate new token
3. 勾选 **Repository access → All repositories** 和 **Contents → Read and write**
4. 有效期选 7 天
5. 生成后把 `github_pat_` 开头的那串发我

我用它创建仓库、推送代码、设置 description 和 topics，一条命令搞定。用完你可以立即撤销这个 token。

---

## 五、发布后要做的三件事

### 1. 打开 GitHub Pages（多一个可被收录的 URL）

仓库 Settings → Pages → Source 选 `Deploy from a branch` → Branch 选 `main` / `/ (root)` → Save

几分钟后 README 会被渲染成 `https://你的用户名.github.io/cheap-airport-guide/`，这是独立于仓库页的第二个可收录地址。

### 2. 提交到搜索引擎

- **Google Search Console**：https://search.google.com/search-console → 添加 `你的用户名.github.io` → 验证 → 提交站点地图
- **Bing Webmaster**：https://www.bing.com/webmasters → 同上（Bing 收录更快，通常 3~7 天）

### 3. 保持更新节奏

GitHub 的仓库排序含 `pushed_at`，搜索引擎也偏好新鲜内容。**每 2~3 天改一次价格或加一家机场**，比一次性写完更有用。

改完跑：

```bash
npm run topic && npm run readme
git add -A && git commit -m "update: 价格核对 2026-11-XX" && git push
```

---

## 六、避坑

| 别做 | 为什么 |
| --- | --- |
| 刷 star / 买 star | GitHub 判定异常增长后，仓库会从搜索结果里消失，前面所有工作归零 |
| 在 description 里堆 50 个关键词 | 会被判 spam，反而降权。12~15 个同义词是上限 |
| 一周改 20 次然后停更 | 搜索引擎看的是持续性，不是单次频率 |
| 只发 README 不填 topics | Topics 是第二入口，不填等于放弃一半的站内流量 |
