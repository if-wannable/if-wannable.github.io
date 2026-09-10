// Cloudflare Worker: 解析抖音短链接
// 部署到 Cloudflare Workers 后，将 URL 填入 index.html 的 RESOLVE_API 常量

const ALLOWED_ORIGIN = '*'; // 可改为 'https://if-wannable.github.io'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TiktokBusiness/1.0';

const PC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractVideoId(s) {
  const m =
    s.match(/\/(?:share\/)?(?:note|video)\/(\d{15,20})/) ||
    s.match(/[?&](?:modal_id|vid|aweme_id)=(\d{15,20})/);
  return m ? m[1] : '';
}

function extractSecUid(s) {
  const m =
    s.match(/iesdouyin\.com\/share\/user\/([A-Za-z0-9_\-]{20,})/) ||
    s.match(/"sec_uid"\s*:\s*"(MS4w[A-Za-z0-9_\-]{10,})"/) ||
    s.match(/douyin\.com\/user\/([A-Za-z0-9_\-]{20,})/) ||
    s.match(/[?&](?:sec_uid|sec_owner_id)=([A-Za-z0-9_\-]{20,})/);
  return m ? decodeURIComponent(m[1]) : '';
}

function extractUserId(s) {
  const m = s.match(/"uid"\s*:\s*"(\d{10,})"/);
  return m ? m[1] : '';
}

async function registerTtwid() {
  try {
    const res = await fetch('https://ttwid.bytedance.com/ttwid/union/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': PC_UA },
      body: JSON.stringify({
        region: 'cn', aid: 1768, needFid: false, service: 'www.douyin.com',
        migrate_info: { ticket: '', source: 'node' }, cbUrlProtocol: 'https', union: true,
      }),
    });
    const setCookie = res.headers.get('set-cookie') || '';
    const m = setCookie.match(/ttwid=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  } catch (_) {
    return '';
  }
}

async function fetchUserId(secUid) {
  try {
    const ttwid = await registerTtwid();
    if (!ttwid) return '';
    const params = new URLSearchParams({
      device_platform: 'webapp', aid: '6383', channel: 'channel_pc_web',
      sec_user_id: secUid, version_code: '170400', version_name: '17.4.0',
      cookie_enabled: 'true', screen_width: '1536', screen_height: '864',
      browser_language: 'zh-CN', browser_platform: 'Win32',
      browser_name: 'Chrome', browser_version: '120.0.0.0', browser_online: 'true',
    });
    const res = await fetch('https://www.douyin.com/aweme/v1/web/user/profile/other/?' + params.toString(), {
      headers: {
        'User-Agent': PC_UA,
        'Referer': 'https://www.douyin.com/user/' + secUid,
        'Cookie': 'ttwid=' + ttwid,
      },
    });
    const body = await res.text();
    return extractUserId(body);
  } catch (_) {
    return '';
  }
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET,OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const target = searchParams.get('url') || '';
    const secUidParam = searchParams.get('sec_uid') || '';
    const rtype = searchParams.get('type') || 'video';

    let finalUrl = '';
    let body = '';
    let videoId = '';
    let secUid = '';

    if (target) {
      if (!/^https?:\/\/v\.douyin\.com\//i.test(target)) {
        return json({ error: 'url 参数缺失或非抖音短链' }, 400);
      }
      try {
        const resp = await fetch(target, {
          redirect: 'follow',
          headers: { 'User-Agent': MOBILE_UA },
        });
        finalUrl = resp.url;
        body = await resp.text();
      } catch (e) {
        return json({ error: '短链请求失败: ' + e.message }, 502);
      }
      videoId = extractVideoId(finalUrl) || extractVideoId(body);
      secUid = extractSecUid(finalUrl) || extractSecUid(body);
    } else if (secUidParam) {
      secUid = secUidParam;
    }

    let userId = '';
    if (rtype === 'user' && secUid) {
      userId = await fetchUserId(secUid);
    }

    return json({ finalUrl, videoId, secUid, userId });
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    },
  });
}