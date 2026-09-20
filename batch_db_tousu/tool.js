/* db批量投诉工具 - bookmarklet 注入脚本
 * 在 douban.com 页面运行，自动获取 cookie，直接调用db API
 * 举报讨论本身（非回复），使用 /misc/audit_report 接口
 */
(function () {
  // 避免重复注入
  if (document.getElementById('db-jb-tool')) {
    document.getElementById('db-jb-tool').remove();
    return;
  }

  // 检查域名
  var host = location.hostname;
  if (host !== 'www.douban.com' && host !== 'douban.com') {
    alert('请在 www.douban.com 页面使用本工具。\n如果是手机，请在浏览器设置中切换到"桌面版"或"电脑版"网站。');
    return;
  }

  // ── 举报理由（来自db API /rexxar/api/v2/report/reasons?types=content） ──
  const REASONS = [
    {name:"引战", id:7},
    {name:"广告", id:0},
    {name:"影响评分公正性", id:10},
    {name:"算法推荐类违规信息", id:18},
    {name:"水军养号", id:79},
    {name:"网络暴力/网络戾气", subs:[
      {name:"歧视偏见",id:39},{name:"谩骂攻击",id:40},{name:"泄露隐私",id:41},
      {name:"煽动性言论",id:42},{name:"其他网暴信息",id:74},{name:"开盒行为",id:77},{name:"我被网暴",id:78}
    ]},
    {name:"政治相关", subs:[
      {name:"政治制度",id:20},{name:"历史虚无",id:21},{name:"民族仇恨",id:22},
      {name:"分裂言论",id:23},{name:"煽动言论",id:24},{name:"其他政治有害信息",id:25}
    ]},
    {name:"色情低俗", subs:[
      {name:"低俗内容",id:26},{name:"色情作品",id:27},{name:"色情导流",id:28},
      {name:"色情交易",id:29},{name:"其他色情低俗信息",id:30}
    ]},
    {name:"不实信息", subs:[
      {name:"疫情类不实信息",id:31},{name:"科普类不实信息",id:32},{name:"社会谣言",id:33},
      {name:"时政谣言",id:34},{name:"虚假新闻",id:35},{name:"其他不实信息",id:36}
    ]},
    {name:"辱骂攻击", subs:[
      {name:"侮辱谩骂",id:37},{name:"人身攻击",id:38}
    ]},
    {name:"饭圈乱象", subs:[
      {name:"涉未成年人",id:43},{name:"鼓动粉丝攀比",id:44},{name:"网络水军",id:45},
      {name:"干扰舆论",id:46},{name:"造谣爆料",id:47},{name:"挂人引战",id:48},{name:"内容来源不明",id:49}
    ]},
    {name:"违法违规", subs:[
      {name:"涉嫌欺诈",id:50},{name:"涉枪涉爆",id:51},{name:"毒品危险品",id:52},
      {name:"邪教相关",id:53},{name:"非法交易",id:54},{name:"恐怖血腥",id:55},
      {name:"赌博内容",id:56},{name:"教唆犯罪",id:57},{name:"其他违法违规信息",id:59},
      {name:"封建迷信",id:67},{name:"非法外链",id:75}
    ]},
    {name:"涉未成年人", subs:[
      {name:"诱导不良行为",id:60},{name:"欺凌霸凌",id:61},{name:"儿童邪典",id:62},
      {name:"儿童色情",id:63},{name:"泄露隐私",id:64},{name:"其他涉未成年人有害信息",id:65}
    ]},
    {name:"自媒体乱象", subs:[
      {name:"冒充机构媒体及特定职业",id:66},{name:"其他仿冒信息",id:68}
    ]},
    {name:"涉重大赛事", subs:[
      {name:"违规营销",id:69},{name:"造谣传谣",id:70},{name:"未经授权",id:71},
      {name:"假冒仿冒",id:72},{name:"其他不良信息",id:73}
    ]},
    {name:"AI乱象", subs:[
      {name:"AI造假",id:80},{name:"其他AI违规信息",id:81}
    ]},
  ];

  // ── 提取 ck ──
  function getCk() {
    for (const part of document.cookie.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === 'ck') return v.join('=').trim().replace(/^"|"$/g, '');
    }
    return null;
  }

  // ── 规范化 URL：支持 doubanapp/dispatch 和直接 topic URL ──
  function normalizeUrl(url) {
    // doubanapp/dispatch 格式
    if (url.includes('doubanapp/dispatch')) {
      try {
        const u = new URL(url);
        const uri = u.searchParams.get('uri') || '';
        const m = uri.match(/\/group\/topic\/(\d+)/);
        if (m) return 'https://www.douban.com/group/topic/' + m[1] + '/';
      } catch (e) { /* fallthrough */ }
    }
    // 直接 topic URL
    const m = url.match(/\/group\/topic\/(\d+)/);
    if (m) return 'https://www.douban.com/group/topic/' + m[1] + '/';
    return null;
  }

  // ── 创建 UI ──
  const overlay = document.createElement('div');
  overlay.id = 'db-jb-tool';
  overlay.style.cssText = [
    'position:fixed', 'top:5px', 'right:5px',
    'width:460px', 'max-width:calc(100vw - 10px)', 'max-height:90vh', 'overflow-y:auto',
    'background:#1a1d29', 'border:1px solid #2a2d3a', 'border-radius:8px',
    'padding:14px', 'z-index:999999',
    'color:#e0e0e8', 'font-family:-apple-system,sans-serif', 'font-size:13px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.6)',
  ].join(';');

  const css = `
    @media (max-width:520px){
      #db-jb-tool{left:5px!important;right:5px!important;width:auto!important;max-width:none!important;padding:12px!important}
      #db-jb-tool .row{flex-direction:column;align-items:stretch;gap:4px}
      #db-jb-tool label{margin-top:2px}
      #db-jb-tool select,#db-jb-tool input[type=number]{width:100%!important}
      #db-jb-tool .stats{flex-wrap:wrap;gap:10px}
      #db-jb-tool .le{flex-wrap:wrap}
      #db-jb-tool .le .detail{margin-left:0;width:100%;text-align:left}
    }
    #db-jb-tool * { box-sizing:border-box; margin:0; padding:0; }
    #db-jb-tool h2 { font-size:15px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; color:#fff; }
    #db-jb-tool .ck-info { font-size:11px; color:#888; margin-bottom:8px; font-family:monospace; }
    #db-jb-tool textarea { width:100%; min-height:70px; background:#0f1117; border:1px solid #2a2d3a; border-radius:4px; color:#e0e0e8; padding:8px; font-size:14px; resize:vertical; margin-bottom:8px; }
    #db-jb-tool textarea:focus, #db-jb-tool select:focus { outline:none; border-color:#4e7ef3; }
    #db-jb-tool select { background:#0f1117; border:1px solid #2a2d3a; border-radius:4px; color:#e0e0e8; padding:8px; font-size:13px; }
    #db-jb-tool .row { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
    #db-jb-tool label { color:#888; font-size:11px; white-space:nowrap; }
    #db-jb-tool button { background:#4e7ef3; color:#fff; border:none; border-radius:4px; padding:8px 16px; font-size:13px; cursor:pointer; }
    #db-jb-tool button:hover:not(:disabled) { background:#3d6de0; }
    #db-jb-tool button:disabled { opacity:0.4; cursor:not-allowed; }
    #db-jb-tool button.danger { background:#f44336; }
    #db-jb-tool button.secondary { background:transparent; border:1px solid #2a2d3a; color:#ccc; }
    #db-jb-tool .progress-bar { width:100%; height:20px; background:#0f1117; border:1px solid #2a2d3a; border-radius:10px; overflow:hidden; margin-bottom:8px; }
    #db-jb-tool .progress-fill { height:100%; background:linear-gradient(90deg,#4e7ef3,#4caf50); width:0%; transition:width .3s; border-radius:10px; text-align:center; line-height:20px; font-size:11px; color:#fff; font-weight:600; }
    #db-jb-tool .stats { display:flex; gap:16px; font-size:12px; margin-bottom:8px; }
    #db-jb-tool .stats span { color:#888; }
    #db-jb-tool .stats b { color:#e0e0e8; }
    #db-jb-tool .stats .ok { color:#4caf50; }
    #db-jb-tool .stats .no { color:#f44336; }
    #db-jb-tool .log { max-height:250px; overflow-y:auto; border:1px solid #2a2d3a; border-radius:4px; background:#0c0e14; -webkit-overflow-scrolling:touch; }
    #db-jb-tool .log:empty { display:none; }
    #db-jb-tool .le { padding:6px 8px; border-bottom:1px solid #2a2d3a; font-size:11px; display:flex; gap:6px; align-items:baseline; }
    #db-jb-tool .le:last-child { border-bottom:none; }
    #db-jb-tool .le .icon { font-weight:700; flex-shrink:0; }
    #db-jb-tool .le.ok .icon { color:#4caf50; }
    #db-jb-tool .le.no .icon { color:#f44336; }
    #db-jb-tool .le .url { color:#4e7ef3; word-break:break-all; }
    #db-jb-tool .le .detail { color:#888; margin-left:auto; }
    #db-jb-tool input[type=file] { display:none; }
    #db-jb-tool .file-btn { background:transparent; border:1px solid #2a2d3a; color:#888; border-radius:4px; padding:8px 12px; font-size:11px; cursor:pointer; }
    #db-jb-tool .file-btn:hover { border-color:#4e7ef3; color:#ccc; }
    #db-jb-tool .close-btn { background:transparent; border:none; color:#888; font-size:20px; cursor:pointer; padding:0 4px; min-width:32px; min-height:32px; }
    #db-jb-tool .close-btn:hover { color:#f44336; }
    #db-jb-tool .hidden { display:none !important; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const ck = getCk();
  overlay.innerHTML = `
    <h2>db批量投诉
      <button class="close-btn" onclick="document.getElementById('db-jb-tool').remove()">&times;</button>
    </h2>
    <div class="ck-info">ck: ${ck || '❌ 未找到 ck，请确保已登录db'}</div>

    <textarea id="db-jb-urls" placeholder="每行一个讨论链接（会自动跳过空行和纯文字）&#10;https://www.douban.com/group/topic/XXXXXX/&#10;也支持 doubanapp/dispatch 格式"></textarea>
    <div class="row">
      <label class="file-btn">📁 选择CSV<input type="file" id="db-jb-file" accept=".csv,.txt"></label>
      <span id="db-jb-count" style="color:#888;font-size:11px"></span>
    </div>

    <div class="row">
      <label>大类</label>
      <select id="db-jb-parent"><option value="">请选择</option></select>
      <label id="db-jb-lsub" class="hidden">小类</label>
      <select id="db-jb-sub" class="hidden"><option value="">请选择</option></select>
    </div>
    <div class="row">
      <label>间隔</label>
      <input type="number" id="db-jb-delay" value="800" min="200" max="10000" step="100" style="width:70px;background:#0f1117;border:1px solid #2a2d3a;border-radius:4px;color:#e0e0e8;padding:4px;font-size:12px"> ms
    </div>
    <div class="row">
      <button id="db-jb-start" disabled>开始投诉</button>
      <button id="db-jb-stop" class="danger" disabled>停止</button>
    </div>

    <div class="progress-bar" id="db-jb-pbar" style="display:none">
      <div class="progress-fill" id="db-jb-pfill"></div>
    </div>
    <div class="stats" id="db-jb-stats" style="display:none">
      <span>总计<b id="db-jb-total">0</b></span>
      <span>成功<b class="ok" id="db-jb-done">0</b></span>
      <span>失败<b class="no" id="db-jb-fail">0</b></span>
    </div>
    <div class="log" id="db-jb-log"></div>
  `;
  document.body.appendChild(overlay);

  // ── 填充理由下拉（两级） ──
  const selP = document.getElementById('db-jb-parent');
  for (const r of REASONS) {
    const opt = document.createElement('option');
    opt.value = r.name;
    opt.textContent = r.name;
    selP.appendChild(opt);
  }

  selP.onchange = function () {
    const sub = document.getElementById('db-jb-sub');
    const lsub = document.getElementById('db-jb-lsub');
    const r = REASONS.find(x => x.name === this.value);
    sub.innerHTML = '<option value="">请选择</option>';
    if (r && r.subs) {
      sub.classList.remove('hidden');
      lsub.classList.remove('hidden');
      for (const s of r.subs) {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = s.name;
        sub.appendChild(opt);
      }
    } else {
      sub.classList.add('hidden');
      lsub.classList.add('hidden');
    }
    checkReady();
  };

  document.getElementById('db-jb-sub').onchange = checkReady;

  // ── URL 输入 ──
  function extractUrls(text) {
    const urls = [];
    for (const line of text.split(/[\r\n]+/)) {
      const l = line.trim();
      const m = l.match(/https?:\/\/[^\s,;"']+/);
      if (m) urls.push(m[0]);
      else if (l.startsWith('http')) urls.push(l);
    }
    return urls;
  }

  function getUrls() {
    return extractUrls(document.getElementById('db-jb-urls').value);
  }

  function updateCount() {
    const n = getUrls().length;
    document.getElementById('db-jb-count').textContent = n ? n + ' 个链接' : '';
    checkReady();
  }

  document.getElementById('db-jb-urls').oninput = updateCount;

  document.getElementById('db-jb-file').onchange = function (e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const urls = extractUrls(ev.target.result);
      const ta = document.getElementById('db-jb-urls');
      ta.value = ta.value.trim() ? ta.value + '\n' + urls.join('\n') : urls.join('\n');
      updateCount();
    };
    reader.readAsText(f, 'utf-8');
  };

  // ── 获取选中的理由 ──
  function getReason() {
    const pn = document.getElementById('db-jb-parent').value;
    const r = REASONS.find(x => x.name === pn);
    if (!r) return null;
    if (r.subs) {
      const sn = document.getElementById('db-jb-sub').value;
      if (!sn) return null;
      const s = r.subs.find(x => x.name === sn);
      return s ? { id: s.id, name: s.name } : null;
    }
    return { id: r.id, name: r.name };
  }

  function checkReady() {
    const ok = ck && getUrls().length > 0 && getReason();
    document.getElementById('db-jb-start').disabled = !ok;
  }

  // ── 批量处理 ──
  let stopped = false;

  document.getElementById('db-jb-start').onclick = async function () {
    const urls = getUrls();
    const reason = getReason();
    if (!urls.length || !reason) return;
    const delay = parseInt(document.getElementById('db-jb-delay').value) || 800;
    stopped = false;

    this.disabled = true;
    document.getElementById('db-jb-stop').disabled = false;
    document.getElementById('db-jb-pbar').style.display = 'block';
    document.getElementById('db-jb-stats').style.display = 'flex';
    document.getElementById('db-jb-log').innerHTML = '';

    let done = 0, failed = 0;
    const total = urls.length;
    const log = document.getElementById('db-jb-log');

    for (let i = 0; i < urls.length; i++) {
      if (stopped) break;
      const rawUrl = urls[i].trim();
      if (!rawUrl) continue;

      // 进度
      const pct = Math.round((i / total) * 100);
      document.getElementById('db-jb-pfill').style.width = pct + '%';
      document.getElementById('db-jb-pfill').textContent = pct + '%';
      document.getElementById('db-jb-total').textContent = total;
      document.getElementById('db-jb-done').textContent = done;
      document.getElementById('db-jb-fail').textContent = failed;

      // 规范化 URL
      const topicUrl = normalizeUrl(rawUrl);
      if (!topicUrl) {
        failed++;
        addLog(log, 'no', rawUrl, '无法识别讨论链接');
        continue;
      }

      try {
        // 提交举报（举报讨论本身）
        const reportResp = await fetch('https://www.douban.com/misc/audit_report', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            resp_type: 'c_dict',
            reason: String(reason.id),
            url: topicUrl,
            ck: ck,
          }),
        });

        const data = await reportResp.json().catch(() => ({ raw: '' }));
        const success = reportResp.status === 200 && data.result !== 'error' && !data.error;

        if (success) {
          done++;
          addLog(log, 'ok', topicUrl, 'OK');
        } else {
          failed++;
          const err = data.error || data.message || JSON.stringify(data).slice(0, 100);
          addLog(log, 'no', topicUrl, err);
        }
      } catch (e) {
        failed++;
        addLog(log, 'no', topicUrl || rawUrl, String(e).slice(0, 80));
      }

      // 限速
      if (delay > 0 && i < urls.length - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // 最终进度
    document.getElementById('db-jb-pfill').style.width = '100%';
    document.getElementById('db-jb-pfill').textContent = '100%';
    document.getElementById('db-jb-done').textContent = done;
    document.getElementById('db-jb-fail').textContent = failed;
    document.getElementById('db-jb-start').disabled = false;
    document.getElementById('db-jb-stop').disabled = true;
  };

  document.getElementById('db-jb-stop').onclick = function () {
    stopped = true;
    this.disabled = true;
  };

  function addLog(log, cls, url, detail) {
    const div = document.createElement('div');
    div.className = 'le ' + cls;
    div.innerHTML = `<span class="icon">${cls === 'ok' ? '✓' : '✗'}</span><span class="url">${url}</span><span class="detail">${detail}</span>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  checkReady();
})();
