#!/usr/bin/env python3
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent
DEAD = re.compile(r"内容已被删除|此内容已被删除|已被管理员删除|帖子已被删除|该话题已被删除|主题不存在|内容不存在|页面不存在|你访问的页面飘走了|你没有权限访问这个页面", re.I)
BLOCKED = re.compile(r"登录使用豆瓣|异常请求|验证码|没有权限|无权访问|访问过于频繁", re.I)
SUPPORTED = re.compile(r"^https://www\.douban\.com/(?:group/(?:[^/]+/)?topic|topic|people)/", re.I)

def normalize_url(raw):
    """Return a directly fetchable Douban URL, including doubanapp dispatch URLs."""
    value = raw.strip()
    parsed = urlparse(value)
    if parsed.netloc.lower() != "www.douban.com":
        return ""
    if parsed.path == "/doubanapp/dispatch":
        uri = parse_qs(parsed.query).get("uri", [""])[0]
        uri = unquote(uri).strip()
        if uri.startswith("http://www.douban.com/") or uri.startswith("https://www.douban.com/"):
            value = uri
        elif uri.startswith("/"):
            value = "https://www.douban.com" + uri
    return value if SUPPORTED.match(value) else ""

def check(url, cookie):
    fetch_url = normalize_url(url)
    if not fetch_url:
        return {"status":"unknown","label":"无法判断","reason":"不是支持的豆瓣链接","http_status":0}
    try:
        req = Request(fetch_url, headers={"User-Agent":"Mozilla/5.0", **({"Cookie": cookie} if cookie else {})})
        with urlopen(req, timeout=15) as res:
            body = res.read(800000).decode("utf-8", "replace")
            code = res.status
        if DEAD.search(body): return {"status":"dead","label":"已失效","reason":"页面包含删除/不存在提示","http_status":code}
        if BLOCKED.search(body): return {"status":"unknown","label":"无法判断","reason":"登录、权限或风控页面","http_status":code}
        return {"status":"alive","label":"有效","reason":"页面正常返回","http_status":code}
    except HTTPError as e:
        if e.code in (404, 410): return {"status":"dead","label":"已失效","reason":"HTTP " + str(e.code),"http_status":e.code}
        if e.code == 403:
            body = e.read(300000).decode("utf-8", "replace")
            if DEAD.search(body):
                return {"status":"dead","label":"已失效","reason":"页面提示无权限访问","http_status":e.code}
        return {"status":"unknown","label":"无法判断","reason":"HTTP " + str(e.code),"http_status":e.code}
    except (URLError, TimeoutError) as e:
        return {"status":"unknown","label":"无法判断","reason":"网络或超时","http_status":0}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/": self.send_error(404); return
        data = (ROOT / "invalid_check.html").read_bytes()
        self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_POST(self):
        if self.path != "/api/check": self.send_error(404); return
        try:
            n = int(self.headers.get("Content-Length", "0")); payload = json.loads(self.rfile.read(n))
            result = check(payload.get("url", ""), payload.get("cookie", ""))
            out = json.dumps(result, ensure_ascii=False).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)
        except Exception as e:
            self.send_error(400, "invalid request")
    def log_message(self, *_): pass

if __name__ == "__main__":
    print("Open http://127.0.0.1:8767/")
    ThreadingHTTPServer(("127.0.0.1", 8767), Handler).serve_forever()
