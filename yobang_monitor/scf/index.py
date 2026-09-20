# -*- coding: utf-8 -*-
"""腾讯 SCF: 由你榜歌曲监控(定时抓取) + 管理接口(HTTP)

两种触发方式共存:
  1. 定时触发器(抓取): 每 10 分钟读 Gist 配置, 抓取各维度分数写回 Gist。
  2. API 网关(管理): GET 读配置 / POST 更新配置(config.json), 供前端"管理监控"使用。

部署(腾讯 SCF 控制台):
  1. 运行环境 Python 3.9+, 入口函数 index.main_handler
  2. 环境变量:
       GITHUB_TOKEN      GitHub PAT(gist 权限)
       GIST_ID           Gist ID(默认 b153fed7b323ef2c10c230f12bd67142)
       CONFIG_FILENAME   配置文件名(默认 yobang-monitor-config.json)
       ADMIN_KEY         (可选)管理员密钥; 设置后前端写配置需带 X-Admin-Key 头
       CORS_ORIGIN       (可选)允许跨域的来源, 默认 *
  3. 定时触发器: 自定义 cron "0 5,15,25,35,45,55 * * * * *"
  4. API 网关触发器: 新建"API 网关"触发器, 得到 https://xxx 地址, 填到前端"管理监控"里

配置(yobang-monitor-config.json):
  {"enabled": true, "tracks": [{"uniId": "548948065", "name": "大梦归"}]}
  支持多首歌: tracks 数组里放多个即可, 定时任务会逐个抓取。
"""

import base64
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
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
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


def read_config():
    gist = gist_get()
    files = {name: f.get("content", "") or "" for name, f in gist.get("files", {}).items()}
    raw = files.get(CONFIG_FILENAME, "")
    try:
        return json.loads(raw) if raw.strip() else {}
    except Exception:
        return {}


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


# ── 定时抓取 ──────────────────────────────────────────────────────────────────

def handle_timer():
    if not TOKEN:
        return {"statusCode": 500, "body": json.dumps({"error": "GITHUB_TOKEN 未配置"})}

    cfg = read_config()
    if not cfg.get("enabled"):
        return {"statusCode": 200, "body": json.dumps({"status": "disabled"})}

    gist = gist_get()
    files = {name: f.get("content", "") or "" for name, f in gist.get("files", {}).items()}

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


# ── 管理接口(HTTP) ────────────────────────────────────────────────────────────

def cors_headers():
    return {
        "Content-Type": "application/json; charset=UTF-8",
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Admin-Key",
    }


def _resp(data, status=200):
    return {"statusCode": status, "headers": cors_headers(), "body": json.dumps(data, ensure_ascii=False)}


def _read_body(event):
    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8", "ignore")
    return body


def clear_snaps(body):
    uni_id = str(body.get("uniId", "")).strip()
    if not uni_id:
        return _resp({"error": "uniId 不能为空"}, 400)
    start_ms = body.get("startMs")
    end_ms = body.get("endMs")

    gist = gist_get()
    files = {name: f.get("content", "") or "" for name, f in gist.get("files", {}).items()}
    snap_file = "yobang-snap-" + uni_id + ".json"
    try:
        existing = json.loads(files.get(snap_file, "") or "[]")
        if not isinstance(existing, list):
            existing = []
    except Exception:
        existing = []

    def ts(s):
        try:
            return datetime.fromisoformat(str(s.get("at", "")).replace("Z", "+00:00")).timestamp() * 1000
        except Exception:
            return None

    def keep(s):
        t = ts(s)
        if t is None:
            return True
        if start_ms is not None and t < start_ms:
            return True
        if end_ms is not None and t > end_ms:
            return True
        return False

    filtered = [s for s in existing if keep(s)]
    removed = len(existing) - len(filtered)
    if removed:
        gist_patch({snap_file: json.dumps(filtered, ensure_ascii=False)})
    return _resp({"ok": True, "removed": removed, "remaining": len(filtered)})


def handle_http(event):
    if not TOKEN:
        return _resp({"error": "SCF 未配置 GITHUB_TOKEN"}, 500)

    method = (event.get("httpMethod") or "GET").upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": cors_headers(), "body": ""}

    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    key = headers.get("x-admin-key", "")
    if ADMIN_KEY and key != ADMIN_KEY:
        return _resp({"error": "管理员密钥错误"}, 401)

    if method == "GET":
        cfg = read_config()
        return _resp({"enabled": bool(cfg.get("enabled")), "tracks": cfg.get("tracks") or []})

    if method == "POST":
        try:
            body = json.loads(_read_body(event) or "{}")
        except Exception:
            return _resp({"error": "请求体不是合法 JSON"}, 400)
        if body.get("action") == "clearSnaps":
            return clear_snaps(body)
        enabled = bool(body.get("enabled"))
        tracks = []
        for t in body.get("tracks") or []:
            if isinstance(t, dict) and str(t.get("uniId", "")).strip():
                tracks.append({
                    "uniId": str(t.get("uniId")).strip(),
                    "name": str(t.get("name", "") or "").strip(),
                })
        new_cfg = {"enabled": enabled, "tracks": tracks}
        gist_patch({CONFIG_FILENAME: json.dumps(new_cfg, ensure_ascii=False, indent=2)})
        return _resp({"ok": True, "config": new_cfg})

    return _resp({"error": "method not allowed"}, 405)


def main_handler(event, context):
    if "httpMethod" in event:
        return handle_http(event)
    return handle_timer()


def handler(event, context):
    return main_handler(event, context)


if __name__ == "__main__":
    print(json.dumps(main_handler({}, None), ensure_ascii=False, indent=2))
