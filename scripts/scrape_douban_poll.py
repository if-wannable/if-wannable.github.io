#!/usr/bin/env python3
"""Scrape Douban group poll using Playwright (renders JS).

Requires environment variable DOUBAN_COOKIE.
Optional: DOUBAN_TOPIC_ID (default 493741132), DOUBAN_POLL_ID (default 10258668).
"""

import csv
import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

TOPIC_ID = os.environ.get("DOUBAN_TOPIC_ID", "493741132")
POLL_ID = os.environ.get("DOUBAN_POLL_ID", "10258668")
TOPIC_URL = f"https://www.douban.com/group/topic/{TOPIC_ID}/"
CSV_PATH = Path(__file__).resolve().parent.parent / "douban_poll_log.csv"

CSV_HEADERS = [
    "captured_at", "topic_id", "poll_id", "participant_count",
    "result_visible", "option_id", "option", "votes", "percent", "note",
]

CST = timezone(timedelta(hours=8))
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def parse_cookie_string(cookie_str):
    cookies = []
    for pair in cookie_str.split(";"):
        pair = pair.strip()
        if not pair or "=" not in pair:
            continue
        name, value = pair.split("=", 1)
        cookies.append({
            "name": name.strip(),
            "value": value.strip(),
            "domain": ".douban.com",
            "path": "/",
        })
    return cookies


def render_page(cookie_str) -> str:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(user_agent=UA, locale="zh-CN")
        context.add_cookies(parse_cookie_string(cookie_str))
        page = context.new_page()
        page.goto(TOPIC_URL, wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        page.wait_for_timeout(3000)
        html = page.content()
        browser.close()
        return html


def extract_poll(html: str):
    soup = BeautifulSoup(html, "html.parser")

    poll_node = soup.find("div", attrs={"data-entity-type": "poll"})
    if not poll_node:
        return None

    participant_count = 0
    meta_node = poll_node.find(class_="poll-meta")
    if meta_node:
        m = re.search(r"(\d+)\s*人", meta_node.get_text())
        if m:
            participant_count = int(m.group(1))

    options = []
    for chart in poll_node.find_all(class_="poll-chart"):
        title_node = chart.find(class_="poll-option-title")
        count_node = chart.find(class_="poll-option-voted-count")
        bar_active = chart.find(class_="poll-bar-active")

        option_text = title_node.get_text(strip=True) if title_node else ""
        option_text = re.sub(r"（已选）", "", option_text)
        if not option_text:
            continue

        votes = None
        percent = None
        if count_node:
            text = count_node.get_text(strip=True)
            m = re.search(r"(\d+)\s*[（(]\s*(\d+(?:\.\d+)?)\s*%", text)
            if m:
                votes = int(m.group(1))
                percent = m.group(2)
        if percent is None and bar_active:
            style = bar_active.get("style", "")
            m = re.search(r"width:\s*(\d+(?:\.\d+)?)%", style)
            if m:
                percent = m.group(1)

        options.append({
            "option_id": option_text,
            "option": option_text,
            "votes": votes,
            "percent": percent,
        })

    if not options:
        return None

    result_visible = any(o["votes"] is not None for o in options)
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
            "votes": opt["votes"] if opt["votes"] is not None else "",
            "percent": opt["percent"] if opt["percent"] is not None else "",
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

    html = render_page(cookie)
    debug_path = Path("douban_debug.html")
    debug_path.write_text(html, encoding="utf-8")
    print(f"DEBUG: saved rendered HTML to {debug_path.resolve()} ({len(html)} bytes)", file=sys.stderr)

    if "没有访问权限" in html[:5000] or "login" in html.lower()[:2000]:
        print("ERROR: cookie invalid or expired", file=sys.stderr)
        sys.exit(2)

    snapshot = extract_poll(html)
    if not snapshot:
        print("ERROR: could not parse poll data from rendered HTML.", file=sys.stderr)
        soup = BeautifulSoup(html, "html.parser")
        poll_nodes = soup.find_all(attrs={"data-entity-type": "poll"})
        print(f"  data-entity-type=poll nodes: {len(poll_nodes)}", file=sys.stderr)
        poll_class_nodes = soup.find_all(class_=re.compile(r"poll", re.I))
        print(f"  elements with 'poll' in class: {len(poll_class_nodes)}", file=sys.stderr)
        for node in poll_class_nodes[:5]:
            print(f"    - <{node.name}> class={node.get('class')} children={len(node.find_all())}", file=sys.stderr)
        sys.exit(3)

    print(f"participant_count={snapshot['participant_count']} "
          f"result_visible={snapshot['result_visible']} "
          f"options={len(snapshot['options'])}", file=sys.stderr)
    append_csv(snapshot)


if __name__ == "__main__":
    main()
