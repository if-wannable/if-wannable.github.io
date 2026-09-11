// Cloudflare Worker: 摘豆子任务数据云端同步代理
// 持有 GitHub token,前端匿名调用即可读写 Gist
// 部署后把 Worker URL 填入 index.html 的 WORKER_URL 常量

const ALLOWED_ORIGIN = 'https://if-wannable.github.io';
const GITHUB_API = 'https://api.github.com';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const gistId = env.GIST_ID;
    const token = env.GITHUB_TOKEN;
    const filename = env.GIST_FILENAME || 'tasks.json';

    if (!gistId || !token) {
      return json({ error: 'Worker 未配置 GIST_ID / GITHUB_TOKEN' }, 500);
    }

    const ghHeaders = {
      Authorization: `token ${token}`,
      'User-Agent': 'tasks-sync-worker',
      Accept: 'application/vnd.github+json',
    };

    try {
      // GET: 读取 Gist
      if (request.method === 'GET') {
        const r = await fetch(`${GITHUB_API}/gists/${gistId}`, { headers: ghHeaders });
        if (!r.ok) return json({ error: `GitHub ${r.status}` }, 502);
        const data = await r.json();
        const content = data.files?.[filename]?.content;
        return json({ content: content ? JSON.parse(content) : null });
      }

      // POST: 写入 Gist
      if (request.method === 'POST') {
        const body = await request.json();
        const r = await fetch(`${GITHUB_API}/gists/${gistId}`, {
          method: 'PATCH',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: { [filename]: { content: JSON.stringify(body, null, 2) } } }),
        });
        if (r.ok) return json({ ok: true });
        const text = await r.text();
        return json({ error: `GitHub ${r.status}`, detail: text }, 502);
      }

      return json({ error: 'Method not allowed' }, 405);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
};
