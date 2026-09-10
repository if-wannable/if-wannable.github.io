import json
import re
import urllib.request
import urllib.parse

MOBILE_UA = (
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
)

PC_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)

CORS_HEADERS = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
}


def _json(data, status=200):
    return {'statusCode': status, 'headers': CORS_HEADERS, 'body': json.dumps(data, ensure_ascii=False)}


def _extract_video_id(s):
    m = (re.search(r'/(?:share/)?(?:note|video)/(\d{15,20})', s) or
         re.search(r'[?&](?:modal_id|vid|aweme_id)=(\d{15,20})', s))
    return m.group(1) if m else ''


def _extract_sec_uid(s):
    m = (re.search(r'iesdouyin\.com/share/user/([A-Za-z0-9_\-]{20,})', s) or
         re.search(r'douyin\.com/user/([A-Za-z0-9_\-]{20,})', s) or
         re.search(r'[?&](?:sec_uid|sec_owner_id)=([A-Za-z0-9_\-]{20,})', s))
    return m.group(1) if m else ''


def _register_ttwid():
    url = 'https://ttwid.bytedance.com/ttwid/union/register/'
    data = json.dumps({
        'region': 'cn',
        'aid': 1768,
        'needFid': False,
        'service': 'www.douyin.com',
        'migrate_info': {'ticket': '', 'source': 'node'},
        'cbUrlProtocol': 'https',
        'union': True,
    }).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={
        'User-Agent': PC_UA,
        'Content-Type': 'application/json',
    })
    resp = urllib.request.urlopen(req, timeout=10)
    for cookie in (resp.headers.get_all('Set-Cookie') or []):
        m = re.search(r'ttwid=([^;]+)', cookie)
        if m:
            return urllib.parse.unquote(m.group(1))
    return ''


def _fetch_user_id(sec_uid):
    try:
        ttwid = _register_ttwid()
        if not ttwid:
            return ''
        params = urllib.parse.urlencode({
            'device_platform': 'webapp',
            'aid': '6383',
            'channel': 'channel_pc_web',
            'sec_user_id': sec_uid,
            'version_code': '170400',
            'version_name': '17.4.0',
            'cookie_enabled': 'true',
            'screen_width': '1536',
            'screen_height': '864',
            'browser_language': 'zh-CN',
            'browser_platform': 'Win32',
            'browser_name': 'Chrome',
            'browser_version': '120.0.0.0',
            'browser_online': 'true',
        })
        url = 'https://www.douyin.com/aweme/v1/web/user/profile/other/?' + params
        req = urllib.request.Request(url, headers={
            'User-Agent': PC_UA,
            'Referer': 'https://www.douyin.com/user/' + sec_uid,
            'Cookie': 'ttwid=' + ttwid,
        })
        body = urllib.request.urlopen(req, timeout=10).read().decode('utf-8', 'ignore')
        m = re.search(r'"uid"\s*:\s*"(\d{10,})"', body)
        return m.group(1) if m else ''
    except Exception:
        return ''


def handler(event, context):
    method = event.get('httpMethod', 'GET').upper()
    if method == 'OPTIONS':
        return {'statusCode': 204, 'headers': CORS_HEADERS, 'body': ''}

    params = event.get('queryString') or event.get('queryStringParameters') or {}
    target = params.get('url', '')
    sec_uid_param = params.get('sec_uid', '')
    rtype = params.get('type', 'video')

    video_id = ''
    sec_uid = ''
    final_url = ''

    if target:
        if not re.match(r'^https?://v\.douyin\.com/', target):
            return _json({'error': 'url 参数缺失或非抖音短链'}, 400)
        try:
            resp = urllib.request.urlopen(
                urllib.request.Request(target, headers={'User-Agent': MOBILE_UA}),
                timeout=10
            )
            final_url = resp.url
            body = resp.read().decode('utf-8', errors='ignore')
        except Exception as e:
            return _json({'error': f'短链请求失败: {e}'}, 502)

        video_id = _extract_video_id(final_url) or _extract_video_id(body)
        sec_uid = _extract_sec_uid(final_url) or _extract_sec_uid(body)
    elif sec_uid_param:
        sec_uid = sec_uid_param

    user_id = ''
    if rtype == 'user' and sec_uid:
        user_id = _fetch_user_id(sec_uid)

    return _json({
        'finalUrl': final_url,
        'videoId': video_id,
        'secUid': sec_uid,
        'userId': user_id,
    })
