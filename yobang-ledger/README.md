# 由你榜记录台 (Uni Chart Recorder)

打开页面时通过 CORS 代理直接抓取腾讯音乐「由你榜」`uniId=530004147` 页面，解析内嵌 JSON 提取各维度分数并展示。最近 24 小时的快照存在浏览器 `localStorage` 里用于画趋势图。

页面地址：<https://if-wannable.github.io/yobang-ledger/>

## 数据流

```
[浏览器] --每 5 分钟或手动-->  refresh()
   |
   v
[CORS 代理]  allorigins / corsproxy / codetabs / thingproxy
   |
   v
[yobang.tencentmusic.com 页面 HTML]
   |
   v
extractState()  匹配 __NEXT_DATA__ / __INITIAL_STATE__ / __APOLLO_STATE__
   |
   v
walkForScores()  按关键字表收集数值字段
   |
   v
localStorage (最近 288 条 = 24h) + 渲染指标卡 + 趋势图 + 数据表
```

## 特性

- **纯客户端**：无后端、无 Gist、无 GitHub Actions。
- **每 5 分钟自动刷新**：与原计划对齐，但完全在浏览器里跑。
- **24h 滚动历史**：最多 288 条快照存在 `localStorage`，关闭浏览器后保留；换设备/换浏览器各自独立。
- **多代理兜底**：4 个 CORS 代理依次尝试，单个失效不影响整体。
- **维度识别**：靠 `DIMENSION_KEYWORDS` 表把 `playCount`/`likeCount` 等字段名映射为中文标签。如果腾讯改了字段名，更新这张表即可。

## 已知限制

- **依赖第三方 CORS 代理**：免费代理可能限流或失效。如果 4 个都失败，页面会显示"获取失败"。
- **依赖页面内嵌 JSON**：如果 yobang 改成纯客户端渲染（数据靠 XHR 后加载），抓不到。需要改用 Playwright 方案或直接找 API endpoint。
- **localStorage 不共享**：每个浏览器各自存历史，多人协作时数据不互通。
- **第一次打开历史为空**：趋势图需要积累几次快照后才好看。打开页面挂 30 分钟即可看到 6 个点。

## 文件清单

| 文件 | 用途 |
|------|------|
| `source/yobang-ledger/index.html` | 静态页面骨架 |
| `source/yobang-ledger/app.js` | CORS 代理获取 + 解析 + Canvas 趋势图 |
| `source/yobang-ledger/styles.css` | 视觉样式（与 `poll-ledger` 一致） |

## 调试

- 打开浏览器控制台，看 `refresh()` 的 fetch 错误。
- 如果显示"未找到内嵌 JSON"，说明 yobang 页面结构变了或纯 JS 渲染。需要打开 yobang 原始页面，F12 看 Network 里的 XHR，找到返回 chart 数据的 API endpoint，然后改 `extractState()` 改成直接调那个 API。
- 如果显示"代理 #N: HTTP 4xx"，说明代理被腾讯屏蔽或代理本身限流。换代理顺序或加新代理。
