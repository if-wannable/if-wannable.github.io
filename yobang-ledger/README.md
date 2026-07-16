# 由你榜记录台 (Uni Chart Recorder)

每 5 分钟抓取腾讯音乐「由你榜」`uniId=530004147` 的各维度分数，写入 GitHub Gist，本页面读取 Gist 并展示趋势。

页面地址：<https://if-wannable.github.io/yobang-ledger/>

## 数据流

```
[Tencent yobang page]
        |
        | 每 5 分钟 (GitHub Actions cron)
        v
scripts/fetch_yobang.py  ──>  GitHub Gist
                                  ├── YYYY-MM-DD.jsonl   (按天 JSONL)
                                  ├── latest.json         (最新快照)
                                  ├── errors.jsonl       (失败日志)
                                  └── manifest.json
                                  |
                                  | gist.githubusercontent.com (CDN)
                                  v
                            本页面 (纯静态 JS)
```

## 一次性配置

1. **创建 Gist**：<https://gist.github.com> 新建一个空 Gist（文件名随意，比如 `init.txt`），记下 URL 末尾的 id（形如 `abc123def456`）。
2. **创建 PAT**：<https://github.com/settings/tokens> 生成 fine-grained PAT，权限只勾选 `Account secrets -> Gists`，过期设 1 年。
3. **写入仓库 Secret / Variable**（在本仓库根目录执行）：
   ```sh
   gh secret  set GIST_TOKEN       --body '<PAT>'
   gh variable set YOBANG_GIST_ID  --body '<gist_id>'
   ```
4. **回填 Gist ID 到前端**：编辑 `source/yobang-ledger/app.js`，把 `GIST_CONFIG.gistId` 替换为上一步的 gist id。
5. **首次手动触发**：在 GitHub Actions 页面找到 `Yobang Recorder` workflow，点 `Run workflow`，确认 Gist 里出现了 `latest.json`、`manifest.json` 和当天的 `YYYY-MM-DD.jsonl`。
6. **部署**：`hexo clean && hexo generate && hexo deploy`，或推送到 `master` 触发 Hexo deploy。

## 调试

- **Actions 日志**：每 5 分钟一次的 run，stdout 打印 `OK: appended to YYYY-MM-DD.jsonl; dimensions=N`。失败时 stderr 显示原因。
- **Gist 内容**：直接访问 `https://gist.github.com/if-wannable/<gist_id>` 查看 JSONL。
- **errors.jsonl**：fetch/parse 失败的记录都在这里，每行 `{fetched_at, stage, error, detail}`。
- **首次解析结构未知**：每条 snapshot 的 `raw_excerpt` 字段保留了原始 JSON 前 2KB，方便对照腾讯页面结构迭代 `scripts/fetch_yobang.py` 的 `walk_for_scores` 关键字映射。

## 文件清单

| 文件 | 用途 |
|------|------|
| `scripts/fetch_yobang.py` | Python 抓取脚本 |
| `scripts/requirements.txt` | 依赖：`requests>=2.31.0` |
| `.github/workflows/yobang-recorder.yml` | 定时任务 workflow |
| `source/yobang-ledger/index.html` | 静态页面骨架 |
| `source/yobang-ledger/app.js` | 读 Gist + 画 Canvas 趋势图 |
| `source/yobang-ledger/styles.css` | 视觉样式（与 `poll-ledger` 一致） |
