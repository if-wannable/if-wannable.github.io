# -*- coding: utf-8 -*-
"""腾讯 SCF: 摘豆子任务数据云端同步代理
持有 GitHub token(环境变量),前端匿名调用即可读写 Gist
部署后在腾讯 SCF 控制台配置环境变量:GITHUB_TOKEN / GIST_ID / GIST_FILENAME
"""
import json
import os
import urllib.request
import urllib.error

CORS_HEADERS = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': 'https://if-wannable.github.io',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

GITHUB_API = 'https://api.github.com'


def _json(data, status=200):
    return {
        'statusCode': status,
        'headers': CORS_HEADERS,
        'body': json.dumps(data, ensure_ascii=False),
    }


def _gh_headers(content_type=False):
    h = {
        'Authorization': f"token {os.environ.get('GITHUB_TOKEN', '')}",
        'User-Agent': 'tasks-sync-scf',
        'Accept': 'application/vnd.github+json',
    }
    if content_type:
        h['Content-Type'] = 'application/json'
    return h


def _read_body(event):
    body = event.get('body') or ''
    if event.get('isBase64Encoded'):
        import base64
        body = base64.b64decode(body).decode('utf-8', 'ignore')
    return body


def handler(event, context):
    method = event.get('httpMethod', 'GET').upper()

    # CORS 预检
    if method == 'OPTIONS':
        return {'statusCode': 204, 'headers': CORS_HEADERS, 'body': ''}

    gist_id = os.environ.get('GIST_ID', 'b153fed7b323ef2c10c230f12bd67142')
    filename = os.environ.get('GIST_FILENAME', 'tasks.json')
    token = os.environ.get('GITHUB_TOKEN', '')

    if not gist_id or not token:
        return _json({'error': 'SCF 未配置 GIST_ID / GITHUB_TOKEN 环境变量'}, 500)

    try:
        # GET: 读取 Gist
        if method == 'GET':
            req = urllib.request.Request(
                f'{GITHUB_API}/gists/{gist_id}',
                headers=_gh_headers(),
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            content_raw = (data.get('files') or {}).get(filename, {}).get('content')
            content = json.loads(content_raw) if content_raw else None
            return _json({'content': content})

        # POST: 写入 Gist
        if method == 'POST':
            body_raw = _read_body(event)
            try:
                payload = json.loads(body_raw)
            except Exception:
                return _json({'error': 'body 不是合法 JSON'}, 400)

            patch_body = json.dumps({
                'files': {
                    filename: {
                        'content': json.dumps(payload, ensure_ascii=False, indent=2),
                    }
                }
            }).encode('utf-8')

            req = urllib.request.Request(
                f'{GITHUB_API}/gists/{gist_id}',
                data=patch_body,
                method='PATCH',
                headers=_gh_headers(content_type=True),
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    resp.read()
                return _json({'ok': True})
            except urllib.error.HTTPError as e:
                detail = e.read().decode('utf-8', errors='ignore')
                return _json({'error': f'GitHub {e.code}', 'detail': detail}, 502)

        return _json({'error': 'Method not allowed'}, 405)
    except Exception as e:
        return _json({'error': str(e)}, 500)
