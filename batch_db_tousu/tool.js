/* db批量投诉工具 - bookmarklet 注入脚本
 * 在 douban.com 页面运行，自动获取 cookie，直接调用db API
 * 举报讨论本身（非回复），使用 /misc/audit_report 接口
 */
(async function () {
  // 避免重复注入
  if (document.getElementById('db-jb-tool')) {
    document.getElementById('db-jb-tool').remove();
    return;
  }

  // 检查域名
  var host = location.hostname;
  var isMobileSite = host === 'm.douban.com';
  if (host !== 'www.douban.com' && host !== 'douban.com' && !isMobileSite) {
    alert('请在豆瓣页面（www.douban.com 或 m.douban.com）使用本工具。');
    return;
  }

  // ── 授权校验：书签由待办网页签发（ECDSA P-256 签名 token）──
  // 签名公钥内置于脚本；token 过期或签名不符时不加载工具。
  var AUTH_PUB_JWK = { kty: 'EC', crv: 'P-256',
    x: 'pnDEkQKCtbMoCmKbPRfgl_SjqT2yhd0rL5E75S_2UEc',
    y: 'BacZVdw_iZyhqmDK-TE5K89E8ipMthcw4KedE_IjFaY' };
  var auth = window.__DB_REPORT_AUTH__ || (function () {
    var m = /[#&]dbauth=([A-Za-z0-9_.-]+)/.exec(location.hash || '');
    return m ? decodeURIComponent(m[1]) : '';
  })();
  function b64urlToBuf(str) {
    var b = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var bin = atob(b), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function denyAuth(msg) {
    var box = document.createElement('div');
    box.id = 'db-jb-tool';
    box.style.cssText = 'position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:2147483647;'
      + 'background:#fff;color:#354b3c;border:1px solid #e3ecdf;border-radius:12px;padding:16px 20px;'
      + 'box-shadow:0 12px 36px rgba(60,92,70,.2);font:14px/1.7 -apple-system,"PingFang SC",sans-serif;max-width:92vw;';
    box.innerHTML = '<b style="color:#b7757d">需要授权</b><div style="margin-top:6px;font-size:13px;color:#6f8069">'
      + msg + '</div><div style="margin-top:10px"><button type="button" style="min-height:32px;padding:0 14px;'
      + 'border-radius:8px;border:1px solid #d9e3d4;background:#fff;color:#678261;cursor:pointer">关闭</button></div>';
    box.querySelector('button').onclick = function () { box.remove(); };
    document.body.appendChild(box);
  }
  // 吊销名单（黑名单）：只包含被删除/停用的账号，未列出即可用
  var ROSTER_URL = 'https://if-wannable.github.io/batch_db_tousu/roster.json';
  var ROSTER_MAX_AGE = 10 * 60 * 1000;
  async function serverVerify(payload) {
    // 黑名单机制：只有被删除/停用的账号才会出现在名单里
    var accountKey = payload.h || '';
    if (!accountKey) return '授权信息不完整，请重新获取书签。';
    try {
      var resp = await fetch(ROSTER_URL + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' });
      if (!resp.ok) return ''; // 名单拉不到时不阻断（本地签名已通过）
      var data = await resp.json().catch(function () { return null; });
      if (!data) return '';
      // 兼容两种格式：v2 用 revoked（黑名单），v1 用 roster（白名单）
      if (data.revoked && typeof data.revoked === 'object') {
        if (Object.prototype.hasOwnProperty.call(data.revoked, accountKey)) {
          return '这个账号已被删除或停用，书签已失效。';
        }
      } else if (data.roster && typeof data.roster === 'object') {
        if (!Object.prototype.hasOwnProperty.call(data.roster, accountKey)) {
          return '这个账号已被删除或停用，书签已失效。';
        }
      }
      window.__DB_REPORT_USER__ = payload.u || '';
      return '';
    } catch (e) {
      return ''; // 网络异常时容错
    }
  }
  async function verifyAuth() {
    if (!auth) return '缺少授权信息。请从待办网页重新获取书签。';
    var parts = auth.split('.');
    if (parts.length !== 2) return '授权信息格式不正确。请从待办网页重新获取书签。';
    var body = parts[0], sig = parts[1], payload;
    try { payload = JSON.parse(new TextDecoder().decode(b64urlToBuf(body))); }
    catch (e) { return '授权信息无法解析。请从待办网页重新获取书签。'; }
    if (!payload || !payload.h) return '授权信息不完整。请重新获取书签。';
    if (!window.crypto || !window.crypto.subtle) return '当前浏览器不支持授权校验，请更换浏览器。';
    try {
      var key = await crypto.subtle.importKey('jwk', AUTH_PUB_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      var ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlToBuf(sig), b64urlToBuf(body));
      if (!ok) return '授权校验未通过。请从待办网页重新获取书签。';
    } catch (e) { return '授权校验失败。请重新获取书签。'; }
    return await serverVerify(payload);
  }
  window.__DB_REPORT_AUTH_READY__ = true;

  // ── 闸门：校验未通过则不构建任何界面 ──
  var authError = await verifyAuth();
  if (authError) {
    denyAuth(authError);
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
      {name:"歧视偏见",id:39,type:1},{name:"谩骂攻击",id:40,type:1},{name:"泄露隐私",id:41,type:1},
      {name:"煽动性言论",id:42,type:1},{name:"其他网暴信息",id:74,type:1},{name:"开盒行为",id:77,type:1},{name:"我被网暴",id:78,type:1}
    ]},
    {name:"政治相关", subs:[
      {name:"政治制度",id:20,type:2},{name:"历史虚无",id:21,type:2},{name:"民族仇恨",id:22,type:2},
      {name:"分裂言论",id:23,type:2},{name:"煽动言论",id:24,type:2},{name:"其他政治有害信息",id:25,type:2}
    ]},
    {name:"色情低俗", subs:[
      {name:"低俗内容",id:26,type:3},{name:"色情作品",id:27,type:3},{name:"色情导流",id:28,type:3},
      {name:"色情交易",id:29,type:3},{name:"其他色情低俗信息",id:30,type:3}
    ]},
    {name:"不实信息", subs:[
      {name:"疫情类不实信息",id:31,type:4},{name:"科普类不实信息",id:32,type:4},{name:"社会谣言",id:33,type:4},
      {name:"时政谣言",id:34,type:4},{name:"虚假新闻",id:35,type:4},{name:"其他不实信息",id:36,type:4}
    ]},
    {name:"辱骂攻击", subs:[
      {name:"侮辱谩骂",id:37,type:5},{name:"人身攻击",id:38,type:5}
    ]},
    {name:"饭圈乱象", subs:[
      {name:"涉未成年人",id:43,type:6},{name:"鼓动粉丝攀比",id:44,type:6},{name:"网络水军",id:45,type:6},
      {name:"干扰舆论",id:46,type:6},{name:"造谣爆料",id:47,type:6},{name:"挂人引战",id:48,type:6},{name:"内容来源不明",id:49,type:6}
    ]},
    {name:"违法违规", subs:[
      {name:"涉嫌欺诈",id:50,type:7},{name:"涉枪涉爆",id:51,type:7},{name:"毒品危险品",id:52,type:7},
      {name:"邪教相关",id:53,type:7},{name:"非法交易",id:54,type:7},{name:"恐怖血腥",id:55,type:7},
      {name:"赌博内容",id:56,type:7},{name:"教唆犯罪",id:57,type:7},{name:"其他违法违规信息",id:59,type:7},
      {name:"封建迷信",id:67,type:7},{name:"非法外链",id:75,type:7}
    ]},
    {name:"涉未成年人", subs:[
      {name:"诱导不良行为",id:60,type:8},{name:"欺凌霸凌",id:61,type:8},{name:"儿童邪典",id:62,type:8},
      {name:"儿童色情",id:63,type:8},{name:"泄露隐私",id:64,type:8},{name:"其他涉未成年人有害信息",id:65,type:8}
    ]},
    {name:"自媒体乱象", subs:[
      {name:"冒充机构媒体及特定职业",id:66,type:9},{name:"其他仿冒信息",id:68,type:9}
    ]},
    {name:"涉重大赛事", subs:[
      {name:"违规营销",id:69,type:10},{name:"造谣传谣",id:70,type:10},{name:"未经授权",id:71,type:10},
      {name:"假冒仿冒",id:72,type:10},{name:"其他不良信息",id:73,type:10}
    ]},
    {name:"AI乱象", subs:[
      {name:"AI造假",id:80,type:11},{name:"其他AI违规信息",id:81,type:11}
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
  const USER_REASON_GROUPS = [
    {name:"广告", id:0}, {name:"色情低俗", subs:[["色情低俗",1],["低俗内容",26],["色情作品",27],["色情导流",28],["色情交易",29],["其他色情低俗信息",30]]},
    {name:"违法违规", subs:[["违法违规",2],["涉嫌欺诈",50],["涉枪涉爆",51],["毒品危险品",52],["邪教相关",53],["非法交易",54],["恐怖血腥",55],["赌博内容",56],["教唆犯罪",57],["其他违法违规信息",59],["封建迷信",67],["非法外链",75]]},
    {name:"辱骂攻击", subs:[["辱骂攻击",3],["侮辱谩骂",37],["人身攻击",38]]},
    {name:"垃圾信息", subs:[["垃圾豆邮",4],["垃圾私信",5],["刷屏",12],["折叠回复反馈",76]]},
    {name:"引战", id:7}, {name:"账号与隐私", subs:[["冒充我或他人的豆瓣帐号",8],["泄露他人隐私",9],["泄露隐私",41]]},
    {name:"影响评分公正性", id:10}, {name:"与作品或讨论区主题无关", id:11},
    {name:"政治相关", subs:[["政治相关",13],["政治制度",20],["历史虚无",21],["民族仇恨",22],["分裂言论",23],["煽动言论",24],["其他政治有害信息",25]]},
    {name:"涉未成年人", subs:[["涉未成年人",14],["涉未成年人",43],["诱导不良行为",60],["欺凌霸凌",61],["儿童邪典",62],["儿童色情",63],["泄露隐私",64],["其他涉未成年人有害信息",65]]},
    {name:"饭圈乱象", subs:[["饭圈乱象",15],["鼓动粉丝攀比",44],["网络水军",45],["干扰舆论",46],["造谣爆料",47],["挂人引战",48],["内容来源不明",49]]},
    {name:"网络暴力/网络戾气", subs:[["网络暴力/网络戾气",16],["歧视偏见",39],["谩骂攻击",40],["煽动性言论",42],["其他网暴信息",74],["开盒行为",77],["我被网暴",78]]},
    {name:"涉重大灾难的不当言论", id:17}, {name:"算法推荐类违规信息", id:18},
    {name:"不实信息", subs:[["不实信息",19],["疫情类不实信息",31],["科普类不实信息",32],["社会谣言",33],["时政谣言",34],["虚假新闻",35],["其他不实信息",36]]},
    {name:"自媒体乱象", subs:[["冒充机构媒体及特定职业",66],["其他仿冒信息",68]]},
    {name:"涉重大赛事", subs:[["违规营销",69],["造谣传谣",70],["未经授权",71],["假冒仿冒",72],["其他不良信息",73]]},
    {name:"AI乱象", subs:[["AI造假",80],["其他AI违规信息",81]]}, {name:"未授权下载资源", id:6}, {name:"水军养号", id:79},
  ];

  // ── 提取 ck ──
  function getCk() {
    for (const part of document.cookie.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === 'ck') return v.join('=').trim().replace(/^"|"$/g, '');
    }
    return null;
  }

  // ── 规范化 URL：支持 douban://深链、doubanapp/dispatch、/topic/ID 和 /group/topic/ID ──
  function normalizeUrl(url) {
    // 豆瓣 App 深链 douban://douban.com/... → https://www.douban.com/...
    if (/^douban:\/\//i.test(url)) {
      url = 'https://' + url.replace(/^douban:\/\//i, '').replace(/^douban\.com/i, 'www.douban.com');
    }
    if (/^https?:\/\/douban\.com/i.test(url)) {
      url = url.replace(/^https?:\/\/douban\.com/i, 'https://www.douban.com');
    }
    // 查询参数里的 topic_id / topicId（如 App 举报页 .../report?topic_id=123&type=topic）
    const mid = url.match(/[?&]topic_?id=(\d+)/i);
    if (mid) return 'https://www.douban.com/group/topic/' + mid[1] + '/';
    // doubanapp/dispatch 格式（同样要区分小组讨论与广播页）
    if (url.includes('doubanapp/dispatch')) {
      try {
        const u = new URL(url);
        const uri = u.searchParams.get('uri') || '';
        const gm = uri.match(/\/group\/topic\/(\d+)/);
        if (gm) return 'https://www.douban.com/group/topic/' + gm[1] + '/';
        const bm = uri.match(/\/topic\/(\d+)/);
        if (bm) return 'https://www.douban.com/topic/' + bm[1] + '/';
      } catch (e) { /* fallthrough */ }
    }
    // 直接 topic URL（兼容 /topic/ID 和 /group/topic/ID）
    // 注意：/group/topic/ID/ 是小组讨论，/topic/ID/ 是广播页（不属于任何小组）；
    // 把广播页改写成 /group/topic/ 会打不开，必须保留原形态。
    const gm = url.match(/\/group\/topic\/(\d+)/);
    if (gm) return 'https://www.douban.com/group/topic/' + gm[1] + '/';
    const bm = url.match(/\/topic\/(\d+)/);
    if (bm) return 'https://www.douban.com/topic/' + bm[1] + '/';
    return null;
  }

  async function resolveShortUrl(url) {
    if (!/^https?:\/\/t\.cn\//i.test(url)) return url;
    const response = await fetch('http://127.0.0.1:8767/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) throw new Error('短链接解析服务不可用');
    const data = await response.json();
    if (!data.url) throw new Error(data.error || '短链接无法解析');
    return data.url;
  }

  function normalizeUserUrl(url) {
    if (/^douban:\/\//i.test(url)) {
      url = 'https://' + url.replace(/^douban:\/\//i, '').replace(/^douban\.com/i, 'www.douban.com');
    }
    if (/^https?:\/\/douban\.com/i.test(url)) {
      url = url.replace(/^https?:\/\/douban\.com/i, 'https://www.douban.com');
    }
    const m = url.match(/\/people\/(\d+)/);
    return m ? 'https://www.douban.com/people/' + m[1] + '/' : null;
  }

  // ── 创建 UI ──
  const overlay = document.createElement('div');
  overlay.id = 'db-jb-tool';
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
    #db-jb-tool button { background:#a9caa8; color:#fff; border:none; border-radius:6px; padding:8px 16px; font-size:13px; cursor:pointer;
      -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
    #db-jb-tool button, #db-jb-tool label, #db-jb-tool .tab, #db-jb-tool .mode-option, #db-jb-tool .custom-item {
      -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
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
    #db-jb-tool .le .log-link { color:#5f9066; text-decoration:underline; text-underline-offset:2px; word-break:break-all; }
    #db-jb-tool .le .log-link:hover { color:#3f7047; }
    #db-jb-tool .le .detail { color:#808b83; margin-left:auto; }
    #db-jb-tool .close-btn { background:transparent; border:none; color:#808b83; font-size:20px; cursor:pointer; padding:0 4px; min-width:32px; min-height:32px; box-shadow:none; }
    #db-jb-tool .close-btn:hover { color:#b77f7f; }
    #db-jb-tool .collapse-btn { background:transparent; border:none; color:#718077; font-size:16px; cursor:pointer; padding:0 5px; min-width:28px; box-shadow:none; }
    #db-jb-tool .collapse-btn:hover { background:rgba(169,202,168,.2); }
    #db-jb-tool.collapsed > :not(h2):not(.compact-keep) { display:none !important; }
    #db-jb-tool .compact-keep { display:none; }
    #db-jb-tool.collapsed.compact-active .compact-keep { display:block; }
    #db-jb-tool .compact-status { color:#718077; font-size:11px; padding:2px 2px 8px; }
    #db-jb-tool .hidden { display:none !important; }
    #db-jb-tool .tabs { display:flex; gap:4px; margin:-2px 0 12px; padding-bottom:8px; border-bottom:1px solid rgba(214,228,211,.8); }
    #db-jb-tool .tab { background:transparent; color:#808b83; border:0; border-bottom:2px solid transparent; border-radius:0; padding:5px 10px; box-shadow:none; }
    #db-jb-tool .tab.active { color:#6f9872; border-bottom-color:#a9caa8; font-weight:600; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const ck = getCk();
  overlay.innerHTML = `
    <h2>db批量投诉
      <span>
        <button class="collapse-btn" id="db-jb-collapse" type="button" title="收起面板">−</button>
      <button class="close-btn" onclick="document.getElementById('db-jb-tool').remove()">&times;</button>
      </span>
    </h2>
    <div class="ck-info">${isMobileSite ? (ck ? '手机版 · ck: ' + ck.slice(0, 6) + '…' : '手机版 · 已就绪') : 'ck: ' + (ck || '❌ 未找到 ck，请确保已登录db')}</div>

    <div class="tabs">
      <button class="tab active" type="button" data-tab="topic">讨论投诉</button>
      <button class="tab" type="button" data-tab="user">用户投诉</button>
      <button class="tab" type="button" data-tab="comment">增评</button>
      <button class="tab" type="button" data-tab="cmtreport">评论举报</button>
    </div>

    <div id="db-jb-url-block">
      <textarea id="db-jb-urls" placeholder="每行一个链接（会自动跳过空行和纯文字）"></textarea>
      <div class="row">
        <span id="db-jb-count" style="color:#808b83;font-size:11px"></span>
      </div>
    </div>

    <div id="db-jb-comment-mode" class="hidden">
      <p style="margin:0 0 6px;font-size:11.5px;line-height:1.7;color:#6f8069">
        在当前打开的帖子详情页里，按顺序自动发表评论（每行一条，随机顺序建议自行打乱）。<br>
        需要页面已加载出评论区（先手动展开一次「评论」）。
      </p>
      <textarea id="db-jb-comment-texts" placeholder="每行一条评论内容" style="height:150px">#贺峻霖#
#贺峻霖二代唯一all绿#
#贺峻霖 宙颜一#</textarea>
      <div class="row">
        <label>发送条数</label>
        <input type="number" id="db-jb-comment-total" value="0" min="0" max="999" step="1" class="rate-input">
        <span class="rate-hint" id="db-jb-comment-count"></span>
      </div>
      <div class="row">
        <label>平均间隔</label>
        <input type="number" id="db-jb-comment-gap" value="10" min="2" max="600" step="1" class="rate-input"> 秒
        <label>随机扰动</label>
        <span class="rate-hint">±</span>
        <input type="number" id="db-jb-comment-jitter" value="3" min="0" max="300" step="1" class="rate-input"> 秒
      </div>
      <div class="row">
        <label>每批</label>
        <input type="number" id="db-jb-comment-batch" value="20" min="1" max="200" step="1" class="rate-input"> 条
        <label>暂停</label>
        <input type="number" id="db-jb-comment-rest" value="60" min="0" max="3600" step="5" class="rate-input"> 秒
        <span class="rate-hint">实际间隔 = 平均 ± 随机扰动</span>
      </div>
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
        <label>大类</label>
        <select id="db-jb-user-parent"><option value="">请选择</option></select>
        <label id="db-jb-user-lsub" class="hidden">小类</label>
        <select id="db-jb-user-sub" class="hidden"><option value="">请选择</option></select>
      </div>
      <div class="row hidden" id="db-jb-user-custom">
        <div class="custom-controls">
          <label>大类</label>
          <select id="db-jb-user-custom-parent"><option value="">请选择</option></select>
          <label id="db-jb-user-custom-lsub" class="hidden">小类</label>
          <select id="db-jb-user-custom-sub" class="hidden"><option value="">请选择</option></select>
          <button id="db-jb-user-custom-add" class="secondary" type="button">加入理由</button>
        </div>
        <div class="custom-list" id="db-jb-user-custom-list"></div>
      </div>
    </div>
    <div id="db-jb-cmtreport-mode" class="hidden">
      <p style="margin:0 0 6px;font-size:11.5px;line-height:1.7;color:#6f8069">
        填帖子链接 → 抓取评论 → 翻页勾选 → 选理由提交。<br>
        每页 30 条，可翻页继续；理由按大类 → 小类两级选择。
      </p>
      <div class="row">
        <label>帖子链接</label>
        <input type="text" id="db-jb-cmtreport-url" placeholder="https://www.douban.com/group/topic/123456/" style="flex:1;min-width:120px">
        <button type="button" class="secondary" id="db-jb-cmtreport-fetch">抓取评论</button>
      </div>
      <div class="row">
        <label>关键词</label>
        <input type="text" id="db-jb-cmtreport-kw" placeholder="空格分隔，留空=全部" style="flex:1;min-width:100px">
        <label style="white-space:nowrap"><input type="checkbox" id="db-jb-cmtreport-hot"> 只看最赞</label>
      </div>
      <div class="row" style="gap:6px;align-items:center">
        <button type="button" class="secondary" id="db-jb-cmtreport-prev" disabled>‹ 上一页</button>
        <span id="db-jb-cmtreport-page" style="font-size:11.5px;color:#4f7a52;font-weight:600;white-space:nowrap">第 -/- 页</span>
        <button type="button" class="secondary" id="db-jb-cmtreport-next" disabled>下一页 ›</button>
        <span style="font-size:11px;color:#6f8069;white-space:nowrap;margin-left:2px">跳至</span>
        <input type="number" id="db-jb-cmtreport-jump" min="1" value="1" inputmode="numeric" title="输入页码后回车或点跳转" style="width:52px;padding:3px 4px;border:1px solid #d2ded0;border-radius:6px;font-size:11.5px;text-align:center;color:#4f7a52">
        <button type="button" class="secondary" id="db-jb-cmtreport-go" disabled>跳转</button>
        <span id="db-jb-cmtreport-count" style="color:#808b83;font-size:11px"></span>
      </div>
      <div class="row" style="gap:6px">
        <button type="button" class="secondary" id="db-jb-cmtreport-all">全选本页</button>
        <button type="button" class="secondary" id="db-jb-cmtreport-none">全不选</button>
        <span id="db-jb-cmtreport-selected" style="color:#7f9c82;font-size:11px"></span>
      </div>
      <div id="db-jb-cmtreport-list" style="max-height:200px;overflow-y:auto;border:1px solid #e3ecdf;border-radius:8px;padding:4px;background:#fbfdf9">
        <div style="padding:16px;text-align:center;color:#9aa89a;font-size:11px">还没有抓取评论</div>
      </div>
      <div class="row">
        <label>举报理由</label>
        <select id="db-jb-cmtreport-parent" style="flex:1;min-width:88px"><option value="">大类</option></select>
        <select id="db-jb-cmtreport-sub" style="flex:1;min-width:88px;display:none"><option value="">小类</option></select>
      </div>
    </div>
    <div class="row" id="db-jb-rate-row">
      <label>间隔</label>
      <input type="number" id="db-jb-delay" value="1400" min="200" max="10000" step="100" class="rate-input"> ms
      <label>每批</label>
      <input type="number" id="db-jb-batch-limit" value="20" min="1" max="100" step="1" class="rate-input">
      <span class="rate-hint">条请求</span>
      <label>暂停</label>
      <input type="number" id="db-jb-rest-delay" value="30" min="0" max="3600" step="5" class="rate-input"> 秒
      <span class="rate-hint">间隔 ±200ms 随机抖动，每批 +100ms（最高 1800ms）</span>
    </div>
    <div class="row">
      <button id="db-jb-start" disabled>开始投诉</button>
      <button id="db-jb-pause" class="secondary" disabled>暂停</button>
      <button id="db-jb-resume" class="secondary" disabled>恢复</button>
      <button id="db-jb-stop" class="danger" disabled>停止</button>
    </div>

    <div class="progress-bar compact-keep" id="db-jb-pbar" style="display:none">
      <div class="progress-fill" id="db-jb-pfill"></div>
    </div>
    <div class="stats compact-keep" id="db-jb-stats" style="display:none">
      <span>总计<b id="db-jb-total">0</b></span>
      <span>成功<b class="ok" id="db-jb-done">0</b></span>
      <span>失败<b class="no" id="db-jb-fail">0</b></span>
    </div>
    <div class="compact-status compact-keep" id="db-jb-status">未开始</div>
    <div class="log" id="db-jb-log"></div>
  `;
  document.body.appendChild(overlay);

  let reportTarget = 'topic';
  const userReasons = [];

  // ── 拖动面板（标题栏） ──
  const dragHandle = overlay.querySelector('h2');
  const collapseBtn = document.getElementById('db-jb-collapse');
  let collapsed = false;
  collapseBtn.onclick = function (e) {
    e.stopPropagation();
    collapsed = !collapsed;
    overlay.classList.toggle('collapsed', collapsed);
    this.textContent = collapsed ? '+' : '−';
    this.title = collapsed ? '展开面板' : '收起面板';
  };
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
  const userParent = document.getElementById('db-jb-user-parent');
  const userSub = document.getElementById('db-jb-user-sub');
  const userCustomParent = document.getElementById('db-jb-user-custom-parent');
  const userCustomSub = document.getElementById('db-jb-user-custom-sub');
  for (const r of USER_REASON_GROUPS) {
    const a = document.createElement('option');
    a.value = r.name; a.textContent = r.name;
    userParent.appendChild(a);
    userCustomParent.appendChild(a.cloneNode(true));
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
  function fillUserSub(parent, sub, label) {
    const group = USER_REASON_GROUPS.find(x => x.name === parent.value);
    sub.innerHTML = '<option value="">请选择</option>';
    if (group && group.subs) {
      sub.classList.remove('hidden');
      label.classList.remove('hidden');
      group.subs.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = String(item[1]); opt.textContent = item[0];
        sub.appendChild(opt);
      });
    } else {
      sub.classList.add('hidden');
      label.classList.add('hidden');
    }
  }
  userParent.onchange = function () { fillUserSub(userParent, userSub, document.getElementById('db-jb-user-lsub')); checkReady(); };
  userSub.onchange = checkReady;
  userCustomParent.onchange = function () { fillUserSub(userCustomParent, userCustomSub, document.getElementById('db-jb-user-custom-lsub')); checkReady(); };
  userCustomSub.onchange = checkReady;

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
    const group = USER_REASON_GROUPS.find(x => x.name === userCustomParent.value);
    let reason = null;
    if (group && group.subs) {
      const item = group.subs.find(x => String(x[1]) === userCustomSub.value);
      if (item) reason = { id: item[1], name: group.name + ' / ' + item[0] };
    } else if (group && group.id !== undefined) {
      reason = { id: group.id, name: group.name };
    }
    if (!reason) return;
    userReasons.push(reason);
    renderUserReasons();
    userCustomParent.value = '';
    userCustomSub.innerHTML = '<option value="">请选择</option>';
    userCustomSub.classList.add('hidden');
    document.getElementById('db-jb-user-custom-lsub').classList.add('hidden');
    checkReady();
  };

  function switchTarget(target) {
    reportTarget = target;
    const isUser = target === 'user';
    const isComment = target === 'comment';
    overlay.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === target));
    const isCmtReport = target === 'cmtreport';
    document.getElementById('db-jb-url-block').classList.toggle('hidden', isComment || isCmtReport);
    document.getElementById('db-jb-comment-mode').classList.toggle('hidden', !isComment);
    document.getElementById('db-jb-cmtreport-mode').classList.toggle('hidden', !isCmtReport);
    if (isCmtReport) {
      document.getElementById('db-jb-topic-mode').classList.add('hidden');
      document.getElementById('db-jb-single-reason').classList.add('hidden');
      document.getElementById('db-jb-combo-reason').classList.add('hidden');
      document.getElementById('db-jb-custom-reason').classList.add('hidden');
      document.getElementById('db-jb-user-reason').classList.add('hidden');
      document.getElementById('db-jb-rate-row').classList.remove('hidden');
      document.getElementById('db-jb-start').textContent = '开始举报评论';
      checkReady();
      return;
    }
    document.getElementById('db-jb-cmtreport-mode').classList.add('hidden');
    if (isComment) {
      document.getElementById('db-jb-topic-mode').classList.add('hidden');
      document.getElementById('db-jb-single-reason').classList.add('hidden');
      document.getElementById('db-jb-combo-reason').classList.add('hidden');
      document.getElementById('db-jb-custom-reason').classList.add('hidden');
      document.getElementById('db-jb-user-reason').classList.add('hidden');
      document.getElementById('db-jb-rate-row').classList.add('hidden');
      document.getElementById('db-jb-start').textContent = '开始增评';
      updateCommentCount();
      checkReady();
      return;
    }
    document.getElementById('db-jb-start').textContent = '开始投诉';
    document.getElementById('db-jb-rate-row').classList.remove('hidden');
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
      let l = line.trim();
      if (!l) continue;
      // 裸域名（www.douban.com/... / m.douban.com/...）自动补协议，避免整行被丢弃
      if (/^(?:www\.|m\.)?douban\.com\//i.test(l)) l = 'https://' + l;
      if (/^douban:\/\//i.test(l)) l = 'https://' + l.replace(/^douban:\/\//i, '');
      const m = l.match(/https?:\/\/[^\s,;"'<>]+/);
      if (m) urls.push(m[0].replace(/[)\]}>，。；、]+$/g, ''));
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
  document.getElementById('db-jb-comment-texts').oninput = function () { updateCommentCount(); checkReady(); };
  // 评论举报：事件绑定
  document.getElementById('db-jb-cmtreport-fetch').onclick = doFetchComments;
  document.getElementById('db-jb-cmtreport-kw').oninput = syncSelectionsFromDom;
  document.getElementById('db-jb-cmtreport-kw').oninput = function () { syncSelectionsFromDom(); renderCommentList(); };
  document.getElementById('db-jb-cmtreport-hot').onchange = function () { syncSelectionsFromDom(); renderCommentList(); };
  document.getElementById('db-jb-cmtreport-prev').onclick = function () { gotoCommentPage(commentCache.page - 1); };
  document.getElementById('db-jb-cmtreport-next').onclick = function () { gotoCommentPage(commentCache.page + 1); };
  document.getElementById('db-jb-cmtreport-go').onclick = function () { jumpToCommentPage(); };
  document.getElementById('db-jb-cmtreport-jump').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); jumpToCommentPage(); }
  });
  document.getElementById('db-jb-cmtreport-all').onclick = function () {
    document.querySelectorAll('#db-jb-cmtreport-list input[type=checkbox]').forEach(el => {
      el.checked = true;
      commentCache.selected.add(el.dataset.cid);
    });
    updatePageBar(); checkReady();
  };
  document.getElementById('db-jb-cmtreport-none').onclick = function () {
    document.querySelectorAll('#db-jb-cmtreport-list input[type=checkbox]').forEach(el => el.checked = false);
    commentCache.selected.clear();
    updatePageBar(); checkReady();
  };
  document.getElementById('db-jb-cmtreport-list').onchange = function () { syncSelectionsFromDom(); checkReady(); };
  // 「手机举报」链接：点击时不触发整行勾选；微信等内置浏览器无法唤起 App，改为复制网页地址
  document.getElementById('db-jb-cmtreport-list').addEventListener('click', function (ev) {
    const a = ev.target.closest('a.cmt-report-link');
    if (!a) return;   // 电脑端的 cmt-web-link 不拦，走原生 target=_blank
    // 链接在 <label> 内，必须阻止默认行为，否则会顺带切换整行勾选
    ev.preventDefault();
    ev.stopPropagation();
    const inApp = /MicroMessenger|Weixin| QQ\//i.test(navigator.userAgent || '');
    if (inApp) {
      const web = a.dataset.cmtWeb || '';
      try { navigator.clipboard.writeText(web).catch(() => {}); } catch (e) { /* ignore */ }
      alert('当前浏览器无法唤起豆瓣 App，评论链接已复制：\n\n' + web + '\n\n请用系统浏览器打开后举报。');
      return;
    }
    // 普通手机/电脑浏览器：直接打开深链；打不开时用户可长按复制
    window.location.href = a.getAttribute('href');
  }, true);
  // 理由：大类 → 小类 两级
  (function fillCommentReasons() {
    const parent = document.getElementById('db-jb-cmtreport-parent');
    const sub = document.getElementById('db-jb-cmtreport-sub');
    parent.innerHTML = '<option value="">大类</option>' +
      REASONS.map((r, i) => `<option value="${i}">${escapeHtml(r.name)}</option>`).join('');
    parent.onchange = function () {
      const idx = this.value;
      if (idx === '') {
        sub.style.display = 'none';
        sub.innerHTML = '<option value="">小类</option>';
      } else {
        const r = REASONS[Number(idx)];
        if (r && r.subs && r.subs.length) {
          sub.style.display = '';
          sub.innerHTML = '<option value="">小类</option>' +
            r.subs.map((s, j) => `<option value="${j}">${escapeHtml(s.name)}</option>`).join('');
        } else {
          sub.style.display = 'none';
          sub.innerHTML = '<option value="">小类</option>';
        }
      }
      checkReady();
    };
    sub.onchange = checkReady;
  })();
  /** 读取评论举报选中的理由 { id, name, type } */
  function getCommentReason() {
    const parent = document.getElementById('db-jb-cmtreport-parent');
    const sub = document.getElementById('db-jb-cmtreport-sub');
    const idx = parent.value;
    if (idx === '') return null;
    const r = REASONS[Number(idx)];
    if (!r) return null;
    if (r.subs && r.subs.length) {
      if (sub.style.display !== 'none') {
        if (sub.value === '') return null;
        const s = r.subs[Number(sub.value)];
        if (!s) return null;
        return { id: s.id, name: r.name + ' / ' + s.name, type: s.type, reason: s.name };
      }
      return null;
    }
    return { id: r.id, name: r.name, type: r.id, reason: r.name };
  }
  document.getElementById('db-jb-comment-total').oninput = updateCommentCount;

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
      const group = USER_REASON_GROUPS.find(x => x.name === userParent.value);
      let reason = null;
      if (group && group.subs) {
        const item = group.subs.find(x => String(x[1]) === userSub.value);
        if (item) reason = { id: item[1], name: group.name + ' / ' + item[0] };
      } else if (group && group.id !== undefined) {
        reason = { id: group.id, name: group.name };
      }
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
    if (reportTarget === 'cmtreport') {
      // 不再禁用按钮：原先条件不满足时按钮变灰且点击无提示，
      // 用户会以为「举报没反应」。改为始终可点，由 runCommentReport 校验并提示。
      document.getElementById('db-jb-start').disabled = false;
      return;
    }
    if (reportTarget === 'comment') {
      // 增评不需要 ck / 链接 / 理由，只要填了内容
      const texts = getCommentTexts();
      document.getElementById('db-jb-start').disabled = texts.length === 0;
      return;
    }
    // 手机版走 rexxar 接口，不依赖 ck；桌面版仍需要 ck
    const needCk = !isMobileSite;
    const ok = (!needCk || ck) && getUrls().length > 0 && getReasons().length > 0;
    document.getElementById('db-jb-start').disabled = !ok;
  }

  function getCommentTexts() {
    return document.getElementById('db-jb-comment-texts').value
      .split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  }
  function updateCommentCount() {
    const n = getCommentTexts().length;
    const el = document.getElementById('db-jb-comment-count');
    if (!el) return;
    if (!n) { el.textContent = '还没有内容'; return; }
    const planned = commentPlan(n);
    el.textContent = planned > n
      ? '文案 ' + n + ' 条 · 本次发 ' + planned + ' 条（不足则循环使用，顺序随机）'
      : '文案 ' + n + ' 条 · 本次发 ' + planned + ' 条（顺序随机）';
  }
  /** 本次发送条数：填了就按填的条数发（文案不够则循环复用），0/空 = 全部文案一次 */
  function commentPlan(available) {
    const el = document.getElementById('db-jb-comment-total');
    const t = el ? parseInt(el.value, 10) : 0;
    if (!t || t <= 0) return available;
    return Math.min(t, 999);
  }
  /** 构造发送队列：先打乱，不够就再打乱一轮接着用 */
  function buildCommentQueue(texts, count) {
    const pool = texts.slice();
    const out = [];
    while (out.length < count) {
      const round = pool.slice();
      for (let i = round.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [round[i], round[j]] = [round[j], round[i]];
      }
      for (const t of round) {
        if (out.length >= count) break;
        out.push(t);
      }
      if (!round.length) break;
    }
    return out;
  }
  /** 实际间隔：平均 ± 随机扰动，最低 1 秒 */
  function commentDelayMs() {
    const gap = Math.max(2, parseInt(document.getElementById('db-jb-comment-gap').value) || 10) * 1000;
    const jitter = Math.max(0, parseInt(document.getElementById('db-jb-comment-jitter').value) || 0) * 1000;
    if (!jitter) return gap;
    const delta = (Math.random() * 2 - 1) * jitter;
    return Math.max(1000, Math.round(gap + delta));
  }

  // ==================== 评论举报 ====================
  const COMMENT_PAGE_SIZE = 30;
  let commentCache = {
    url: '', topicId: '', groupId: '',
    allItems: [],
    hotIds: new Set(),
    page: 0,
    total: 0,
    selected: new Set(),
  };

  function selectedCommentIds() {
    return [...commentCache.selected];
  }

  function normalizeTopicUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return '';
    if (/^(?:www\.|m\.)?douban\.com\//i.test(u)) u = 'https://' + u;
    if (/doubanapp\/dispatch/i.test(u)) {
      const dm = /[?&]uri=([^&]+)/i.exec(u);
      if (dm) {
        try {
          const inner = decodeURIComponent(dm[1]);
          u = /^https?:/i.test(inner) ? inner : 'https://www.douban.com' + (inner.charAt(0) === '/' ? inner : '/' + inner);
        } catch (e) {}
      }
    }
    const m = /\/topic\/(\d+)/.exec(u);
    if (m) {
      // 保留小组 ID：/group/{gid}/topic/{tid}/ 比 /group/topic/{tid}/ 信息更全，
      // 少一次 rexxar 请求就能拿到 groupId。
      const g = /\/group\/(\d+)\/topic\//.exec(u);
      return g
        ? `https://www.douban.com/group/${g[1]}/topic/${m[1]}/`
        : `https://www.douban.com/group/topic/${m[1]}/`;
    }
    if (/^\d{6,}$/.test(u)) return 'https://www.douban.com/group/topic/' + u + '/';
    return u;
  }

  /** 抓取第 0 页评论 + 解析 groupId / 最赞标记 */
  async function fetchTopicComments(rawUrl) {
    const url = normalizeTopicUrl(rawUrl);
    const m = /\/topic\/(\d+)/.exec(url);
    if (!m) throw new Error('链接格式不正确');
    const topicId = m[1];

    // groupId 优先级：
    //   1) rexxar 话题接口（最可靠，不受网页风控影响）
    //   2) URL 里的 /group/{gid}/topic/
    //   3) 帖子页 HTML（可能被风控返回验证页）
    let groupId = (/\/group\/(\d+)\/topic\//.exec(url) || [])[1] || '';
    const hotIds = new Set();

    if (!groupId) {
      try {
        const rr = await fetch(`https://m.douban.com/rexxar/api/v2/group/topic/${topicId}`, {
          credentials: 'include',
          headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (rr.ok) {
          const j = await rr.json();
          const g = j && j.group;
          if (g && g.id) groupId = String(g.id);
        }
      } catch (e) { /* 继续走 HTML 兜底 */ }
    }

    try {
      const resp = await fetch(url, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (resp.ok) {
        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!groupId) {
          const gl = doc.querySelector('.side-reg .title a, .group-item .pic a');
          if (gl) groupId = (/\/group\/(\d+)/.exec(gl.getAttribute('href') || '') || [])[1] || '';
        }
        if (!groupId) {
          const gm = /group_id["']?\s*[:=]\s*["']?(\d+)/.exec(html);
          if (gm) groupId = gm[1];
        }
        if (!groupId) {
          const gm2 = /\/group\/(\d+)\//.exec(html);
          if (gm2) groupId = gm2[1];
        }
        doc.querySelectorAll('#popular-comments li.comment-item, #popular-comments li.reply-item').forEach(li => {
          const cid = li.getAttribute('data-cid') || li.getAttribute('id') || '';
          if (cid) hotIds.add(String(cid));
        });
      }
    } catch (e) { /* 忽略，评论走接口 */ }

    commentCache = { url, topicId, groupId, allItems: [], hotIds, page: 0, total: 0, selected: new Set() };
    await loadCommentPage(0);
    return commentCache;
  }

  /** 按页加载：start = page * 30，已缓存则直接渲染 */
  async function loadCommentPage(page) {
    const start = page * COMMENT_PAGE_SIZE;
    if (commentCache.allItems.length > start) {
      commentCache.page = page;
      renderCommentList();
      return;
    }
    const resp = await fetch(
      `https://m.douban.com/rexxar/api/v2/group/topic/${commentCache.topicId}/comments?start=${start}&limit=${COMMENT_PAGE_SIZE}`,
      { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }
    );
    if (resp.status === 403) throw new Error('请求过于频繁，请等几秒再试');
    if (!resp.ok) throw new Error('抓取失败（HTTP ' + resp.status + '）');
    const data = await resp.json();
    const list = (data.comments || []).filter(c => !c.is_deleted && !c.is_disabled);
    for (const c of list) {
      const author = c.author || {};
      commentCache.allItems.push({
        cid: String(c.id),
        name: author.name || '匿名',
        content: String(c.text || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        hot: commentCache.hotIds.has(String(c.id)),
        img: !!(c.photos && c.photos.length),
      });
    }
    commentCache.total = Number(data.total) || commentCache.allItems.length;
    commentCache.page = page;
    renderCommentList();
  }

  /** 当前页可见评论（应用关键词 / 最赞过滤） */
  function currentPageItems() {
    const kwEl = document.getElementById('db-jb-cmtreport-kw');
    const hotOnly = document.getElementById('db-jb-cmtreport-hot').checked;
    const words = String(kwEl.value || '').trim().split(/\s+/).filter(Boolean);
    const start = commentCache.page * COMMENT_PAGE_SIZE;
    let list = commentCache.allItems.slice(start, start + COMMENT_PAGE_SIZE);
    if (hotOnly) list = list.filter(x => x.hot);
    if (words.length) list = list.filter(x => words.some(w => x.content.includes(w) || x.name.includes(w)));
    return list;
  }

  function totalPages() {
    const n = Math.max(commentCache.allItems.length, commentCache.total || 0);
    return Math.max(1, Math.ceil(n / COMMENT_PAGE_SIZE));
  }

  /** 本页选中数量（勾选只在当前页生效，selected 里的 cid 都属于本页） */
  function currentPageSelectedCount() {
    const start = commentCache.page * COMMENT_PAGE_SIZE;
    const pageItems = commentCache.allItems.slice(start, start + COMMENT_PAGE_SIZE);
    let onPage = 0;
    for (const it of pageItems) {
      if (commentCache.selected.has(it.cid)) onPage++;
    }
    // 本页被关键词/最赞过滤掉、但仍已勾选的条数
    const visibleIds = new Set(currentPageItems().map(c => c.cid));
    let hidden = 0;
    for (const it of pageItems) {
      if (commentCache.selected.has(it.cid) && !visibleIds.has(it.cid)) hidden++;
    }
    return { onPage, pageTotal: pageItems.length, hidden };
  }

  function updatePageBar() {
    const prev = document.getElementById('db-jb-cmtreport-prev');
    const next = document.getElementById('db-jb-cmtreport-next');
    const label = document.getElementById('db-jb-cmtreport-page');
    const has = commentCache.allItems.length > 0 || commentCache.total > 0;
    const cur = commentCache.page + 1;
    const tp = totalPages();
    if (label) {
      if (!has) label.textContent = '第 -/- 页';
      else {
        const st = currentPageSelectedCount();
        label.textContent = st.onPage
          ? `第 ${cur}/${tp} 页 · 本页已选 ${st.onPage}`
          : `第 ${cur}/${tp} 页`;
      }
    }
    if (prev) prev.disabled = !has || commentCache.page <= 0;
    if (next) next.disabled = !has || commentCache.page + 1 >= tp;

    const jump = document.getElementById('db-jb-cmtreport-jump');
    const go = document.getElementById('db-jb-cmtreport-go');
    if (jump) {
      jump.max = tp || '';
      jump.disabled = !has || tp <= 1;
      // 正在输入时不覆盖用户内容
      if (document.activeElement !== jump) jump.value = has ? cur : '';
    }
    if (go) go.disabled = !has || tp <= 1;

    const sel = document.getElementById('db-jb-cmtreport-selected');
    if (sel) {
      const total = commentCache.selected.size;
      if (!total) {
        sel.textContent = '';
      } else {
        const st = currentPageSelectedCount();
        const parts = [`本页已选 ${total} 条`];
        if (st.hidden > 0) parts.push(`⚠️ 其中 ${st.hidden} 条被过滤隐藏`);
        sel.textContent = parts.join(' ');
      }
    }
  }

  function renderCommentList() {
    const box = document.getElementById('db-jb-cmtreport-list');
    const list = currentPageItems();

    if (!commentCache.allItems.length) {
      box.innerHTML = '<div style="padding:16px;text-align:center;color:#9aa89a;font-size:11px">还没有抓取评论</div>';
    } else if (!list.length) {
      box.innerHTML = '<div style="padding:16px;text-align:center;color:#9aa89a;font-size:11px">本页没有匹配的评论</div>';
    } else {
      box.innerHTML = list.map(c => `
        <label style="display:flex;gap:6px;padding:5px 6px;border-bottom:1px solid #f0f4ed;cursor:pointer;font-size:11.5px;line-height:1.5">
          <input type="checkbox" data-cid="${escapeHtml(c.cid)}" ${commentCache.selected.has(c.cid) ? 'checked' : ''} style="margin-top:2px;flex:0 0 auto">
          <span style="flex:1;min-width:0">
            <b style="color:#3f775c">${escapeHtml(c.name)}</b>
            ${c.hot ? '<span style="font-size:9.5px;color:#c07a2a;background:#fff4e5;border:1px solid #f0dcc0;border-radius:99px;padding:0 5px;margin-left:3px">最赞</span>' : ''}
            ${c.img ? '<span style="font-size:9.5px;color:#7f9c82;margin-left:3px">[图]</span>' : ''}
            ${(() => {
              const L = commentReportLinks(c.cid);
              if (!L) return '';
              const mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent || '')
                || (navigator.maxTouchPoints > 0 && window.innerWidth <= 900);
              if (mobile) {
                return `<a href="${escapeHtml(L.deep)}" data-cmt-web="${escapeHtml(L.web)}" class="cmt-report-link" style="font-size:9.5px;color:#5f9066;margin-left:6px;text-decoration:underline" title="在豆瓣 App 打开该评论的举报页">手机举报</a>`;
              }
              // 电脑端：深链打不开，给网页版评论定位链接
              return `<a href="${escapeHtml(L.web)}" target="_blank" rel="noopener" class="cmt-web-link" style="font-size:9.5px;color:#8a968d;margin-left:6px;text-decoration:underline" title="在新标签页打开该评论（豆瓣网页版）">打开评论</a>`;
            })()}
            <br><span style="color:#5f7759">${escapeHtml(c.content)}</span>
          </span>
        </label>`).join('');
    }
    document.getElementById('db-jb-cmtreport-count').textContent =
      commentCache.total ? `共 ${commentCache.total} 条` : (commentCache.allItems.length ? `已载入 ${commentCache.allItems.length} 条` : '');
    updatePageBar();
    checkReady();
  }

  /** 记录勾选状态（跨页保留） */
  function syncSelectionsFromDom() {
    document.querySelectorAll('#db-jb-cmtreport-list input[type=checkbox]').forEach(el => {
      if (el.checked) commentCache.selected.add(el.dataset.cid);
      else commentCache.selected.delete(el.dataset.cid);
    });
    updatePageBar();
  }

  function jumpToCommentPage() {
    const tp = totalPages();
    if (!tp) return;
    const el = document.getElementById('db-jb-cmtreport-jump');
    let n = parseInt(el && el.value, 10);
    if (!Number.isFinite(n)) n = commentCache.page + 1;
    n = Math.max(1, Math.min(tp, n));
    if (el) el.value = n;
    if (n - 1 === commentCache.page) return;
    gotoCommentPage(n - 1);
  }

  async function gotoCommentPage(page) {
    const tp = totalPages();
    if (page < 0 || page >= tp) return;
    // 勾选只在当前页生效：翻页即清空，避免一次跨页举报过多。
    const cleared = commentCache.selected.size;
    commentCache.selected.clear();
    const btns = ['db-jb-cmtreport-prev', 'db-jb-cmtreport-next'].map(id => document.getElementById(id));
    btns.forEach(b => b && (b.disabled = true));
    try {
      await loadCommentPage(page);
      if (cleared > 0) {
        const sel = document.getElementById('db-jb-cmtreport-selected');
        if (sel) sel.textContent = `已切换页码，清空了上一页的 ${cleared} 条勾选`;
      }
    } catch (e) {
      alert(e.message || '翻页失败');
    } finally {
      updatePageBar();
      checkReady();
    }
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /** 单条评论的「手机举报」深链（App 内举报弹窗）+ 网页兜底 */
  function commentReportLinks(cid) {
    const topicId = commentCache.topicId || '';
    const gid = commentCache.groupId || '';
    if (!topicId || !cid) return null;
    // 与豆瓣官方 createGroupReportButton 参数一致：group_id + topic_id + comment_id
    const deep = gid
      ? `douban://douban.com/group/${gid}/report?topic_id=${topicId}&comment_id=${cid}&type=comment`
      : `douban://douban.com/topic/${topicId}/report?topic_id=${topicId}&comment_id=${cid}&type=comment`;
    // 网页兜底：豆瓣 PC 页官方评论举报入口就是这个地址
    const web = `https://www.douban.com/group/topic/${topicId}/?comment_id=${cid}`;
    return { deep, web };
  }

  async function doFetchComments() {
    const btn = document.getElementById('db-jb-cmtreport-fetch');
    const url = document.getElementById('db-jb-cmtreport-url').value.trim();
    if (!url) { alert('请填入帖子链接'); return; }
    btn.disabled = true; btn.textContent = '抓取中…';
    try {
      const data = await fetchTopicComments(url);
      commentCache = data;
      renderCommentList();
    } catch (e) {
      alert(e.message || '抓取失败');
    } finally {
      btn.disabled = false; btn.textContent = '抓取评论';
    }
  }

  /** 从豆瓣错误页里提取可读信息（去掉 CSS/JS/标签） */
  function cleanErrorText(txt, status) {
    const raw = String(txt || '');
    // JSON 错误
    try {
      const j = JSON.parse(raw);
      const m = j.msg || j.error || j.localized_message;
      if (m) return m + (j.code ? ` (${j.code})` : '');
      if (j.r !== undefined) return '接口返回 r=' + JSON.stringify(j.r);
    } catch (e) { /* 非 JSON */ }

    if (status === 403) return '没有访问权限（检查是否登录 / 是否被限制）';
    if (status === 404) return '内容不存在或已删除';

    // HTML 错误页：只取 <p> 或 title，去掉样式脚本
    let s = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<head[\s\S]*?<\/head>/gi, ' ');
    const p = s.match(/<p[^>]*>([\s\S]{0,200}?)<\/p>/i);
    if (p) s = p[1];
    else {
      const t = s.match(/<title[^>]*>([\s\S]{0,120}?)<\/title>/i);
      if (t) s = t[1];
    }
    s = s.replace(/<[^>]+>/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')        // 残留的 CSS 规则
      .replace(/\s+/g, ' ')
      .trim();
    if (!s || s.length < 2) return 'HTTP ' + status;
    return s.slice(0, 90);
  }

  /** 提交评论举报 */
  async function runCommentReport(btn) {
    syncSelectionsFromDom();
    const ids = selectedCommentIds();
    if (!ids.length) {
      alert('还没有勾选评论。\n\n请在下方「评论列表」里勾选要举报的评论（可用「全选本页」）。');
      return;
    }
    const reason = getCommentReason();
    if (!reason) {
      const parent = document.getElementById('db-jb-cmtreport-parent');
      const sub = document.getElementById('db-jb-cmtreport-sub');
      if (!parent.value) {
        alert('还没有选择举报理由。\n\n请在最下方「举报理由」里选择一个大类。');
      } else if (sub && sub.style.display !== 'none' && !sub.value) {
        alert('举报理由还缺少「小类」。\n\n选完大类后，右侧会多出一个小类下拉框，需要再选一个小类。');
      } else {
        alert('举报理由不完整，请重新选择。');
      }
      return;
    }
    // 豆瓣真实接口 /j/group/{gid}/member_report 的 type 取「小类的 type」（不是 id）
    // 例如「辱骂攻击 / 侮辱谩骂」→ type=5（id 是 37，传 id 无效）
    const reasonType = Number(reason.type);
    if (!Number.isFinite(reasonType)) {
      alert('举报理由缺少 type，请重新选择理由。');
      return;
    }
    // reason 字段必须是「理由名称」：有小类用小类名，无小类用大类名
    const reasonText = reason.reason || reason.name;

    const topicId = commentCache.topicId || ((/\/topic\/(\d+)/.exec(commentCache.url) || [])[1] || '');
    if (!topicId) { alert('链接里没有帖子 ID'); return; }
    const groupId = commentCache.groupId || '';
    if (!groupId) {
      alert('没有识别到小组 ID，无法举报。\n\n请确认帖子链接是 /group/topic/数字/ 形式，或刷新页面重试。');
      return;
    }

    const delay = Math.max(200, parseInt(document.getElementById('db-jb-delay').value) || 1400);
    const batchLimit = Math.max(1, parseInt(document.getElementById('db-jb-batch-limit').value) || 20);
    const restDelay = Math.max(0, parseInt(document.getElementById('db-jb-rest-delay').value) || 0) * 1000;

    const st = currentPageSelectedCount();
    const lines = [
      `将举报本页 ${ids.length} 条评论。`,
      `理由：${reason.name}（type ${reasonType}）`,
      `间隔：约 ${delay}ms`,
    ];
    if (st.hidden > 0) {
      lines.push('');
      lines.push(`注意：其中 ${st.hidden} 条被关键词/最赞过滤隐藏，仍然会提交。`);
    }
    lines.push('');
    lines.push('确认继续？');
    if (!confirm(lines.join('\n'))) return;

    stopped = false; paused = false; pauseVersion++; resumeWaiters = [];
    overlay.classList.add('compact-active');
    btn.disabled = true;
    document.getElementById('db-jb-stop').disabled = false;
    document.getElementById('db-jb-pause').disabled = false;
    document.getElementById('db-jb-resume').disabled = true;
    document.getElementById('db-jb-pbar').style.display = 'block';
    document.getElementById('db-jb-stats').style.display = 'flex';
    document.getElementById('db-jb-log').innerHTML = '';
    const log = document.getElementById('db-jb-log');
    document.getElementById('db-jb-total').textContent = ids.length;
    document.getElementById('db-jb-done').textContent = '0';
    document.getElementById('db-jb-fail').textContent = '0';

    let done = 0, failed = 0, reqCount = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        if (stopped) break;
        await waitIfPaused();
        if (stopped) break;

        const cid = ids[i];
        try {
          // 豆瓣真实举报接口（与官方举报弹窗同源）：
          //   POST /j/group/{group_id}/member_report
          //   topic_id / comment_id / type / reason / ck
          // 成功返回 JSON {"r":0}；ck 失效返回 403。
          // 注意：旧的 /misc/audit_report 也返回 200，但不会进入审核队列（用户收不到豆邮），
          // 所以必须用 member_report。
          const resp = await fetch(`https://www.douban.com/j/group/${groupId}/member_report`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'Content-Type': 'application/json;charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'x-csrf-token': ck,
            },
            referrer: 'https://www.douban.com',
            body: JSON.stringify({
              type: reasonType,
              reason: reasonText,
              comment_id: String(cid),
              topic_id: String(topicId),
            }),
          });
          const txt = await resp.text();
          reqCount++;
          let ok = false;
          try {
            const j = JSON.parse(txt);
            ok = j && (j.r === 0 || j.r === '0');
          } catch (e) {
            ok = false;
          }
          if (ok) { done++; addLog(log, 'ok', '', `评论 ${cid} 举报成功`); }
          else {
            failed++;
            let msg;
            if (resp.status === 403) msg = 'ck 已失效，刷新页面后重试';
            else msg = cleanErrorText(txt, resp.status) || ('HTTP ' + resp.status);
            addLog(log, 'no', '', `评论 ${cid} 失败：${msg}`);
          }
        } catch (e) {
          failed++;
          addLog(log, 'no', '', `评论 ${cid} 异常：${String(e).slice(0, 50)}`);
        }

        document.getElementById('db-jb-done').textContent = done;
        document.getElementById('db-jb-fail').textContent = failed;
        const pct = Math.round(((i + 1) / ids.length) * 100);
        document.getElementById('db-jb-pfill').style.width = pct + '%';
        document.getElementById('db-jb-pfill').textContent = pct + '%';
        document.getElementById('db-jb-status').textContent = `运行中：${i + 1}/${ids.length}（成功 ${done}，失败 ${failed}）`;

        // 分批暂停
        if (i < ids.length - 1) {
          if ((i + 1) % batchLimit === 0 && restDelay > 0) {
            addLog(log, 'ok', '', `本批完成，暂停 ${restDelay / 1000} 秒`);
            await sleepWithPause(restDelay);
          } else {
            await sleepWithPause(nextGapMs(delay, reqCount, batchLimit));
          }
        }
      }
    } finally {
      document.getElementById('db-jb-start').disabled = false;
      document.getElementById('db-jb-pause').disabled = true;
      document.getElementById('db-jb-resume').disabled = true;
      document.getElementById('db-jb-stop').disabled = true;
      document.getElementById('db-jb-status').textContent = `已结束：成功 ${done}，失败 ${failed}`;
    }
  }

  /**
   * 增评：在已打开的帖子详情页按顺序发表评论。
   * 参考《豆瓣增评》文案：原生 setter 赋值 + input/change 事件，再点提交按钮。
   */
  async function runCommentMode(btn) {
    const allTexts = getCommentTexts();
    if (!allTexts.length) { alert('请先填写评论内容'); return; }
    const planned = commentPlan(allTexts.length);
    const texts = buildCommentQueue(allTexts, planned);
    const gapSec = Math.max(2, parseInt(document.getElementById('db-jb-comment-gap').value) || 10);
    const jitterSec = Math.max(0, parseInt(document.getElementById('db-jb-comment-jitter').value) || 0);
    const batch = Math.max(1, parseInt(document.getElementById('db-jb-comment-batch').value) || 20);
    const restSec = Math.max(0, parseInt(document.getElementById('db-jb-comment-rest').value) || 0);

    if (!findCommentBox()) {
      const opened = await expandCommentEditor();
      if (!opened) {
        alert('未找到评论框。\n\n诊断信息：\n' + dumpCommentBoxDiag());
        return;
      }
    }
    const batches = Math.ceil(texts.length / batch);
    const reuseNote = planned > allTexts.length ? '（文案 ' + allTexts.length + ' 条循环使用，顺序随机打乱）\n' : '（顺序随机打乱）\n';
    if (!confirm('将自动发表 ' + texts.length + ' 条评论：\n'
      + '· ' + reuseNote
      + '· 平均间隔 ' + gapSec + ' 秒' + (jitterSec ? '（±' + jitterSec + ' 秒随机）' : '') + '\n'
      + '· 每 ' + batch + ' 条暂停 ' + restSec + ' 秒（共 ' + batches + ' 批）\n\n'
      + '请确认这是小号且当前在帖子页，是否继续？')) return;

    stopped = false;
    paused = false;
    pauseVersion++;
    resumeWaiters = [];
    overlay.classList.add('compact-active');
    btn.disabled = true;
    document.getElementById('db-jb-stop').disabled = false;
    document.getElementById('db-jb-pause').disabled = false;
    document.getElementById('db-jb-resume').disabled = true;
    document.getElementById('db-jb-pbar').style.display = 'block';
    document.getElementById('db-jb-stats').style.display = 'flex';
    document.getElementById('db-jb-log').innerHTML = '';
    const log = document.getElementById('db-jb-log');
    document.getElementById('db-jb-total').textContent = texts.length;
    document.getElementById('db-jb-done').textContent = '0';
    document.getElementById('db-jb-fail').textContent = '0';

    let done = 0, failed = 0;
    let lastSent = '';
    try {
      for (let i = 0; i < texts.length; i++) {
        if (stopped) break;
        await waitIfPaused();
        if (stopped) break;

        let box = findCommentBox();
        if (!box) {
          // 发完一条后编辑器可能自动收起，重新点「继续发言」展开
          await expandCommentEditor(2);
          box = findCommentBox();
        }
        if (!box) { addLog(log, 'no', '', '未找到评论框，任务停止'); failed++; break; }
        // 与文档脚本一致：输入框里有残留内容时先判断，避免把别人的草稿发出去
        if (getBoxValue(box).trim()) {
          if (lastSent && getBoxValue(box).trim() === lastSent) {
            setBoxValue(box, '');        // 上一条没清干净，先清空
          } else {
            addLog(log, 'no', '', '评论框有其他内容，请手动清空后重试');
            failed++; break;
          }
        }
        box.focus();
        setBoxValue(box, texts[i]);
        await sleepWithPause(500);
        if (stopped) break;

        // 组内帖子的 ck 是一次性的：每条发送前换新令牌，否则会弹人工验证
        await refreshCkToken();

        const submit = findCommentSubmit();
        if (!submit) { addLog(log, 'no', '', '发送按钮不可用，任务停止'); failed++; break; }
        const legacyBefore = commentItemCount();
        simulateRealClick(submit);
        lastSent = texts[i];

        // 发送后校验：等 3 秒看结果
        await sleepWithPause(3000);
        if (stopped) break;

        // 被要求验证 / 触发风控 → 立刻停下，交给人处理
        const blocked = detectBlockReason();
        if (blocked) {
          addLog(log, 'no', '', '遇到' + blocked + '，任务已暂停。请手动完成验证或刷新页面后重新开始');
          document.getElementById('db-jb-status').textContent = '已暂停：' + blocked;
          failed++;
          break;
        }

        const afterBox = findCommentBox();
        const boxVal = afterBox ? getBoxValue(afterBox).trim() : null;
        const cleared = afterBox && boxVal === '';
        const legacyOk = isLegacyCommentPage() && legacySuccessDetected(legacyBefore);

        if (cleared || legacyOk) {
          // 正常：输入框被清空，或老版页面给出了成功提示 / 新增了评论节点
          if (afterBox && boxVal) setBoxValue(afterBox, '');
          done++;
        } else if (!afterBox) {
          // 新版 UI 发完常把编辑器收起 → 视为成功（下一轮会重新展开）
          done++;
          addLog(log, 'ok', '', '第 ' + (i + 1) + ' 条已发送（编辑器已收起）');
        } else if (afterBox && boxVal === texts[i]) {
          // 没清空且无成功迹象 → 判定失败
          setBoxValue(afterBox, '');
          failed++;
          addLog(log, 'no', '', '疑似未发送成功（输入框未清空）');
          continue;
        } else if (afterBox && boxVal) {
          addLog(log, 'no', '', '输入框出现其他内容，任务停止');
          failed++;
          break;
        } else {
          done++;
        }
        document.getElementById('db-jb-done').textContent = done;
        const pct = Math.round(((i + 1) / texts.length) * 100);
        document.getElementById('db-jb-pfill').style.width = pct + '%';
        document.getElementById('db-jb-pfill').textContent = pct + '%';
        document.getElementById('db-jb-status').textContent = '运行中：已发送 ' + (i + 1) + '/' + texts.length;
        addLog(log, 'ok', '', '第 ' + (i + 1) + ' 条已发送');
        if (i < texts.length - 1) {
          // 每批发完 → 长暂停
          if ((i + 1) % batch === 0) {
            if (restSec > 0) {
              document.getElementById('db-jb-status').textContent = '已发 ' + (i + 1) + ' 条，暂停 ' + restSec + ' 秒（批次休息）';
              addLog(log, 'ok', '', '本批完成，暂停 ' + restSec + ' 秒');
              await sleepWithPause(restSec * 1000);
            }
          } else {
            const waitMs = Math.max(0, commentDelayMs() - 3000);   // 已含发送后 3 秒校验
            document.getElementById('db-jb-status').textContent = '运行中：已发送 ' + (i + 1) + '/' + texts.length
              + '，下一条 ' + ((waitMs + 3000) / 1000).toFixed(1) + ' 秒后';
            if (waitMs > 0) await sleepWithPause(waitMs);
          }
        }
      }
    } catch (err) {
      addLog(log, 'no', '', String(err).slice(0, 120));
    } finally {
      document.getElementById('db-jb-start').disabled = false;
      document.getElementById('db-jb-pause').disabled = true;
      document.getElementById('db-jb-resume').disabled = true;
      document.getElementById('db-jb-stop').disabled = true;
      document.getElementById('db-jb-status').textContent = '已结束：发送 ' + done + ' 条（请核对页面实际数量）';
    }
  }

  /** 新版 / 老版小组页面的评论输入框 */
  /** url 与 base 是否同源（用于安全地设置 fetch referrer） */
  function isSameOrigin(url, base) {
    try { return new URL(url, base).origin === base; } catch (e) { return false; }
  }

  function findCommentBox() {
    const cands = [
      'textarea[name="comment-app-textarea"]',   // 新版（App 风格）
      'textarea#last[name="rv_comment"]',        // 老版（经典小组页）
      '#comment textarea',
      'textarea#comment',
      '.comment-form textarea',
      'textarea.comment_textarea',
      // ── 新版小组帖：富文本 contenteditable 编辑器（占位「继续发言」）──
      '.comment-editor [contenteditable="true"]',
      '.reply-editor [contenteditable="true"]',
      '.comment-form [contenteditable="true"]',
      '[data-testid="comment-editor"] [contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
    ];
    for (const sel of cands) {
      const els = [...document.querySelectorAll(sel)];
      // 从后往前找：页面底部的「你的回复」输入框优先（顶部可能是搜索框）
      for (let i = els.length - 1; i >= 0; i--) {
        const el = els[i];
        if (!el || el.getClientRects().length === 0) continue;
        if (el.closest('.search, #inp-query, form[action*="search"]')) continue;
        if (el.getAttribute('aria-hidden') === 'true') continue;
        return el;
      }
    }
    return null;
  }
  /** 文本框/富文本编辑器统一取值 */
  function getBoxValue(el) {
    if (!el) return '';
    if (typeof el.value === 'string') return el.value;
    return String(el.innerText || el.textContent || '');
  }
  /** 文本框/富文本编辑器统一写值（富文本走 execCommand，保留 React/Vue 状态） */
  function setBoxValue(el, value) {
    if (!el) return;
    if (typeof el.value === 'string') { setNativeValue(el, value); return; }
    el.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      if (!value) {
        document.execCommand('delete', false, null);
      } else {
        document.execCommand('insertText', false, value);
      }
      if (getBoxValue(el).trim() === String(value).trim()) return;
    } catch (e) { /* 继续走兜底 */ }
    // 兜底：直接写文本节点再补发事件
    el.textContent = value;
    try {
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    } catch (e) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  /** 找不到评论框时输出页面结构，便于定位新版 UI */
  function dumpCommentBoxDiag() {
    const lines = [];
    lines.push('地址：' + location.href.slice(0, 120));
    const tas = [...document.querySelectorAll('textarea')];
    lines.push('textarea 数量：' + tas.length);
    tas.slice(0, 5).forEach((el, i) => {
      const r = el.getBoundingClientRect();
      lines.push(`  [${i}] name="${el.name}" id="${el.id}" visible=${el.getClientRects().length > 0} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    const ces = [...document.querySelectorAll('[contenteditable]')];
    lines.push('contenteditable 数量：' + ces.length);
    ces.slice(0, 8).forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const t = (el.textContent || '').trim().slice(0, 30);
      lines.push(`  [${i}] tag=${el.tagName} ce="${el.getAttribute('contenteditable')}" role="${el.getAttribute('role') || ''}" cls="${(el.className || '').toString().slice(0, 40)}" visible=${el.getClientRects().length > 0} ${Math.round(r.width)}x${Math.round(r.height)} text="${t}"`);
    });
    const btns = [...document.querySelectorAll('button, [role="button"], input[type="submit"]')]
      .filter(el => el.getClientRects().length > 0);
    lines.push('可见按钮数量：' + btns.length);
    btns.slice(0, 12).forEach((el, i) => {
      const label = (el.getAttribute('aria-label') || el.value || el.textContent || '').trim().slice(0, 20);
      lines.push(`  [${i}] ${el.tagName} type=${el.type || ''} text="${label}"`);
    });
    lines.push('——— 页面文字片段（寻找「继续发言」）———');
    const bodyTxt = (document.body.innerText || '').replace(/\s+/g, ' ');
    const idx = bodyTxt.indexOf('继续发言');
    lines.push(idx >= 0 ? bodyTxt.slice(Math.max(0, idx - 60), idx + 120) : '（页面里没有「继续发言」四个字）');
    return lines.join('\n');
  }
  /** 组内帖子：ck 令牌一次性，发完必须换新的。不刷新整页，用 fetch 拉最新 ck 写回表单 */
  async function refreshCkToken() {
    const inputs = [...document.querySelectorAll('input[name="ck"]')];
    if (!inputs.length) return true;            // 新版 UI 没有 ck 字段，跳过
    try {
      const resp = await fetch(location.href.split('#')[0], {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!resp.ok) return false;
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const fresh = doc.querySelector('input[name="ck"]');
      const token = fresh && fresh.getAttribute('value');
      if (!token) return false;
      inputs.forEach(el => { el.value = token; });
      return true;
    } catch (e) {
      return false;
    }
  }
  /** 检测是否被要求验证 / 触发风控 */
  function detectBlockReason() {
    const href = location.href;
    if (/\/misc\/sorry/.test(href)) return '触发风控（/misc/sorry）';
    const txt = (document.body.innerText || '').replace(/\s+/g, ' ');
    if (/请输入验证码|安全验证|异常请求|操作过于频繁|账号异常/.test(txt)) return '需要人工验证';
    for (const el of document.querySelectorAll('.js-verify-account, iframe[src*="captcha"]')) {
      if (el.getClientRects().length > 0 && el.tagName !== 'SCRIPT') {
        // 老版页面的 js-verify-account 是发送按钮外壳，data-is-verified=true 表示已通过
        if (el.getAttribute('data-is-verified') === 'True') continue;
        return '需要人工验证';
      }
    }
    return '';
  }
  /** 找「继续发言」这类占位触发器（未展开时的评论入口） */
  function findCommentTriggers() {
    const rx = /^(继续发言|写下你的回复|添加回复|发表回复|说点什么|回应一下|写评论)/;
    const hits = [];
    for (const el of document.querySelectorAll('div, span, a, button, p, section, li')) {
      if (el.getClientRects().length === 0) continue;
      if (el.closest('.topic-list, .paginator, form[action*="search"], #inp-query')) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 30) continue;            // 只要短文本，避免命中外层容器
      if (!rx.test(t)) continue;
      if (el.isContentEditable) continue;            // 已经是可编辑的不用点
      if (el.querySelector('[contenteditable="true"]')) continue;
      hits.push(el);
    }
    // 最深（子元素最少）的优先，通常就是要点的那个
    hits.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
    return hits;
  }
  /** 点击触发器并轮询等待编辑器出现 */
  async function expandCommentEditor(maxRounds = 3) {
    if (findCommentBox()) return true;
    for (let round = 0; round < maxRounds; round++) {
      const triggers = findCommentTriggers();
      if (!triggers.length && round === 0) {
        // 页面可能还没渲染完，等一下再找
        await sleepWithPause(500);
        continue;
      }
      for (const el of triggers.slice(0, 4)) {
        simulateRealClick(el);
        const clickable = el.closest('a, button, [role="button"], [role="textbox"], [tabindex]');
        if (clickable && clickable !== el) simulateRealClick(clickable);
        for (let i = 0; i < 10; i++) {          // 最多等 1.5 秒
          await sleepWithPause(150);
          if (findCommentBox()) return true;
        }
      }
      await sleepWithPause(300);
      if (findCommentBox()) return true;
    }
    return !!findCommentBox();
  }
  function findCommentSubmit() {
    const btns = [...document.querySelectorAll('button.comment-form-btn[type="submit"]')]
      .filter(el => el.getClientRects().length > 0 && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
    if (btns.length === 1) return btns[0];
    // 老版：<input name="submit_btn" type="submit" value="发送">
    const legacy = [...document.querySelectorAll('input[name="submit_btn"][type="submit"], input[type="submit"][value="发送"]')]
      .filter(el => el.getClientRects().length > 0 && !el.disabled);
    if (legacy.length === 1) return legacy[0];
    // 新版小组帖：发送/发布 按钮（文字或 aria-label）
    const textRx = /^(发送|发布|发表|提交|继续发言)$/;
    const cand = [...document.querySelectorAll('button, [role="button"], a.button')].filter(el => {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      if (el.getClientRects().length === 0) return false;
      if (el.closest('.comment-item, .reply-item, .topic-list, .paginator, .search')) return false;
      if (el.type === 'submit' && el.closest('form[name="comment_form"], form[action*="add_comment"]')) return true;
      const label = (el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '').trim();
      return textRx.test(label.trim());
    });
    if (cand.length === 1) return cand[0];
    // 多个候选时：取最靠近评论框的那个（发送按钮通常紧挨编辑器）
    const box = findCommentBox();
    if (cand.length > 1 && box) {
      let best = null, bestDist = Infinity;
      const br = box.getBoundingClientRect();
      for (const el of cand) {
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top - br.bottom) + Math.abs(r.left - br.right) * 0.2;
        if (d < bestDist) { bestDist = d; best = el; }
      }
      if (best) return best;
    }
    return null;
  }
  /** 是否老版页面（用于调整发送后的校验策略） */
  function isLegacyCommentPage() {
    if (document.querySelector('textarea#last[name="rv_comment"]')) return true;
    if (document.querySelector('input[name="submit_btn"][type="submit"]')) return true;
    return false;
  }
  function commentItemCount() {
    return document.querySelectorAll('.comment-item, #comments .comment, .reply-item').length;
  }
  /** 老版发送成功判定：出现成功提示，或评论节点数量增加 */
  function legacySuccessDetected(beforeCount) {
    const t = document.body.innerText || '';
    if (/你的回应已提交|回应已提交|发表成功|评论成功|发送成功/.test(t)) return true;
    return commentItemCount() > beforeCount;
  }
  /**
   * 【核心】模拟真人点击：完整鼠标事件序列
   *
   * 豆瓣前端用的是 React/Vue，它们的合成事件系统依赖完整的原生事件链：
   *   pointerover → mouseover → pointerdown → mousedown → pointerup → mouseup → click
   * 只调 .click() 或 dispatchEvent(new MouseEvent('click')) 经常触发不了，
   * 因为 React 在 document 上做事件委托，需要冒泡的真实事件序列。
   */
  function simulateRealClick(el) {
    if (!el) return false;
    try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2) || 0;
    const y = Math.round(rect.top + rect.height / 2) || 0;
    const base = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x + (window.screenX || 0),
      screenY: y + (window.screenY || 0),
      button: 0,
      buttons: 1,
    };
    const fire = (type, Ctor, extra) => {
      try {
        el.dispatchEvent(new Ctor(type, Object.assign({}, base, extra || {})));
      } catch (e) {
        try { el.dispatchEvent(new MouseEvent(type, Object.assign({}, base, extra || {}))); } catch (e2) {}
      }
    };
    // 移动端需要 pointer 事件；桌面端 pointer + mouse 都发一遍最稳
    if (window.PointerEvent) {
      fire('pointerover', PointerEvent, { pointerType: 'mouse', isPrimary: true });
      fire('pointerenter', PointerEvent, { pointerType: 'mouse', isPrimary: true });
      fire('mouseover', MouseEvent);
      fire('pointerdown', PointerEvent, { pointerType: 'mouse', isPrimary: true });
      fire('mousedown', MouseEvent);
      el.focus && el.focus();
      fire('pointerup', PointerEvent, { pointerType: 'mouse', isPrimary: true });
      fire('mouseup', MouseEvent);
      fire('click', MouseEvent);
    } else {
      fire('mouseover', MouseEvent);
      fire('mousedown', MouseEvent);
      el.focus && el.focus();
      fire('mouseup', MouseEvent);
      fire('click', MouseEvent);
    }
    // 表单提交型按钮（老版豆瓣是 input[type=submit]）：事件链未触发提交时补一次
    try {
      const form = el.form || el.closest('form');
      const isSubmit = (el.type === 'submit') || (el.tagName === 'BUTTON' && el.type === 'submit');
      if (form && isSubmit && typeof form.requestSubmit === 'function') {
        // 只在 click 没被 preventDefault 时兜底；用 setTimeout 让页面先处理
        // 注意：豆瓣的 onsubmit 会 return false，requestSubmit 会被它拦下，是安全的
      }
    } catch (e) {}
    return true;
  }

  /** 绕过框架受控组件：原生 setter 赋值再触发事件 */
  function setNativeValue(el, value) {
    try {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
    } catch (e) { el.value = value; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── 批量处理 ──
  let stopped = false;
  let paused = false;
  let pauseVersion = 0;
  let resumeWaiters = [];

  function waitIfPaused() {
    if (!paused) return Promise.resolve();
    return new Promise((resolve) => resumeWaiters.push(resolve));
  }

  function waitUntilDeadline(deadline) {
    return new Promise((resolve) => {
      let timer = null;
      const version = pauseVersion;
      function cleanup() {
        if (timer) clearTimeout(timer);
        document.removeEventListener('visibilitychange', check);
        document.removeEventListener('db-jb-pause-change', check);
      }
      function check() {
        if (version !== pauseVersion) {
          cleanup();
          resolve(false);
          return;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          cleanup();
          resolve(true);
          return;
        }
        // 后台页面的定时器可能被节流；回到前台时 visibilitychange 会立即重新检查。
        timer = setTimeout(check, Math.min(remaining, 1000));
      }
      document.addEventListener('visibilitychange', check);
      document.addEventListener('db-jb-pause-change', check);
      check();
    });
  }

  /**
   * 计算下一次请求的等待时间（更接近真人的节奏）
   * - 基础间隔 delay（用户可调）
   * - 批次递增：每过一个批次 +100ms，但最多累加到 +500ms（不会无限增长）
   * - 随机扰动：±200ms 以内
   * - 最低 300ms，最高不超过 15 秒
   */
  function nextGapMs(delay, requestCount, batchLimit) {
    const base = Math.max(200, delay || 1400);
    // 每完成一批 +100ms，最多累计 +500ms（5 批后封顶）
    const batches = Math.floor(Math.max(0, requestCount) / Math.max(1, batchLimit));
    const batchStep = Math.min(500, batches * 100);
    const center = base + batchStep;
    // 随机扰动 ±200ms 以内
    const jitter = (Math.random() * 2 - 1) * 200;
    return Math.max(300, Math.min(15000, Math.round(center + jitter)));
  }

  async function sleepWithPause(ms) {
    let remaining = ms;
    while (remaining > 0) {
      if (stopped) return;              // 停止后立即结束等待
      await waitIfPaused();
      if (stopped) return;
      const started = Date.now();
      const finished = await waitUntilDeadline(started + remaining);
      remaining = Math.max(0, remaining - (Date.now() - started));
      if (!finished) await waitIfPaused();
    }
  }

  function setPauseState(isPaused) {
    paused = isPaused;
    pauseVersion++;
    document.dispatchEvent(new Event('db-jb-pause-change'));
    document.getElementById('db-jb-pause').disabled = isPaused;
    document.getElementById('db-jb-resume').disabled = !isPaused;
    document.getElementById('db-jb-status').textContent = isPaused ? '已暂停：等待恢复' : '运行中';
    if (!isPaused) {
      const waiters = resumeWaiters;
      resumeWaiters = [];
      waiters.forEach(resolve => resolve());
    }
  }

  document.getElementById('db-jb-start').onclick = async function () {
    if (reportTarget === 'cmtreport') { return runCommentReport(this); }
    if (reportTarget === 'comment') { return runCommentMode(this); }
    const urls = getUrls();
    const reasons = getReasons();
    if (!urls.length || !reasons.length) return;

    const delay = parseInt(document.getElementById('db-jb-delay').value) || 1200;
    const batchLimit = Math.max(1, parseInt(document.getElementById('db-jb-batch-limit').value) || 20);
    const restDelay = Math.max(0, parseInt(document.getElementById('db-jb-rest-delay').value) || 0) * 1000;
    const estimatedRequests = urls.length * reasons.length;
    if (estimatedRequests > batchLimit) {
      const proceed = confirm('本次预计提交 ' + estimatedRequests + ' 条举报请求，将按每批 ' + batchLimit + ' 条分批执行，每批暂停 ' + (restDelay / 1000) + ' 秒。\n建议不要一次提交过多，是否继续？');
      if (!proceed) return;
    }
    stopped = false;
    paused = false;
    pauseVersion++;
    resumeWaiters = [];
    overlay.classList.add('compact-active');
    document.getElementById('db-jb-status').textContent = '运行中：准备提交 ' + estimatedRequests + ' 条举报请求';

    this.disabled = true;
    document.getElementById('db-jb-stop').disabled = false;
    document.getElementById('db-jb-pause').disabled = false;
    document.getElementById('db-jb-resume').disabled = true;
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
      document.getElementById('db-jb-status').textContent = '运行中：已完成 ' + requestCount + '/' + estimatedRequests + ' 条请求';

      // 规范化 URL
      let targetUrl;
      try {
        const resolvedUrl = /^https?:\/\/t\.cn\//i.test(rawUrl)
          ? await resolveShortUrl(rawUrl)
          : rawUrl;
        targetUrl = reportTarget === 'user' ? normalizeUserUrl(resolvedUrl) : normalizeUrl(resolvedUrl);
      } catch (resolveError) {
        failed++;
        addLog(log, 'no', rawUrl, '短链接解析失败：请启动本地检测服务');
        continue;
      }
      if (!targetUrl) {
        failed++;
        addLog(log, 'no', rawUrl, '无法识别目标链接');
        continue;
      }

      try {
        let reasonDone = 0;
        let lastError = '';
        for (let j = 0; j < reasons.length; j++) {
          await waitIfPaused();
          if (stopped) break;
          if (requestCount > 0 && requestCount % batchLimit === 0) {
            addLog(log, 'ok', '', '已完成 ' + requestCount + ' 条举报请求，暂停 ' + (restDelay / 1000) + ' 秒后继续');
            document.getElementById('db-jb-status').textContent = '暂停中：已完成 ' + requestCount + '/' + estimatedRequests + ' 条请求';
            if (restDelay > 0) await sleepWithPause(restDelay);
            if (stopped) break;
          }
          // 接口一次接受一个 reason；组合理由按预设顺序逐个提交
          const reportBody = reportTarget === 'user'
            ? new URLSearchParams({
                ck: ck,
                url: targetUrl,
                reason: String(reasons[j].id),
                report_submit: '提交',
              })
            : new URLSearchParams({
                resp_type: 'c_dict',
                reason: String(reasons[j].id),
                url: targetUrl,
                ck: ck,
              });
          let reportResp, responseText, data = {};
          if (isMobileSite) {
            // 手机版豆瓣：rexxar v2 举报接口（参数 uri + reason）
            const topicId = (/\/topic\/(\d+)/.exec(targetUrl) || [])[1] || '';
            const uri = reportTarget === 'user'
              ? targetUrl.replace(/\?.*$/, '')
              : (/\/topic\/\d+/.test(targetUrl)
                  ? targetUrl.replace(/\?.*$/, '')
                  : ('https://www.douban.com/group/topic/' + topicId + '/'));
            reportResp = await fetch('https://m.douban.com/rexxar/api/v2/report', {
              method: 'POST',
              credentials: 'include',
              // referrer 只能用 fetch 选项（Referer 是禁止头，写在 headers 里会被丢弃）。
              // 但 m 站与 www 跨域，referrer 必须同源，否则抛错，所以这里只在同源时设置。
              ...(isSameOrigin(uri, 'https://m.douban.com') ? { referrer: uri } : {}),
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
              body: new URLSearchParams({ uri: uri, reason: String(reasons[j].id) }),
            });
          } else {
            reportResp = await fetch('https://www.douban.com/misc/audit_report', {
              method: 'POST',
              credentials: 'include',
              // 目标是 www.douban.com 时，可用 referrer 模拟「在该帖页面点举报」
              ...(isSameOrigin(targetUrl, 'https://www.douban.com') ? { referrer: targetUrl.replace(/\?.*$/, '') } : {}),
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
              body: reportBody,
            });
          }
          responseText = await reportResp.text();
          try { data = responseText ? JSON.parse(responseText) : {}; } catch (parseError) { data = { raw: responseText }; }
          const success = reportResp.status === 200 && data.result !== 'error' && !data.error && !data.code;
          requestCount++;
          document.getElementById('db-jb-status').textContent = '运行中：已完成 ' + requestCount + '/' + estimatedRequests + ' 条请求';
          if (success) {
            reasonDone++;
          } else {
            const responseSummary = (data.error || data.message || data.raw || '')
              .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
            lastError = 'HTTP ' + reportResp.status + (responseSummary ? '：' + responseSummary : '：举报请求失败');
          }

          // 间隔 = 基础 + 批次递增（封顶 1800ms）+ ±200ms 随机扰动
          const adaptiveDelay = Math.max(300,
            Math.min(delay + Math.floor(requestCount / batchLimit) * 100, 1800)
            + (Math.random() * 2 - 1) * 200
          );
          if (adaptiveDelay > 0 && (j < reasons.length - 1 || i < urls.length - 1)) {
            await sleepWithPause(Math.round(adaptiveDelay));
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
    document.getElementById('db-jb-status').textContent = stopped ? '已停止：完成 ' + requestCount + '/' + estimatedRequests + ' 条请求' : '已完成：成功 ' + done + '，失败 ' + failed;
    document.getElementById('db-jb-start').disabled = false;
    document.getElementById('db-jb-pause').disabled = true;
    document.getElementById('db-jb-resume').disabled = true;
    document.getElementById('db-jb-stop').disabled = true;
    paused = false;
    resumeWaiters.forEach(resolve => resolve());
    resumeWaiters = [];
  };

  document.getElementById('db-jb-pause').onclick = function () {
    if (!document.getElementById('db-jb-start').disabled) return;
    setPauseState(true);
  };

  document.getElementById('db-jb-resume').onclick = function () {
    if (!paused) return;
    setPauseState(false);
  };

  document.getElementById('db-jb-stop').onclick = function () {
    stopped = true;
    paused = false;
    pauseVersion++;                     // 中断当前等待（暂停/间隔）
    resumeWaiters.forEach(resolve => resolve());
    resumeWaiters = [];
    document.getElementById('db-jb-pause').disabled = true;
    document.getElementById('db-jb-resume').disabled = true;
    this.disabled = true;
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }

  function addLog(log, cls, url, detail) {
    const div = document.createElement('div');
    div.className = 'le ' + cls;
    const safeUrl = escapeHtml(url);
    const urlPart = /^https?:\/\//i.test(String(url || ''))
      ? `<a class="log-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`
      : safeUrl;
    div.innerHTML = `<span class="icon">${cls === 'ok' ? '✓' : '✗'}</span><span class="url">${urlPart}</span><span class="detail">${escapeHtml(detail)}</span>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  checkReady();

  // 面板已就绪：自动填入由待办网页通过 URL hash 带过来的链接
  // 必须在面板构建完成之后执行，否则输入框还不存在
  function prefillFromHash() {
    var m = /[#&]dbjt=([^&]+)/.exec(location.hash || '');
    if (!m) return false;
    try {
      var b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var text = decodeURIComponent(escape(atob(b)));
      var ta = document.getElementById('db-jb-urls');
      if (!ta) return false;
      ta.value = text;
      if (typeof ta.oninput === 'function') ta.oninput();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      var panel = document.getElementById('db-jb-tool');
      if (panel) panel.scrollIntoView({ block: 'nearest' });
      // 清掉 hash，避免刷新页面时重复填入
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  }
  var prefilled = prefillFromHash();
  if (prefilled) {
    var statusEl = document.getElementById('db-jb-status');
    if (statusEl) statusEl.textContent = '已自动填入粘贴板上送来的链接，请选择举报理由';
  } else {
    // URL 里没有链接（例如从手机版首页跳转导致 hash 丢失）：尝试读剪贴板自动填入
    autofillFromClipboard();
  }

  async function autofillFromClipboard() {
    var ta = document.getElementById('db-jb-urls');
    if (!ta || ta.value) return;
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    var text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      return; // 未授权读取剪贴板，用户可手动粘贴
    }
    if (!text || !/https?:\/\//.test(text)) return;
    // 只接受像链接清单的内容（每行一个或含多个链接）
    var looksLikeList = /^[\s\S]*https?:\/\/[^\s]+[\s\S]*$/.test(text);
    if (!looksLikeList) return;
    ta.value = text.trim();
    if (typeof ta.oninput === 'function') ta.oninput();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    var statusEl = document.getElementById('db-jb-status');
    if (statusEl) statusEl.textContent = '已从剪贴板自动填入链接，请选择举报理由';
    showToast && showToast('已自动填入剪贴板里的链接');
  }
})();
