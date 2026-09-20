# -*- coding: utf-8 -*-
"""腾讯 SCF 定时触发器: 由你榜歌曲监控抓取

每 10 分钟(定时触发器 :05/:15/...)读 Gist 里的配置, 抓取由你榜各维度分数,
把快照追加写回 Gist。前端 yobang_monitor 读 Gist 历史即可看到持续监控的数据。

部署(腾讯 SCF 控制台):
  1. 新建函数, 运行环境 Python 3.9(或以上), 入口函数填 index.main_handler
  2. 环境变量:
       GITHUB_TOKEN      GitHub PAT(需要 gist 权限)
       GIST_ID           Gist ID(默认 b153fed7b323ef2c10c230f12bd67142)
       CONFIG_FILENAME   配置文件名(默认 yobang-monitor-config.json)
  3. 定时触发器: 自定义 cron "0 5,15,25,35,45,55 * * * * *"
     (7 段: 秒 分 时 日 月 星期 年; 这里在每小时的 :05/:15/:25/:35/:45/:55 触发)

配置(在 gist.github.com 里编辑 yobang-monitor-config.json):
  {"enabled": true, "tracks": [{"uniId": "548948065", "name": "大梦归"}]}
  - enabled=false  停止抓取
  - tracks 数组里增删歌曲即换歌/加歌

快照文件: yobang-snap-{uniId}.json, 每首歌一个, 只保留最近 MAX_SNAPS 条。
Gist 需为 public(前端免 token 读取); 写入只用 SCF 侧 token。
"""

import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

CST = timezone(timedelta(hours=8))
UTC = timezone.utc

API_URL = "https://yobang.tencentmusic.com/unichartsapi/v1/songs/{uni_id}/charts_detail"
GITHUB_API = "https://api.github.com"
GIST_ID = os.environ.get("GIST_ID", "b153fed7b323ef2c10c230f12bd67142")
CONFIG_FILENAME = os.environ.get("CONFIG_FILENAME", "yobang-monitor-config.json")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
KEEP_DIMS = ["播放热度", "畅销度", "推荐度"]
MAX_SNAPS = 2000

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36"


def gh_headers(content_type=False):
    h = {
        "Authorization": "token " + TOKEN,
        "User-Agent": "yobang-monitor-scf",
        "Accept": "application/vnd.github+json",
    }
    if content_type:
        h["Content-Type"] = "application/json"
    return h


def http_json(url, method="GET", body=None, headers=None, timeout=20):
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def gist_get():
    return http_json(GITHUB_API + "/gists/" + GIST_ID, headers=gh_headers())


def gist_patch(files):
    body = {"files": {name: {"content": content} for name, content in files.items()}}
    http_json(GITHUB_API + "/gists/" + GIST_ID, method="PATCH", body=body, headers=gh_headers(True))


def fetch_current_issue(uni_id):
    url = API_URL.format(uni_id=uni_id)
    r = http_json(url, headers={"User-Agent": UA, "Referer": "https://yobang.tencentmusic.com/"})
    if r.get("code") != "0":
        raise RuntimeError(r.get("msg") or "API error")
    issues = r.get("data") or []
    return next((d for d in issues if d.get("dynamic")), issues[0] if issues else None)


def build_snapshot(issue):
    now_cst = datetime.now(UTC).astimezone(CST)
    minute = (now_cst.minute // 10) * 10 + 5
    at_cst = now_cst.replace(minute=minute, second=0, microsecond=0)
    dims = [
        {"name": d.get("name"), "index": float(d.get("index", 0) or 0)}
        for d in issue.get("classifyIndices", [])
        if d.get("name") in KEEP_DIMS
    ]
    return {
        "at": at_cst.astimezone(UTC).isoformat(timespec="seconds"),
        "issue": issue.get("chartsIssue"),
        "rank": issue.get("curRank"),
        "uniIndex": float(issue.get("uniIndex", 0) or 0),
        "dims": dims,
    }


def main_handler(event, context):
    if not TOKEN:
        return {"statusCode": 500, "body": json.dumps({"error": "GITHUB_TOKEN 未配置"})}

    gist = gist_get()
    files = {name: f.get("content", "") or "" for name, f in gist.get("files", {}).items()}

    raw_cfg = files.get(CONFIG_FILENAME, "")
    try:
        cfg = json.loads(raw_cfg) if raw_cfg.strip() else {}
    except Exception:
        cfg = {}

    if not cfg.get("enabled"):
        return {"statusCode": 200, "body": json.dumps({"status": "disabled"})}

    updated = {}
    result = []
    for t in cfg.get("tracks") or []:
        uni_id = str(t.get("uniId", "")).strip()
        if not uni_id:
            continue
        try:
            issue = fetch_current_issue(uni_id)
            if not issue:
                result.append({"uniId": uni_id, "error": "no dynamic issue"})
                continue
            snap = build_snapshot(issue)
            snap_file = "yobang-snap-" + uni_id + ".json"
            existing = []
            try:
                existing = json.loads(files.get(snap_file, "") or "[]")
                if not isinstance(existing, list):
                    existing = []
            except Exception:
                existing = []
            existing = [s for s in existing if not (s.get("issue") == snap["issue"] and s.get("at") == snap["at"])]
            existing.append(snap)
            existing = existing[-MAX_SNAPS:]
            updated[snap_file] = json.dumps(existing, ensure_ascii=False)
            result.append({
                "uniId": uni_id,
                "name": t.get("name", ""),
                "rank": snap["rank"],
                "uniIndex": snap["uniIndex"],
                "snaps": len(existing),
            })
        except Exception as e:
            result.append({"uniId": uni_id, "error": str(e)})

    if updated:
        gist_patch(updated)

    return {"statusCode": 200, "body": json.dumps({"status": "ok", "tracks": result}, ensure_ascii=False)}


def handler(event, context):
    return main_handler(event, context)


if __name__ == "__main__":
    print(json.dumps(main_handler({}, None), ensure_ascii=False, indent=2))
