#!/usr/bin/env python3
"""Scrape Douban group poll and append snapshot to douban_poll_log.csv.

Requires environment variable DOUBAN_COOKIE (Douban login cookies).
Optional: DOUBAN_TOPIC_ID (default 493741132), DOUBAN_POLL_ID (default 10258668),
          DEBUG=1 to save raw HTML for inspection.
"""

import csv
import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

TOPIC_ID = os.environ.get("DOUBAN_TOPIC_ID", "493741132")
POLL_ID = os.environ.get("DOUBAN_POLL_ID", "10258668")
TOPIC_URL = f"https://www.douban.com/group/topic/{TOPIC_ID}/"
CSV_PATH = Path(__file__).resolve().parent.parent / "douban_poll_log.csv"
DEBUG = os.environ.get("DEBUG") == "1"

CSV_HEADERS = [
    "captured_at", "topic_id", "poll_id", "participant_count",
    "result_visible", "option_id", "option", "votes", "percent", "note",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://www.douban.com/",
}

CST = timezone(timedelta(hours=8))


def fetch_page(cookie: str) -> str:
    headers = {**HEADERS, "Cookie": cookie}
    resp = requests.get(TOPIC_URL, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.text


def extract_poll_from_json(html: str):
    """Try to find poll data embedded in <script> tags as JSON."""
    soup = BeautifulSoup(html, "html.parser")
    for script in soup.find_all("script"):
        text = script.string or ""
        m = re.search(r'(?:window\.__DATA__|window\.__INITIAL_STATE__)\s*=\s*({.+?});', text, re.S)
        if not m:
            continue
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        poll = _dig(data, "poll") or _dig(data, "groupPoll") or _dig(data, "topic", "poll")
        if poll:
            return _normalize_json_poll(poll)
    return None


def _dig(obj, *keys):
    cur = obj
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
        if cur is None:
            return None
    return cur


def _normalize_json_poll(poll):
    options = []
    for opt in poll.get("options") or poll.get("items") or []:
        options.append({
            "option_id": str(opt.get("id") or opt.get("option_id") or ""),
            "option": opt.get("name") or opt.get("label") or opt.get("option") or "",
            "votes": opt.get("votes") or opt.get("count") or 0,
            "percent": opt.get("percent") or opt.get("percentage"),
        })
    return {
        "participant_count": poll.get("participant_count") or poll.get("total") or 0,
        "result_visible": bool(options and any(o["votes"] for o in options)),
        "options": options,
    }


def extract_poll_from_html(html: str):
    """Parse poll widget from HTML. Adjust selectors if Douban changes markup."""
    soup = BeautifulSoup(html, "html.parser")

    poll_node = (
        soup.find("div", class_=re.compile(r"poll"))
        or soup.find("div", id="poll")
        or soup.find("div", class_="group-poll")
    )
    if not poll_node:
        return None

    participant_count = 0
    participant_node = poll_node.find(class_=re.compile(r"participant|total|count"))
    if participant_node:
        m = re.search(r"(\d+)", participant_node.get_text())
        if m:
            participant_count = int(m.group(1))

    options = []
    for li in poll_node.find_all("li"):
        name_node = li.find(class_=re.compile(r"option|label|name|text"))
        votes_node = li.find(class_=re.compile(r"vote|count|num"))
        percent_node = li.find(class_=re.compile(r"percent|rate"))
        opt_id = li.get("data-id") or li.get("data-option-id") or ""
        option_text = name_node.get_text(strip=True) if name_node else li.get_text(strip=True)
        votes = 0
        if votes_node:
            m = re.search(r"(\d+)", votes_node.get_text())
            if m:
                votes = int(m.group(1))
        percent = None
        if percent_node:
            m = re.search(r"(\d+(?:\.\d+)?)\s*%", percent_node.get_text())
            if m:
                percent = m.group(1)
        options.append({
            "option_id": str(opt_id),
            "option": option_text,
            "votes": votes,
            "percent": percent,
        })

    if not options:
        return None

    result_visible = any(o["votes"] for o in options)
    return {
        "participant_count": participant_count,
        "result_visible": result_visible,
        "options": options,
    }


def append_csv(snapshot):
    now = datetime.now(CST).isoformat(timespec="seconds")
    rows_new = []
    for opt in snapshot["options"]:
        rows_new.append({
            "captured_at": now,
            "topic_id": TOPIC_ID,
            "poll_id": POLL_ID,
            "participant_count": snapshot["participant_count"],
            "result_visible": str(snapshot["result_visible"]).lower(),
            "option_id": opt["option_id"],
            "option": opt["option"],
            "votes": opt["votes"] if snapshot["result_visible"] else "",
            "percent": opt["percent"] if snapshot["result_visible"] else "",
            "note": "GitHub Actions 自动抓取" + ("，已见票数" if snapshot["result_visible"] else "，仅参与人数"),
        })

    exists = CSV_PATH.exists()
    with CSV_PATH.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        if not exists:
            writer.writeheader()
        writer.writerows(rows_new)
    print(f"Appended {len(rows_new)} rows to {CSV_PATH}", file=sys.stderr)


def main():
    cookie = os.environ.get("DOUBAN_COOKIE", "").strip()
    if not cookie:
        print("ERROR: DOUBAN_COOKIE not set", file=sys.stderr)
        sys.exit(1)

    html = fetch_page(cookie)
    if DEBUG:
        Path("/tmp/douban_topic_debug.html").write_text(html, encoding="utf-8")
        print("DEBUG: saved HTML to /tmp/douban_topic_debug.html", file=sys.stderr)

    if "没有访问权限" in html or "login" in html.lower()[:2000]:
        print("ERROR: cookie invalid or expired (page shows login/no-access)", file=sys.stderr)
        sys.exit(2)

    snapshot = extract_poll_from_json(html) or extract_poll_from_html(html)
    if not snapshot:
        print("ERROR: could not parse poll data. Run with DEBUG=1 to inspect HTML.", file=sys.stderr)
        sys.exit(3)

    print(f"participant_count={snapshot['participant_count']} "
          f"result_visible={snapshot['result_visible']} "
          f"options={len(snapshot['options'])}", file=sys.stderr)
    append_csv(snapshot)


if __name__ == "__main__":
    main()
