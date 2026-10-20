/* db链接失效检测工具 - bookmarklet 注入脚本
 * 在 douban.com 页面运行，自动使用当前浏览器登录 cookie
 * 只读取页面判断链接是否失效（被删/不存在/无权限），不提交任何举报
 */
(function () {
  // 避免重复注入
  if (document.getElementById('db-ic-tool')) {
    document.getElementById('db-ic-tool').remove();
    return;
  }

  // 检查域名
  var host = location.hostname;
  if (host !== 'www.douban.com' && host !== 'douban.com') {
    alert('请在 www.douban.com 页面使用本工具。\n如果是手机，请在浏览器设置中切换到"桌面版"或"电脑版"网站。');
    return;
  }

  // ── 判定规则（与原本地服务 invalid_check_server.py 保持一致） ──
  var DEAD_RE = /内容已被删除|此内容已被删除|已被管理员删除|帖子已被删除|该话题已被删除|主题不存在|内容不存在|页面不存在|你访问的页面飘走了|你没有权限访问这个页面/i;
  var BLOCKED_RE = /登录使用豆瓣|异常请求|验证码|没有权限|无权访问|访问过于频繁/i;
  var LOGIN_RE = /accounts\.douban\.com|\/passport\/login/i;

  // ── 自动获取 ck ──
  function getCk() {
    for (const part of document.cookie.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === 'ck') return v.join('=').trim().replace(/^"|"$/g, '');
    }
    return null;
  }

  // ── 规范化链接：dispatch / douban:// 深链 / m站 / 带小组名 topic / 用户页 ──
  function normalizeLink(raw) {
    let url = raw.trim();
    // 豆瓣 App 深链 douban://douban.com/... → https://www.douban.com/...
    if (/^douban:\/\//i.test(url)) {
      url = 'https://' + url.replace(/^douban:\/\//i, '').replace(/^douban\.com/i, 'www.douban.com');
    }
    if (/^https?:\/\/m\.douban\.com/i.test(url)) {
      url = url.replace(/^https?:\/\/m\.douban\.com/i, 'https://www.douban.com');
    }
    if (/^https?:\/\/douban\.com/i.test(url)) {
      url = url.replace(/^https?:\/\/douban\.com/i, 'https://www.douban.com');
    }
    if (/doubanapp\/dispatch/i.test(url)) {
      try {
        const uri = new URL(url).searchParams.get('uri') || '';
        if (uri) url = /^https?:\/\//i.test(uri) ? uri : 'https://www.douban.com' + uri;
      } catch (e) { /* fallthrough */ }
    }
    // 查询参数里的 topic_id / topicId（如 App 举报页 .../report?topic_id=123&type=topic）
    let m = url.match(/[?&]topic_?id=(\d+)/i);
    if (m) return { type: '讨论', url: 'https://www.douban.com/group/topic/' + m[1] + '/' };
    m = url.match(/https?:\/\/www\.douban\.com\/group\/(?:[^/?#]+\/)?topic\/(\d+)/i);
    if (m) return { type: '讨论', url: 'https://www.douban.com/group/topic/' + m[1] + '/' };
    m = url.match(/https?:\/\/www\.douban\.com\/topic\/(\d+)/i);
    if (m) return { type: '讨论', url: 'https://www.douban.com/group/topic/' + m[1] + '/' };
    m = url.match(/https?:\/\/www\.douban\.com\/people\/(\d+)/i);
    if (m) return { type: '用户', url: 'https://www.douban.com/people/' + m[1] + '/' };
    return null;
  }

  function stripTags(v) {
    v = v.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
    v = v.replace(/<[^>]+>/g, ' ');
    return v.replace(/\s+/g, ' ').trim();
  }
  function pageMeta(body) {
    let title = '';
    const tm = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (tm) title = stripTags(tm[1]);
    if (!title) {
      const hm = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (hm) title = stripTags(hm[1]);
    }
    return { title: title.slice(0, 160) };
  }

  // ── 创建 UI ──
  const overlay = document.createElement('div');
  overlay.id = 'db-ic-tool';
  overlay.style.cssText = [
    'position:fixed', 'top:5px', 'right:5px',
    'width:460px', 'max-width:calc(100vw - 10px)', 'max-height:90vh', 'overflow-y:auto',
    'background:#edf7eb', 'border:1px solid #c9dfc5', 'border-radius:15px',
    'padding:14px', 'z-index:999999',
    'color:#4a554d', 'font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif', 'font-size:13px',
    'box-shadow:0 5px 18px rgba(70,85,72,0.11)',
  ].join(';');

  const css = `
    @media (max-width:520px){
      #db-ic-tool{left:5px!important;right:5px!important;width:auto!important;max-width:none!important;padding:12px!important}
      #db-ic-tool .row{flex-direction:column;align-items:stretch;gap:4px}
      #db-ic-tool label{margin-top:2px}
      #db-ic-tool input[type=number]{width:100%!important}
      #db-ic-tool .stats{flex-wrap:wrap;gap:10px}
    }
    #db-ic-tool * { box-sizing:border-box; margin:0; padding:0; }
    #db-ic-tool::before { content:""; display:block; width:38px; height:4px; margin:0 0 10px 2px; border-radius:3px; background:#d4e9d0; }
    #db-ic-tool h2 { font-size:15px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; color:#526257; cursor:move; user-select:none; touch-action:none; }
    #db-ic-tool .ck-info { font-size:11px; color:#808b83; margin-bottom:8px; font-family:monospace; }
    #db-ic-tool textarea { width:100%; min-height:90px; background:rgba(255,255,255,.78); border:1px solid rgba(214,224,211,.9); border-radius:8px; color:#4a554d; padding:8px; font-size:13px; resize:vertical; margin-bottom:8px; }
    #db-ic-tool textarea:focus { outline:none; border-color:#aabdaa; box-shadow:0 0 0 3px rgba(170,189,170,.18); }
    #db-ic-tool .row { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
    #db-ic-tool label { color:#808b83; font-size:11px; white-space:nowrap; }
    #db-ic-tool .rate-input { width:72px; background:rgba(255,255,255,.82); border:1px solid rgba(214,224,211,.9); border-radius:8px; color:#4a554d; padding:4px; font-size:12px; }
    #db-ic-tool button { background:#a9caa8; color:#fff; border:none; border-radius:6px; padding:8px 16px; font-size:13px; cursor:pointer; }
    #db-ic-tool button:hover:not(:disabled) { background:#94b994; }
    #db-ic-tool button:disabled { opacity:0.4; cursor:not-allowed; }
    #db-ic-tool button.danger { background:#c58f8f; }
    #db-ic-tool button.secondary { background:transparent; border:1px solid #d2ded0; color:#718077; }
    #db-ic-tool .progress-bar { width:100%; height:20px; background:rgba(255,255,255,.68); border:1px solid rgba(214,224,211,.9); border-radius:10px; overflow:hidden; margin-bottom:8px; }
    #db-ic-tool .progress-fill { height:100%; background:#a9bfa9; width:0%; transition:width .3s; border-radius:10px; text-align:center; line-height:20px; font-size:11px; color:#fff; font-weight:600; }
    #db-ic-tool .stats { display:flex; gap:16px; font-size:12px; margin-bottom:8px; flex-wrap:wrap; }
    #db-ic-tool .stats span { color:#808b83; }
    #db-ic-tool .stats b { color:#5d6b61; }
    #db-ic-tool .stats .ok { color:#7f9c82; }
    #db-ic-tool .stats .no { color:#b77f7f; }
    #db-ic-tool .stats .wn { color:#a18769; }
    #db-ic-tool .groups { display:grid; gap:8px; }
    #db-ic-tool .group { border:1px solid rgba(214,224,211,.9); border-radius:8px; overflow:hidden; background:rgba(255,255,255,.5); }
    #db-ic-tool .group-title { padding:6px 9px; font-size:12px; font-weight:600; background:rgba(255,255,255,.66); }
    #db-ic-tool .group-title small { font-weight:400; color:#808b83; margin-left:5px; }
    #db-ic-tool .group-title.alive { color:#7f9c82; }
    #db-ic-tool .group-title.dead { color:#b77f7f; }
    #db-ic-tool .group-title.unknown { color:#a18769; }
    #db-ic-tool .group-items:empty::before { content:"暂无"; display:block; padding:7px 9px; color:#9aa59d; font-size:11px; }
    #db-ic-tool .item { padding:7px 9px; border-top:1px solid #e2eee0; font-size:11px; }
    #db-ic-tool .item a.url { color:#718f75; word-break:break-all; text-decoration:underline; text-underline-offset:2px; }
    #db-ic-tool .item .reason { color:#808b83; margin-left:6px; }
    #db-ic-tool .item .preview { margin-top:4px; padding:5px 7px; border-left:3px solid #cfe4cb; color:#6f7f73; background:rgba(255,255,255,.5); line-height:1.5; word-break:break-word; }
    #db-ic-tool .item .preview b { color:#5d6b61; }
    #db-ic-tool .close-btn { background:transparent; border:none; color:#808b83; font-size:20px; cursor:pointer; padding:0 4px; min-width:32px; min-height:32px; box-shadow:none; }
    #db-ic-tool .close-btn:hover { color:#b77f7f; }
    #db-ic-tool .hidden { display:none !important; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const ck = getCk();
  overlay.innerHTML = `
    <h2>db链接失效检测
      <button class="close-btn" onclick="document.getElementById('db-ic-tool').remove()">&times;</button>
    </h2>
    <div class="ck-info">ck: ${ck || '❌ 未找到 ck（未登录时检测结果可能不准，部分仅登录可见内容会被判为无法判断）'}</div>

    <textarea id="db-ic-urls" placeholder="每行一个豆瓣讨论或用户主页链接（空行和纯文字自动跳过）&#10;https://www.douban.com/group/topic/XXXXXX/&#10;支持 doubanapp/dispatch、m.douban.com 格式"></textarea>
    <div class="row">
      <span id="db-ic-count" style="color:#808b83;font-size:11px"></span>
    </div>

    <div class="row">
      <label>间隔</label>
      <input type="number" id="db-ic-delay" value="500" min="100" max="10000" step="100" class="rate-input"> ms
    </div>
    <div class="row">
      <button id="db-ic-start" disabled>开始检测</button>
      <button id="db-ic-stop" class="danger" disabled>停止</button>
      <button id="db-ic-export" class="secondary hidden">导出结果CSV</button>
      <button id="db-ic-copy-dead" class="secondary hidden">复制失效链接</button>
    </div>

    <div class="progress-bar hidden" id="db-ic-pbar"><div class="progress-fill" id="db-ic-pfill"></div></div>
    <div class="stats hidden" id="db-ic-stats">
      <span>总计<b id="db-ic-total">0</b></span>
      <span>有效<b class="ok" id="db-ic-alive">0</b></span>
      <span>已失效<b class="no" id="db-ic-dead">0</b></span>
      <span>无法判断<b class="wn" id="db-ic-unknown">0</b></span>
    </div>
    <div class="groups hidden" id="db-ic-groups">
      <section class="group"><div class="group-title alive">有效 <small id="db-ic-alive-n">0</small></div><div class="group-items" id="db-ic-alive-list"></div></section>
      <section class="group"><div class="group-title dead">已失效 <small id="db-ic-dead-n">0</small></div><div class="group-items" id="db-ic-dead-list"></div></section>
      <section class="group"><div class="group-title unknown">无法判断 <small id="db-ic-unknown-n">0</small></div><div class="group-items" id="db-ic-unknown-list"></div></section>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── URL 输入 ──
  function extractUrls(text) {
    const urls = [];
    for (const line of text.split(/[\r\n]+/)) {
      const m = line.match(/https?:\/\/[^\s,;"'<>]+/i);
      if (m) urls.push(m[0].replace(/[)\]}>，。；、]+$/g, ''));
    }
    return urls;
  }
  function updateCount() {
    const n = extractUrls(document.getElementById('db-ic-urls').value).length;
    document.getElementById('db-ic-count').textContent = n ? n + ' 个链接' : '';
    document.getElementById('db-ic-start').disabled = n === 0;
  }
  document.getElementById('db-ic-urls').oninput = updateCount;
  updateCount();

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── 单条检测 ──
  async function checkOne(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const resp = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        redirect: 'follow',
        headers: { 'Accept': 'text/html,application/xhtml+xml' },
        signal: ctrl.signal,
      });
      const finalUrl = resp.url || '';
      const code = resp.status;
      const body = await resp.text();

      if (LOGIN_RE.test(finalUrl)) {
        return { status: 'unknown', label: '跳转登录页，cookie可能失效', http: code };
      }
      const meta = pageMeta(body);
      if (DEAD_RE.test(body)) {
        return { status: 'dead', label: '页面包含删除/不存在提示', http: code, title: meta.title };
      }
      if (BLOCKED_RE.test(body)) {
        return { status: 'unknown', label: '登录、权限或风控页面', http: code, title: meta.title };
      }
      if (code === 404 || code === 410) {
        return { status: 'dead', label: 'HTTP ' + code, http: code, title: meta.title };
      }
      if (code === 403) {
        return { status: 'unknown', label: 'HTTP 403 风控/无权限', http: code, title: meta.title };
      }
      if (code === 200) {
        return { status: 'alive', label: '页面正常返回', http: code, title: meta.title };
      }
      return { status: 'unknown', label: 'HTTP ' + code, http: code, title: meta.title };
    } catch (e) {
      return { status: 'unknown', label: String(e && e.name === 'AbortError' ? '请求超时' : e).slice(0, 60), http: 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── 结果展示 ──
  const results = [];
  function addItem(status, url, r) {
    const box = document.getElementById('db-ic-' + status + '-list');
    const preview = r.title
      ? '<div class="preview"><b>标题：</b>' + esc(r.title) + '</div>'
      : '';
    box.insertAdjacentHTML('beforeend',
      '<div class="item"><a class="url" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>' +
      '<span class="reason">HTTP ' + (r.http || '-') + ' · ' + esc(r.label) + '</span>' + preview + '</div>');
    document.getElementById('db-ic-' + status + '-n').textContent =
      box.querySelectorAll('.item').length;
    results.push({ url: url, status: status, reason: r.label, http: r.http || 0, title: r.title || '' });
    document.getElementById('db-ic-total').textContent = results.length;
    document.getElementById('db-ic-alive').textContent = document.getElementById('db-ic-alive-list').querySelectorAll('.item').length;
    document.getElementById('db-ic-dead').textContent = document.getElementById('db-ic-dead-list').querySelectorAll('.item').length;
    document.getElementById('db-ic-unknown').textContent = document.getElementById('db-ic-unknown-list').querySelectorAll('.item').length;
  }

  // ── 批量处理 ──
  let stopped = false;
  document.getElementById('db-ic-start').onclick = async function () {
    const rawUrls = extractUrls(document.getElementById('db-ic-urls').value);
    if (!rawUrls.length) return;
    const delay = parseInt(document.getElementById('db-ic-delay').value) || 500;
    stopped = false;
    results.length = 0;
    for (const k of ['alive', 'dead', 'unknown']) {
      document.getElementById('db-ic-' + k + '-list').innerHTML = '';
      document.getElementById('db-ic-' + k + '-n').textContent = '0';
    }

    this.disabled = true;
    document.getElementById('db-ic-stop').disabled = false;
    document.getElementById('db-ic-export').classList.add('hidden');
    document.getElementById('db-ic-copy-dead').classList.add('hidden');
    document.getElementById('db-ic-pbar').classList.remove('hidden');
    document.getElementById('db-ic-stats').classList.remove('hidden');
    document.getElementById('db-ic-groups').classList.remove('hidden');

    const total = rawUrls.length;
    for (let i = 0; i < total; i++) {
      if (stopped) break;
      const pct = Math.round((i / total) * 100);
      document.getElementById('db-ic-pfill').style.width = pct + '%';
      document.getElementById('db-ic-pfill').textContent = pct + '% (' + i + '/' + total + ')';

      const raw = rawUrls[i];
      const norm = normalizeLink(raw);
      if (!norm) {
        addItem('unknown', raw, { status: 'unknown', label: '不是支持的豆瓣链接', http: 0 });
        continue;
      }
      const r = await checkOne(norm.url);
      addItem(r.status, norm.url, r);

      if (!stopped && i < total - 1 && delay > 0) {
        await new Promise(res => setTimeout(res, delay));
      }
    }

    document.getElementById('db-ic-pfill').style.width = '100%';
    document.getElementById('db-ic-pfill').textContent = '100% (' + results.length + '/' + total + ')';
    this.disabled = false;
    document.getElementById('db-ic-stop').disabled = true;
    if (results.length) {
      document.getElementById('db-ic-export').classList.remove('hidden');
      document.getElementById('db-ic-copy-dead').classList.remove('hidden');
    }
  };

  document.getElementById('db-ic-stop').onclick = function () {
    stopped = true;
    this.disabled = true;
  };

  // ── 导出 CSV ──
  document.getElementById('db-ic-export').onclick = function () {
    const label = { alive: '有效', dead: '已失效', unknown: '无法判断' };
    const rows = [['链接', '状态', '说明', 'HTTP', '标题']];
    for (const r of results) rows.push([r.url, label[r.status] || r.status, r.reason, r.http, r.title]);
    const csv = '\ufeff' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'db_invalid_check_' + Date.now() + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };

  // ── 复制失效链接 ──
  document.getElementById('db-ic-copy-dead').onclick = function () {
    const dead = results.filter(r => r.status === 'dead').map(r => r.url).join('\n');
    if (!dead) { alert('没有失效链接'); return; }
    const btn = this;
    (navigator.clipboard ? navigator.clipboard.writeText(dead) : Promise.reject())
      .then(() => { btn.textContent = '已复制✓'; setTimeout(() => btn.textContent = '复制失效链接', 1500); })
      .catch(() => { window.prompt('复制以下失效链接：', dead); });
  };

  // ── 标题栏拖动 ──
  (function () {
    const h2 = overlay.querySelector('h2');
    let sx = 0, sy = 0, ox = 0, oy = 0, down = false;
    function onStart(e) {
      if (e.target.closest('button')) return;
      down = true;
      const p = e.touches ? e.touches[0] : e;
      const rect = overlay.getBoundingClientRect();
      sx = p.clientX; sy = p.clientY; ox = rect.left; oy = rect.top;
      overlay.style.right = 'auto'; overlay.style.left = ox + 'px'; overlay.style.top = oy + 'px';
      e.preventDefault();
    }
    function onMove(e) {
      if (!down) return;
      const p = e.touches ? e.touches[0] : e;
      overlay.style.left = Math.max(4, ox + p.clientX - sx) + 'px';
      overlay.style.top = Math.max(4, oy + p.clientY - sy) + 'px';
    }
    function onEnd() { down = false; }
    h2.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    h2.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  })();
})();
