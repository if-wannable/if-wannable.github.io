#!/usr/bin/env python3
"""Scrape Yobang (Tencent Music Uni Chart) data for a specific song.

Writes yobang-ledger/data.json with slot-based dedup (one snapshot per 10-min block).
Env vars: SONG_ID (default 530004147)
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

YOBANG_BASE = 'https://yobang.tencentmusic.com/unichartsapi/v1/songs'
QQ_COMMENT_URL = 'https://y.qq.com/cgi-bin/fcg_global_comment_h5.fcg'
SONG_ID = os.environ.get('SONG_ID', '530004147')
DATA_FILE = Path(__file__).resolve().parent.parent / 'yobang-ledger' / 'data.json'

CST = timezone(timedelta(hours=8))

HEADERS = {
    'User-Agent': ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                   'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
    'Referer': 'https://yobang.tencentmusic.com/',
}


def canonical_at(dt: datetime) -> str:
    """Normalize to :05/:15/:25/:35/:45/:55 mark of current 10-min block."""
    minute = (dt.minute // 10) * 10 + 5
    return dt.replace(minute=minute, second=0, microsecond=0).isoformat(timespec='seconds')


def slot_key(iso: str) -> int:
    """Return hour*6 + minute//10 for dedup (0..143)."""
    dt = datetime.fromisoformat(iso)
    return dt.hour * 6 + dt.minute // 10


def get(url, **kwargs):
    r = requests.get(url, headers=HEADERS, timeout=20, **kwargs)
    r.raise_for_status()
    return r.json()


def fetch_charts_detail() -> dict:
    data = get(f'{YOBANG_BASE}/{SONG_ID}/charts_detail')
    if str(data.get('code')) != '0':
        raise RuntimeError(f'charts_detail error: {data}')
    return data['data']


def fetch_info() -> dict:
    data = get(f'{YOBANG_BASE}/{SONG_ID}/info')
    if str(data.get('code')) != '0':
        raise RuntimeError(f'info error: {data}')
    return data['data']


def fetch_comment_total(qy_track_id) -> int | None:
    try:
        data = get(QQ_COMMENT_URL,
                   params={'cid': '205360772', 'song_id': qy_track_id},
                   headers={**HEADERS, 'Referer': 'https://y.qq.com/'})
        return data.get('hot_comment', {}).get('commenttotal')
    except Exception as e:
        print(f'WARN: comment fetch failed: {e}', file=sys.stderr)
        return None


def load_data() -> dict:
    if DATA_FILE.exists():
        with DATA_FILE.open(encoding='utf-8') as f:
            return json.load(f)
    return {
        'song_id': SONG_ID,
        'updated_at': None,
        'info': {},
        'current_issue': None,
        'current': None,
        'snapshots': {},
        'history': [],
    }


def save_data(data: dict):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    now = datetime.now(CST)
    at = canonical_at(now)
    print(f'Fetching yobang data for song={SONG_ID} at={at}', file=sys.stderr)

    detail = fetch_charts_detail()
    info_raw = fetch_info()

    # Split dynamic (current) vs history issues (detail is a list)
    current_issue = None
    history_issues = []
    for issue in detail:
        if issue.get('dynamic'):
            current_issue = issue
        else:
            history_issues.append(issue)
    if current_issue is None and detail:
        current_issue = detail[0]

    qy_track_id = info_raw.get('qyTrackId')
    comment_total = fetch_comment_total(qy_track_id) if qy_track_id else None

    data = load_data()
    data['song_id'] = SONG_ID
    data['updated_at'] = now.isoformat(timespec='seconds')
    data['info'] = {
        'track_name': info_raw.get('trackName', ''),
        'singer_name': info_raw.get('singerName', ''),
        'cover_image': info_raw.get('coverImage', ''),
        'qy_track_id': qy_track_id,
    }
    data['history'] = history_issues

    if current_issue:
        charts_issue = current_issue['chartsIssue']
        data['current_issue'] = charts_issue
        data['current'] = {**current_issue, 'comment_total': comment_total}

        snap = {
            'at': at,
            'uniIndex': current_issue.get('uniIndex'),
            'curRank': current_issue.get('curRank'),
            'dims': [
                {
                    'name': d.get('name'),
                    'code': d.get('code'),
                    'percentage': d.get('percentage'),
                    'index': d.get('index'),
                }
                for d in (current_issue.get('classifyIndices') or [])
                if (d.get('index') or 0) > 0
            ],
            'comment_total': comment_total,
        }

        snaps = data['snapshots'].setdefault(charts_issue, [])
        slot = slot_key(at)
        idx = next((i for i, s in enumerate(snaps) if slot_key(s['at']) == slot), -1)
        if idx >= 0:
            snaps[idx] = snap
            print(f'Updated existing slot {slot}', file=sys.stderr)
        else:
            snaps.append(snap)
            print(f'Added new snap (total={len(snaps)})', file=sys.stderr)
        snaps.sort(key=lambda s: s['at'])

    save_data(data)
    n = len(data['snapshots'].get(data.get('current_issue', ''), []))
    print(f'Saved data.json issue={data.get("current_issue")} snaps={n}', file=sys.stderr)


if __name__ == '__main__':
    main()
