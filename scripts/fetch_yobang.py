#!/usr/bin/env python3
"""Fetch Tencent Music Uni Chart (由你榜) snapshot, append to Gist as JSONL.

Env vars:
  GIST_TOKEN  (required)  PAT with gist scope
  GIST_ID     (required)  Gist id that holds snapshot files
  UNI_ID      (optional, default '530004147')
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

CST = timezone(timedelta(hours=8))
UTC = timezone.utc

UNI_ID = os.environ.get("UNI_ID", "530004147").strip()
API_URL = f"https://yobang.tencentmusic.com/unichartsapi/v1/songs/{UNI_ID}/charts_detail"
GIST_API = "https://api.github.com/gists"
GIST_TOKEN = os.environ.get("GIST_TOKEN", "").strip()
GIST_ID = os.environ.get("GIST_ID", "").strip()

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://yobang.tencentmusic.com/",
}


# ── Gist helpers ──────────────────────────────────────────────────────────────

def gist_headers() -> dict[str, str]:
    return {
        "Authorization": f"token {GIST_TOKEN}",
        "Accept": "application/vnd.github+json",
    }


def gist_get_files() -> dict[str, str]:
    r = requests.get(f"{GIST_API}/{GIST_ID}", headers=gist_headers(), timeout=15)
    r.raise_for_status()
    data = r.json()
    return {name: f.get("content", "") or "" for name, f in data.get("files", {}).items()}


def gist_patch(files: dict[str, str]) -> None:
    body = {"files": {name: {"content": content} for name, content in files.items()}}
    r = requests.patch(f"{GIST_API}/{GIST_ID}", headers=gist_headers(), json=body, timeout=15)
    r.raise_for_status()


# ── Snapshot builder ──────────────────────────────────────────────────────────

def canonical_at(dt: datetime) -> str:
    """Round to the :05/:15/:25/:35/:45/:55 mark of the current 10-min block."""
    minute = (dt.minute // 10) * 10 + 5
    aligned = dt.replace(minute=minute, second=0, microsecond=0)
    return aligned.isoformat(timespec="seconds")


def build_snapshot(issue: dict) -> dict:
    """Build a snapshot dict in the same format app.js uses."""
    dims = [
        d for d in issue.get("classifyIndices", [])
        if float(d.get("index", 0) or 0) > 0
    ]
    now_cst = datetime.now(CST)
    return {
        "at":             canonical_at(now_cst),
        "chartsIssue":    issue.get("chartsIssue"),
        "uniIndex":       issue.get("uniIndex"),
        "curRank":        issue.get("curRank"),
        "nextUpdateTime": issue.get("nextUpdateTime") or None,
        "dims": [
            {
                "name":       d.get("name"),
                "code":       d.get("code"),
                "percentage": d.get("percentage"),
                "index":      d.get("index"),
            }
            for d in dims
        ],
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    if not GIST_TOKEN or not GIST_ID:
        print("ERROR: GIST_TOKEN and GIST_ID must be set", file=sys.stderr)
        return 1

    time.sleep(2)

    # 1. Fetch API
    try:
        r = requests.get(API_URL, headers=HEADERS, timeout=20)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"fetch failed: {e}", file=sys.stderr)
        return 2

    if data.get("code") != "0":
        print(f"API error: {data.get('msg')}", file=sys.stderr)
        return 3

    issues: list[dict] = data.get("data") or []
    current = next((d for d in issues if d.get("dynamic")), issues[0] if issues else None)
    if not current:
        print("no current issue in response", file=sys.stderr)
        return 4

    snapshot = build_snapshot(current)

    # 2. Read existing Gist
    try:
        files = gist_get_files()
    except Exception as e:
        print(f"cannot read gist: {e}", file=sys.stderr)
        return 5

    # 3. Append to per-day JSONL file
    day_file = f"yobang-{UNI_ID}-{datetime.now(CST).strftime('%Y-%m-%d')}.jsonl"
    existing = files.get(day_file, "")
    line = json.dumps(snapshot, ensure_ascii=False)
    files[day_file] = (existing + line + "\n") if existing else (line + "\n")

    # 4. Update latest.json (holds the full API response for the front-end)
    files["latest.json"] = json.dumps({
        "updated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "uni_id":     UNI_ID,
        "issues":     issues,
    }, ensure_ascii=False, indent=2)

    # 5. Write back
    try:
        gist_patch(files)
    except Exception as e:
        print(f"cannot write gist: {e}", file=sys.stderr)
        return 6

    print(f"OK: appended to {day_file}; rank=#{snapshot['curRank']} index={snapshot['uniIndex']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
