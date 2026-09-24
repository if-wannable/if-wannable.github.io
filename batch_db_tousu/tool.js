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
  var isLocalDemo = (host === 'localhost' || host === '127.0.0.1') &&
    new URLSearchParams(location.search).get('demo') === '1';
  if (host !== 'www.douban.com' && host !== 'douban.com' && !isLocalDemo) {
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

  // ── 组合理由 ──
  const COMBO_PRESETS = [
    {name:"小驼组合拳（常用4种【推荐】）", reasons:[
      {name:"辱骂攻击 / 侮辱谩骂", id:37},
      {name:"饭圈乱象 / 挂人引战", id:48},
      {name:"网络暴力/网络戾气 / 谩骂攻击", id:40},
      {name:"涉未成年人 / 诱导不良行为", id:60},
    ]},
    {name:"小兔组合拳（引战3种）", reasons:[
      {name:"引战", id:7},
      {name:"饭圈乱象 / 干扰舆论", id:46},
      {name:"辱骂攻击 / 侮辱谩骂", id:37},
    ]},
    {name:"富贵组合拳（暴力+饭圈3种）", reasons:[
      {name:"网络暴力/网络戾气 / 歧视偏见", id:39},
      {name:"辱骂攻击 / 人身攻击", id:38},
      {name:"饭圈乱象 / 造谣爆料", id:47},
    ]},
  ];

  const USER_REASONS = [
    {name:"广告", id:0}, {name:"色情低俗", id:1}, {name:"违法违规", id:2},
    {name:"辱骂攻击", id:3}, {name:"垃圾豆邮", id:4}, {name:"垃圾私信", id:5},
    {name:"未授权下载资源", id:6}, {name:"引战", id:7},
    {name:"冒充我或他人的豆瓣帐号", id:8}, {name:"泄露他人隐私", id:9},
    {name:"影响评分公正性", id:10}, {name:"与作品或讨论区主题无关", id:11},
    {name:"刷屏", id:12}, {name:"政治相关", id:13}, {name:"涉未成年人", id:14},
    {name:"饭圈乱象", id:15}, {name:"网络暴力/网络戾气", id:16},
    {name:"涉重大灾难的不当言论", id:17}, {name:"算法推荐类违规信息", id:18},
    {name:"不实信息", id:19}, {name:"政治制度", id:20}, {name:"历史虚无", id:21},
    {name:"民族仇恨", id:22}, {name:"分裂言论", id:23}, {name:"煽动言论", id:24},
    {name:"其他政治有害信息", id:25}, {name:"低俗内容", id:26}, {name:"色情作品", id:27},
    {name:"色情导流", id:28}, {name:"色情交易", id:29}, {name:"其他色情低俗信息", id:30},
    {name:"疫情类不实信息", id:31}, {name:"科普类不实信息", id:32}, {name:"社会谣言", id:33},
    {name:"时政谣言", id:34}, {name:"虚假新闻", id:35}, {name:"其他不实信息", id:36},
    {name:"侮辱谩骂", id:37}, {name:"人身攻击", id:38}, {name:"歧视偏见", id:39},
    {name:"谩骂攻击", id:40}, {name:"泄露隐私", id:41}, {name:"煽动性言论", id:42},
    {name:"涉未成年人", id:43}, {name:"鼓动粉丝攀比", id:44}, {name:"网络水军", id:45},
    {name:"干扰舆论", id:46}, {name:"造谣爆料", id:47}, {name:"挂人引战", id:48},
    {name:"内容来源不明", id:49}, {name:"涉嫌欺诈", id:50}, {name:"涉枪涉爆", id:51},
    {name:"毒品危险品", id:52}, {name:"邪教相关", id:53}, {name:"非法交易", id:54},
    {name:"恐怖血腥", id:55}, {name:"赌博内容", id:56}, {name:"教唆犯罪", id:57},
    {name:"其他违法违规信息", id:59}, {name:"诱导不良行为", id:60}, {name:"欺凌霸凌", id:61},
    {name:"儿童邪典", id:62}, {name:"儿童色情", id:63}, {name:"泄露隐私", id:64},
    {name:"其他涉未成年人有害信息", id:65}, {name:"冒充机构媒体及特定职业", id:66},
    {name:"封建迷信", id:67}, {name:"其他仿冒信息", id:68}, {name:"违规营销", id:69},
    {name:"造谣传谣", id:70}, {name:"未经授权", id:71}, {name:"假冒仿冒", id:72},
    {name:"其他不良信息", id:73}, {name:"其他网暴信息", id:74}, {name:"非法外链", id:75},
    {name:"折叠回复反馈", id:76}, {name:"开盒行为", id:77}, {name:"我被网暴", id:78},
    {name:"水军养号", id:79}, {name:"AI造假", id:80}, {name:"其他AI违规信息", id:81},
    {name:"垃圾豆邮", id:82},
  ];

  // ── 提取 ck ──
  function getCk() {
    for (const part of document.cookie.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === 'ck') return v.join('=').trim().replace(/^"|"$/g, '');
    }
    return null;
  }

  // ── 规范化 URL：支持 doubanapp/dispatch、/topic/ID 和 /group/topic/ID ──
  function normalizeUrl(url) {
    // doubanapp/dispatch 格式
    if (url.includes('doubanapp/dispatch')) {
      try {
        const u = new URL(url);
        const uri = u.searchParams.get('uri') || '';
        const m = uri.match(/\/(?:group\/)?topic\/(\d+)/);
        if (m) return 'https://www.douban.com/group/topic/' + m[1] + '/';
      } catch (e) { /* fallthrough */ }
    }
    // 直接 topic URL（兼容 /topic/ID 和 /group/topic/ID）
    const m = url.match(/\/(?:group\/)?topic\/(\d+)/);
    if (m) return 'https://www.douban.com/group/topic/' + m[1] + '/';
    return null;
  }

  function normalizeUserUrl(url) {
    const m = url.match(/\/people\/(\d+)/);
    return m ? 'https://www.douban.com/people/' + m[1] + '/' : null;
  }

  // ── 创建 UI ──
  const overlay = document.createElement('div');
  overlay.id = 'db-jb-tool';
  overlay.style.cssText = [
    'position:fixed', 'top:5px', 'right:5px',
    'width:460px', 'max-width:calc(100vw - 10px)', 'max-height:90vh', 'overflow-y:auto',
    'background:rgba(247,252,245,.92)', 'border:1px solid rgba(255,255,255,.84)', 'border-radius:15px',
    'padding:14px', 'z-index:999999',
    'color:#4a554d', 'font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif', 'font-size:13px',
    'box-shadow:0 5px 18px rgba(70,85,72,0.11)',
  ].join(';');

  const css = `
    @media (max-width:520px){
      #db-jb-tool{left:5px!important;right:5px!important;width:auto!important;max-width:none!important;padding:12px!important}
      #db-jb-tool .row{flex-direction:column;align-items:stretch;gap:4px}
      #db-jb-tool label{margin-top:2px}
      #db-jb-tool select,#db-jb-tool input[type=number]{width:100%!important}
      #db-jb-tool .custom-controls{flex-direction:column;align-items:stretch;gap:4px}
      #db-jb-tool .custom-controls select,#db-jb-tool .custom-controls button{width:100%!important}
      #db-jb-tool .stats{flex-wrap:wrap;gap:10px}
      #db-jb-tool .le{flex-wrap:wrap}
      #db-jb-tool .le .detail{margin-left:0;width:100%;text-align:left}
    }
    #db-jb-tool * { box-sizing:border-box; margin:0; padding:0; }
    #db-jb-tool::before { content:""; display:block; width:38px; height:4px; margin:0 0 10px 2px; border-radius:3px; background:#d4e9d0; }
    #db-jb-tool h2 { font-size:15px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; color:#526257; cursor:move; user-select:none; touch-action:none; }
    #db-jb-tool .ck-info { font-size:11px; color:#808b83; margin-bottom:8px; font-family:monospace; }
    #db-jb-tool textarea { width:100%; min-height:70px; background:rgba(255,255,255,.78); border:1px solid rgba(214,224,211,.9); border-radius:8px; color:#4a554d; padding:8px; font-size:14px; resize:vertical; margin-bottom:8px; }
    #db-jb-tool textarea:focus, #db-jb-tool select:focus { outline:none; border-color:#aabdaa; box-shadow:0 0 0 3px rgba(170,189,170,.18); }
    #db-jb-tool select { background:rgba(255,255,255,.82); border:1px solid rgba(214,224,211,.9); border-radius:8px; color:#4a554d; padding:8px; font-size:13px; }
    #db-jb-tool .row { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
    #db-jb-tool .mode-row { gap:14px; }
    #db-jb-tool .mode-option { color:#7b867e; cursor:pointer; }
    #db-jb-tool .mode-option input { margin-right:4px; accent-color:#9ab99c; }
    #db-jb-tool .combo-preview { width:100%; color:#808b83; background:rgba(255,255,255,.72); border:1px solid rgba(214,228,211,.92); border-left:4px solid #cfe4cb; border-radius:8px; padding:7px 9px; font-size:11px; line-height:1.6; }
    #db-jb-tool .combo-preview b { color:#5d6b61; }
    #db-jb-tool .custom-list { width:100%; background:rgba(255,255,255,.7); border:1px solid rgba(214,228,211,.92); border-radius:8px; padding:7px 9px; }
    #db-jb-tool .custom-list:empty::before { content:"尚未添加理由"; color:#9aa59d; font-size:11px; }
    #db-jb-tool .custom-item { display:flex; align-items:center; gap:6px; padding:3px 0; color:#6f7f73; font-size:11px; }
    #db-jb-tool .custom-item + .custom-item { border-top:1px solid rgba(214,228,211,.7); }
    #db-jb-tool .custom-remove { margin-left:auto; padding:1px 6px; background:transparent; color:#b78a8a; border:1px solid rgba(199,164,164,.5); box-shadow:none; font-size:11px; }
    #db-jb-tool .custom-controls { display:flex; align-items:center; gap:8px; width:100%; flex-wrap:nowrap; }
    #db-jb-tool .custom-controls select { min-width:0; flex:1; }
    #db-jb-tool .rate-input { width:72px; background:rgba(255,255,255,.82); border:1px solid rgba(214,224,211,.9); border-radius:8px; color:#4a554d; padding:4px; font-size:12px; }
    #db-jb-tool .rate-hint { color:#8a968d; font-size:10px; }
    #db-jb-tool label { color:#808b83; font-size:11px; white-space:nowrap; }
    #db-jb-tool button { background:#a9caa8; color:#fff; border:none; border-radius:6px; padding:8px 16px; font-size:13px; cursor:pointer; }
    #db-jb-tool button:hover:not(:disabled) { background:#94b994; }
    #db-jb-tool button:disabled { opacity:0.4; cursor:not-allowed; }
    #db-jb-tool button.danger { background:#c58f8f; }
    #db-jb-tool button.secondary { background:transparent; border:1px solid #d2ded0; color:#718077; }
    #db-jb-tool .progress-bar { width:100%; height:20px; background:rgba(255,255,255,.68); border:1px solid rgba(214,224,211,.9); border-radius:10px; overflow:hidden; margin-bottom:8px; }
    #db-jb-tool .progress-fill { height:100%; background:#a9bfa9; width:0%; transition:width .3s; border-radius:10px; text-align:center; line-height:20px; font-size:11px; color:#fff; font-weight:600; }
    #db-jb-tool .stats { display:flex; gap:16px; font-size:12px; margin-bottom:8px; }
    #db-jb-tool .stats span { color:#808b83; }
    #db-jb-tool .stats b { color:#5d6b61; }
    #db-jb-tool .stats .ok { color:#7f9c82; }
    #db-jb-tool .stats .no { color:#b77f7f; }
    #db-jb-tool .log { max-height:250px; overflow-y:auto; border:1px solid rgba(214,224,211,.9); border-radius:8px; background:rgba(255,255,255,.66); -webkit-overflow-scrolling:touch; }
    #db-jb-tool .log:empty { display:none; }
    #db-jb-tool .le { padding:6px 8px; border-bottom:1px solid #d8ebd3; font-size:11px; display:flex; gap:6px; align-items:baseline; }
    #db-jb-tool .le:last-child { border-bottom:none; }
    #db-jb-tool .le .icon { font-weight:700; flex-shrink:0; }
    #db-jb-tool .le.ok .icon { color:#7f9c82; }
    #db-jb-tool .le.no .icon { color:#b77f7f; }
    #db-jb-tool .le .url { color:#718f75; word-break:break-all; }
    #db-jb-tool .le .detail { color:#808b83; margin-left:auto; }
    #db-jb-tool .close-btn { background:transparent; border:none; color:#808b83; font-size:20px; cursor:pointer; padding:0 4px; min-width:32px; min-height:32px; box-shadow:none; }
    #db-jb-tool .close-btn:hover { color:#b77f7f; }
    #db-jb-tool .hidden { display:none !important; }
    #db-jb-tool .tabs { display:flex; gap:4px; margin:-2px 0 12px; padding-bottom:8px; border-bottom:1px solid rgba(214,228,211,.8); }
    #db-jb-tool .tab { background:transparent; color:#808b83; border:0; border-bottom:2px solid transparent; border-radius:0; padding:5px 10px; box-shadow:none; }
    #db-jb-tool .tab.active { color:#6f9872; border-bottom-color:#a9caa8; font-weight:600; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const ck = isLocalDemo ? 'local-demo-ck' : getCk();
  overlay.innerHTML = `
    <h2>db批量投诉
      <button class="close-btn" onclick="document.getElementById('db-jb-tool').remove()">&times;</button>
    </h2>
    <div class="ck-info">${isLocalDemo ? '本地演示模式：不会发送真实举报请求' : 'ck: ' + (ck || '❌ 未找到 ck，请确保已登录db')}</div>

    <div class="tabs">
      <button class="tab active" type="button" data-tab="topic">讨论投诉</button>
      <button class="tab" type="button" data-tab="user">用户投诉</button>
    </div>

    <textarea id="db-jb-urls" placeholder="每行一个链接（会自动跳过空行和纯文字）"></textarea>
    <div class="row">
      <span id="db-jb-count" style="color:#808b83;font-size:11px"></span>
    </div>

    <div class="row mode-row" id="db-jb-topic-mode">
      <label>举报模式</label>
      <label class="mode-option"><input type="radio" name="db-jb-mode" value="single" checked>单选举报</label>
      <label class="mode-option"><input type="radio" name="db-jb-mode" value="combo">组合举报</label>
      <label class="mode-option"><input type="radio" name="db-jb-mode" value="custom">自定义多选</label>
    </div>
    <div class="row" id="db-jb-single-reason">
      <label>大类</label>
      <select id="db-jb-parent"><option value="">请选择</option></select>
      <label id="db-jb-lsub" class="hidden">小类</label>
      <select id="db-jb-sub" class="hidden"><option value="">请选择</option></select>
    </div>
    <div class="row hidden" id="db-jb-combo-reason">
      <label>组合</label>
      <select id="db-jb-preset"><option value="">请选择组合</option></select>
      <div class="combo-preview" id="db-jb-combo-preview">选择组合后显示具体举报理由</div>
    </div>
    <div class="row hidden" id="db-jb-custom-reason">
      <div class="custom-controls">
        <label>大类</label>
        <select id="db-jb-custom-parent"><option value="">请选择</option></select>
        <label id="db-jb-custom-lsub" class="hidden">小类</label>
        <select id="db-jb-custom-sub" class="hidden"><option value="">请选择</option></select>
        <button id="db-jb-custom-add" class="secondary" type="button">加入理由</button>
      </div>
      <div class="custom-list" id="db-jb-custom-list"></div>
    </div>
    <div class="hidden" id="db-jb-user-reason">
      <div class="row mode-row">
        <label>举报方式</label>
        <label class="mode-option"><input type="radio" name="db-jb-user-mode" value="single" checked>单选</label>
        <label class="mode-option"><input type="radio" name="db-jb-user-mode" value="custom">多选</label>
      </div>
      <div class="row" id="db-jb-user-single">
        <label>理由</label>
        <select id="db-jb-user-select"><option value="">请选择</option></select>
      </div>
      <div class="row hidden" id="db-jb-user-custom">
        <div class="custom-controls">
          <label>理由</label>
          <select id="db-jb-user-custom-select"><option value="">请选择</option></select>
          <button id="db-jb-user-custom-add" class="secondary" type="button">加入理由</button>
        </div>
        <div class="custom-list" id="db-jb-user-custom-list"></div>
      </div>
    </div>
    <div class="row">
      <label>间隔</label>
      <input type="number" id="db-jb-delay" value="800" min="200" max="10000" step="100" class="rate-input"> ms
      <label>每批</label>
      <input type="number" id="db-jb-batch-limit" value="20" min="1" max="100" step="1" class="rate-input">
      <span class="rate-hint">条请求</span>
      <label>暂停</label>
      <input type="number" id="db-jb-rest-delay" value="30" min="0" max="3600" step="5" class="rate-input"> 秒
      <span class="rate-hint">每批后间隔自动递增 200ms，最高 2000ms</span>
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

  let reportTarget = 'topic';
  const userReasons = [];

  // ── 拖动面板（标题栏） ──
  const dragHandle = overlay.querySelector('h2');
  let dragging = false;
  let dragPointerId = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  dragHandle.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const rect = overlay.getBoundingClientRect();
    dragging = true;
    dragPointerId = e.pointerId;
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    overlay.style.right = 'auto';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
  });
  function movePanel(e) {
    if (!dragging || e.pointerId !== dragPointerId) return;
    const maxLeft = Math.max(5, window.innerWidth - overlay.offsetWidth - 5);
    const maxTop = Math.max(5, window.innerHeight - 45);
    const left = Math.min(Math.max(5, e.clientX - dragOffsetX), maxLeft);
    const top = Math.min(Math.max(5, e.clientY - dragOffsetY), maxTop);
    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
  }
  function stopDragging(e) {
    if (e && e.pointerId !== dragPointerId) return;
    dragging = false;
    dragPointerId = null;
  }
  document.addEventListener('pointermove', movePanel);
  document.addEventListener('pointerup', stopDragging);
  document.addEventListener('pointercancel', stopDragging);

  const selPreset = document.getElementById('db-jb-preset');
  const userSelect = document.getElementById('db-jb-user-select');
  const userCustomSelect = document.getElementById('db-jb-user-custom-select');
  for (const r of USER_REASONS) {
    const a = document.createElement('option');
    a.value = String(r.id); a.textContent = r.name;
    userSelect.appendChild(a);
    const b = a.cloneNode(true);
    userCustomSelect.appendChild(b);
  }
  for (const p of COMBO_PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name + '（' + p.reasons.length + '种）';
    selPreset.appendChild(opt);
  }

  function updateReasonMode() {
    const mode = document.querySelector('input[name="db-jb-mode"]:checked').value;
    document.getElementById('db-jb-single-reason').classList.toggle('hidden', mode !== 'single');
    document.getElementById('db-jb-combo-reason').classList.toggle('hidden', mode !== 'combo');
    document.getElementById('db-jb-custom-reason').classList.toggle('hidden', mode !== 'custom');
    if (mode !== 'combo') selPreset.value = '';
    updateComboPreview();
    checkReady();
  }

  function updateComboPreview() {
    const preview = document.getElementById('db-jb-combo-preview');
    if (!preview) return;
    const preset = COMBO_PRESETS.find(x => x.name === selPreset.value);
    preview.innerHTML = preset
      ? '<b>' + preset.name + '：</b>' + preset.reasons.map((r, i) => (i + 1) + '. ' + r.name).join('；')
      : '选择组合后显示具体举报理由';
  }

  document.querySelectorAll('input[name="db-jb-mode"]').forEach((el) => {
    el.onchange = updateReasonMode;
  });
  selPreset.onchange = function () {
    updateComboPreview();
    checkReady();
  };

  function updateUserReasonMode() {
    const mode = document.querySelector('input[name="db-jb-user-mode"]:checked').value;
    document.getElementById('db-jb-user-single').classList.toggle('hidden', mode !== 'single');
    document.getElementById('db-jb-user-custom').classList.toggle('hidden', mode !== 'custom');
    checkReady();
  }
  document.querySelectorAll('input[name="db-jb-user-mode"]').forEach((el) => { el.onchange = updateUserReasonMode; });
  userSelect.onchange = checkReady;
  userCustomSelect.onchange = checkReady;

  function renderUserReasons() {
    const list = document.getElementById('db-jb-user-custom-list');
    list.innerHTML = userReasons.map((r, i) =>
      '<div class="custom-item"><span>' + (i + 1) + '. ' + r.name + '</span>' +
      '<button class="custom-remove" type="button" data-index="' + i + '">删除</button></div>'
    ).join('');
    list.querySelectorAll('.custom-remove').forEach((btn) => {
      btn.onclick = function () { userReasons.splice(Number(this.dataset.index), 1); renderUserReasons(); checkReady(); };
    });
  }
  document.getElementById('db-jb-user-custom-add').onclick = function () {
    const reason = USER_REASONS.find(x => String(x.id) === userCustomSelect.value);
    if (!reason) return;
    userReasons.push(reason);
    renderUserReasons();
    userCustomSelect.value = '';
    checkReady();
  };

  function switchTarget(target) {
    reportTarget = target;
    const isUser = target === 'user';
    overlay.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === target));
    document.getElementById('db-jb-topic-mode').classList.toggle('hidden', isUser);
    document.getElementById('db-jb-single-reason').classList.toggle('hidden', isUser || document.querySelector('input[name="db-jb-mode"]:checked').value !== 'single');
    document.getElementById('db-jb-combo-reason').classList.toggle('hidden', isUser || document.querySelector('input[name="db-jb-mode"]:checked').value !== 'combo');
    document.getElementById('db-jb-custom-reason').classList.toggle('hidden', isUser || document.querySelector('input[name="db-jb-mode"]:checked').value !== 'custom');
    document.getElementById('db-jb-user-reason').classList.toggle('hidden', !isUser);
    document.getElementById('db-jb-urls').placeholder = isUser
      ? '每行一个用户主页链接（会自动跳过空行和纯文字）'
      : '每行一个讨论链接（会自动跳过空行和纯文字）';
    checkReady();
  }
  overlay.querySelectorAll('.tab').forEach((tab) => { tab.onclick = function () { switchTarget(this.dataset.tab); }; });

  // ── 填充理由下拉（两级） ──
  const selP = document.getElementById('db-jb-parent');
  const customReasons = [];
  const customParent = document.getElementById('db-jb-custom-parent');
  const customSub = document.getElementById('db-jb-custom-sub');
  const customLsub = document.getElementById('db-jb-custom-lsub');
  for (const r of REASONS) {
    const opt = document.createElement('option');
    opt.value = r.name;
    opt.textContent = r.name;
    customParent.appendChild(opt);
  }
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

  function fillCustomSub() {
    const r = REASONS.find(x => x.name === customParent.value);
    customSub.innerHTML = '<option value="">请选择</option>';
    if (r && r.subs) {
      customSub.classList.remove('hidden');
      customLsub.classList.remove('hidden');
      for (const s of r.subs) {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = s.name;
        customSub.appendChild(opt);
      }
    } else {
      customSub.classList.add('hidden');
      customLsub.classList.add('hidden');
    }
  }

  function getReasonFrom(parent, sub) {
    const r = REASONS.find(x => x.name === parent.value);
    if (!r) return null;
    if (r.subs) {
      const s = r.subs.find(x => x.name === sub.value);
      return s ? { id: s.id, name: r.name + ' / ' + s.name } : null;
    }
    return { id: r.id, name: r.name };
  }

  function renderCustomReasons() {
    const list = document.getElementById('db-jb-custom-list');
    list.innerHTML = customReasons.map((r, i) =>
      '<div class="custom-item"><span>' + (i + 1) + '. ' + r.name + '</span>' +
      '<button class="custom-remove" type="button" data-index="' + i + '">删除</button></div>'
    ).join('');
    list.querySelectorAll('.custom-remove').forEach((btn) => {
      btn.onclick = function () {
        customReasons.splice(Number(this.dataset.index), 1);
        renderCustomReasons();
        checkReady();
      };
    });
  }

  customParent.onchange = function () { fillCustomSub(); checkReady(); };
  customSub.onchange = checkReady;
  document.getElementById('db-jb-custom-add').onclick = function () {
    const reason = getReasonFrom(customParent, customSub);
    if (!reason) return;
    customReasons.push(reason);
    renderCustomReasons();
    customParent.value = '';
    customSub.innerHTML = '<option value="">请选择</option>';
    customSub.classList.add('hidden');
    customLsub.classList.add('hidden');
    checkReady();
  };

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

  function getReasons() {
    if (reportTarget === 'user') {
      const mode = document.querySelector('input[name="db-jb-user-mode"]:checked').value;
      if (mode === 'custom') return userReasons;
      const reason = USER_REASONS.find(x => String(x.id) === userSelect.value);
      return reason ? [reason] : [];
    }
    const mode = document.querySelector('input[name="db-jb-mode"]:checked').value;
    if (mode === 'combo') {
      const preset = COMBO_PRESETS.find(x => x.name === selPreset.value);
      return preset ? preset.reasons : [];
    }
    if (mode === 'custom') return customReasons;
    const reason = getReason();
    return reason ? [reason] : [];
  }

  function checkReady() {
    const ok = ck && getUrls().length > 0 && getReasons().length > 0;
    document.getElementById('db-jb-start').disabled = !ok;
  }

  // ── 批量处理 ──
  let stopped = false;

  document.getElementById('db-jb-start').onclick = async function () {
    const urls = getUrls();
    const reasons = getReasons();
    if (!urls.length || !reasons.length) return;
    const delay = parseInt(document.getElementById('db-jb-delay').value) || 800;
    const batchLimit = Math.max(1, parseInt(document.getElementById('db-jb-batch-limit').value) || 20);
    const restDelay = Math.max(0, parseInt(document.getElementById('db-jb-rest-delay').value) || 0) * 1000;
    const estimatedRequests = urls.length * reasons.length;
    if (estimatedRequests > batchLimit) {
      const proceed = confirm('本次预计提交 ' + estimatedRequests + ' 条举报请求，将按每批 ' + batchLimit + ' 条分批执行，每批暂停 ' + (restDelay / 1000) + ' 秒。\n建议不要一次提交过多，是否继续？');
      if (!proceed) return;
    }
    stopped = false;

    this.disabled = true;
    document.getElementById('db-jb-stop').disabled = false;
    document.getElementById('db-jb-pbar').style.display = 'block';
    document.getElementById('db-jb-stats').style.display = 'flex';
    document.getElementById('db-jb-log').innerHTML = '';

    let done = 0, failed = 0, requestCount = 0;
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
      const targetUrl = reportTarget === 'user' ? normalizeUserUrl(rawUrl) : normalizeUrl(rawUrl);
      if (!targetUrl) {
        failed++;
        addLog(log, 'no', rawUrl, '无法识别目标链接');
        continue;
      }

      try {
        let reasonDone = 0;
        let lastError = '';
        for (let j = 0; j < reasons.length; j++) {
          if (stopped) break;
          if (requestCount > 0 && requestCount % batchLimit === 0) {
            addLog(log, 'ok', '', '已完成 ' + requestCount + ' 条举报请求，暂停 ' + (restDelay / 1000) + ' 秒后继续');
            if (restDelay > 0) await new Promise(r => setTimeout(r, restDelay));
            if (stopped) break;
          }
          // 接口一次接受一个 reason；组合理由按预设顺序逐个提交
          let data = {};
          let success = false;
          if (isLocalDemo) {
            await new Promise(r => setTimeout(r, 120));
            success = true;
          } else {
            const reportResp = await fetch('https://www.douban.com/misc/audit_report', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                resp_type: 'c_dict',
                reason: String(reasons[j].id),
                url: targetUrl,
                ck: ck,
              }),
            });
            data = await reportResp.json().catch(() => ({ raw: '' }));
            success = reportResp.status === 200 && data.result !== 'error' && !data.error;
          }
          requestCount++;
          if (success) {
            reasonDone++;
          } else {
            lastError = data.error || data.message || JSON.stringify(data).slice(0, 100);
          }

          const adaptiveDelay = Math.min(delay + Math.floor(requestCount / batchLimit) * 200, 2000);
          if (adaptiveDelay > 0 && (j < reasons.length - 1 || i < urls.length - 1)) {
            await new Promise(r => setTimeout(r, adaptiveDelay));
          }
        }

        if (reasonDone === reasons.length) {
          done++;
          addLog(log, 'ok', targetUrl, reasons.length > 1 ? 'OK ' + reasonDone + '/' + reasons.length : 'OK');
        } else {
          failed++;
          addLog(log, 'no', targetUrl, '成功 ' + reasonDone + '/' + reasons.length + (lastError ? '：' + lastError : ''));
        }
      } catch (e) {
        failed++;
        addLog(log, 'no', targetUrl || rawUrl, String(e).slice(0, 80));
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
