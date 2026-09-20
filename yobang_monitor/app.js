const API_BASE = 'https://yobang.tencentmusic.com/unichartsapi/v1/songs';
const STORAGE_KEY = 'yobang-monitor-v1';
const GIST_ID = 'b153fed7b323ef2c10c230f12bd67142';
const GIST_USER = 'if-wannable';
const CONFIG_FILENAME = 'yobang-monitor-config.json';
const MIN_PX_PER_SNAP = 48;

const DIM_COLORS = ['#167447', '#2c6f99', '#a97619', '#c9553d', '#5b6abf'];
const UNI_COLOR = '#9747b0';
const KEEP_DIMS = ['播放热度', '畅销度', '推荐度'];

const els = {
  idInput: document.getElementById('idInput'),
  loadBtn: document.getElementById('loadBtn'),
  lastSync: document.getElementById('lastSync'),
  refreshBtn: document.getElementById('refreshBtn'),
  exportBtn: document.getElementById('exportBtn'),
  issueList: document.getElementById('issueList'),
  rankBtn: document.getElementById('rankBtn'),
  rankModal: document.getElementById('rankModal'),
  rankList: document.getElementById('rankList'),
  rankClose: document.getElementById('rankClose'),
  rankIssueTitle: document.getElementById('rankIssueTitle'),
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  cards: document.getElementById('cards'),
  trendMode: document.getElementById('trendMode'),
  dayFilter: document.getElementById('dayFilter'),
  trendCanvas: document.getElementById('trendCanvas'),
  thead: document.getElementById('thead'),
  tbody: document.getElementById('tbody'),
  rowCount: document.getElementById('rowCount'),
};

const state = {
  id: '',
  issues: [],
  current: null,
  selected: null,
  selectedDay: null,
  snaps: [],
  trendMode: 'score',
};

const tooltipEl = document.createElement('div');
tooltipEl.className = 'trend-tooltip';
document.body.appendChild(tooltipEl);

let _trendSnaps = [];
let _trendXOf = null;

function dimsOf(issue) {
  const all = (issue && issue.classifyIndices) || [];
  return all.filter(d => KEEP_DIMS.includes(d.name));
}

function snapKey() {
  return STORAGE_KEY + ':' + state.id;
}

function normalizeSnap(s) {
  return {
    ...s,
    dims: KEEP_DIMS.map(name => (s.dims || []).find(d => d && d.name === name)).filter(Boolean),
  };
}

function loadSnaps() {
  try {
    const raw = localStorage.getItem(snapKey());
    const data = raw ? JSON.parse(raw).snaps || [] : [];
    state.snaps = data.map(normalizeSnap);
  } catch {
    state.snaps = [];
  }
}

function gistRawUrl(filename) {
  return `https://gist.githubusercontent.com/${GIST_USER}/${GIST_ID}/raw/${filename}?_=${Date.now()}`;
}

async function loadRemoteSnaps() {
  if (!state.id) return;
  try {
    const raw = await (await fetch(gistRawUrl(`yobang-snap-${state.id}.json`), { cache: 'no-store' })).json();
    const remote = (Array.isArray(raw) ? raw : []).map(normalizeSnap);
    if (!remote.length) return;
    const byAt = new Map(state.snaps.map(s => [s.issue + '@' + s.at, s]));
    remote.forEach(s => byAt.set(s.issue + '@' + s.at, s));
    state.snaps = [...byAt.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
    render();
  } catch (e) {
    console.warn('load remote snaps failed:', e);
  }
}

async function loadDefaultSong() {
  try {
    const cfg = await (await fetch(gistRawUrl(CONFIG_FILENAME), { cache: 'no-store' })).json();
    const tracks = (cfg && cfg.enabled && Array.isArray(cfg.tracks)) ? cfg.tracks : [];
    const first = tracks.find(t => t && t.uniId) || null;
    if (first) {
      els.idInput.value = String(first.uniId);
      loadSong(String(first.uniId));
    }
  } catch (e) {
    console.warn('load default song failed:', e);
  }
}

async function fetchData() {
  if (!state.id) {
    els.lastSync.textContent = '请先搜索或输入歌曲 uniId';
    return;
  }
  els.lastSync.textContent = '获取中…';
  try {
    const r = await fetch(`${API_BASE}/${state.id}/charts_detail?_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const json = await r.json();
    if (json.code !== '0') throw new Error(json.msg || '接口错误');
    state.issues = json.data || [];
    state.current = state.issues.find(d => d.dynamic) || state.issues[0] || null;
    if (state.selected) {
      state.selected = state.issues.find(h => h.chartsIssue === state.selected.chartsIssue) || state.current;
    } else {
      state.selected = state.current;
    }
    render();
    const t = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    els.lastSync.textContent = state.current
      ? `同步于 ${t} · 第 ${state.current.chartsIssue} 期`
      : `同步于 ${t}`;
  } catch (e) {
    els.lastSync.textContent = '获取失败：' + e.message;
    els.cards.innerHTML = '<div class="card empty">' + e.message + '</div>';
  }
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function isDynamic(issue) {
  return !!issue.dynamic;
}

function issueSnaps(issue) {
  const id = issue ? issue.chartsIssue : null;
  return state.snaps.filter(s => s.issue === id);
}

function dayKey(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dayLabel(key) {
  const parts = key.split('-').map(Number);
  return parts[1] + '/' + parts[2];
}

function availableDays() {
  return [...new Set(issueSnaps(state.selected || {}).map(s => dayKey(s.at)))].sort();
}

function effectiveDay() {
  const days = availableDays();
  if (!days.length) return null;
  if (!state.selectedDay || !days.includes(state.selectedDay)) return days[days.length - 1];
  return state.selectedDay;
}

function daySnaps() {
  const snaps = issueSnaps(state.selected || {}).sort((a, b) => new Date(a.at) - new Date(b.at));
  const day = effectiveDay();
  return day ? snaps.filter(s => dayKey(s.at) === day) : snaps;
}

function renderDayFilter() {
  const days = availableDays();
  const current = effectiveDay();
  els.dayFilter.innerHTML = days.map(d =>
    `<option value="${d}"${d === current ? ' selected' : ''}>${dayLabel(d)}</option>`
  ).join('');
}

function render() {
  renderCards();
  renderIssues();
  renderDayFilter();
  renderTable();
  drawTrend();
}

function card(label, value, foot, color, small) {
  return `<div class="card" style="border-top:3px solid ${color}">
    <span class="label">${label}</span>
    <strong class="value${small ? ' value-sm' : ''}">${value ?? '—'}</strong>
    <span class="foot">${foot ?? ''}</span>
  </div>`;
}

function deltaOf(snaps, get, i) {
  if (i === 0 || !snaps[i - 1]) return null;
  const cur = get(snaps[i]);
  const prev = get(snaps[i - 1]);
  return parseFloat((cur - prev).toFixed(2));
}

function deltaHtml(v) {
  if (v === null || v === undefined) return '';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  const sign = v > 0 ? '+' : '';
  return `<span class="delta ${cls}">${sign}${v.toFixed(2)}</span>`;
}

function deltaParenHtml(v) {
  if (v === null || v === undefined) return '';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  const sign = v > 0 ? '+' : '';
  return `<span class="delta ${cls}">(${sign}${v.toFixed(2)})</span>`;
}

function updateRange(d) {
  if (!d.nextUpdateTime) return d.dynamic ? '—' : '已结算';
  const parts = String(d.nextUpdateTime).split(' ');
  const time = parts[parts.length - 1] || '';
  const date = parts[0] || '';
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return String(d.nextUpdateTime);
  const start = (h * 60 + m - 10 + 1440) % 1440;
  const hh = String(Math.floor(start / 60)).padStart(2, '0');
  const mm = String(start % 60).padStart(2, '0');
  const dateShort = date.slice(5).replace('-', '/');
  return `${dateShort} ${hh}:${mm} — ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function renderCards() {
  const d = state.selected;
  if (!d) {
    els.cards.innerHTML = '<div class="card empty">搜索歌曲或输入 uniId 开始监控</div>';
    return;
  }
  const snaps = issueSnaps(d).sort((a, b) => new Date(a.at) - new Date(b.at));
  const dims = dimsOf(d);
  const lastTwo = snaps.slice(-2);
  const getUni = s => s.uniIndex || 0;
  const getDim = di => s => (s.dims[di] ? s.dims[di].index : 0);

  const uniDelta = (lastTwo.length === 2 && d.dynamic) ? deltaOf(lastTwo, getUni, 1) : null;

  const summary = [
    card('当前排名', '#' + d.curRank, '第 ' + d.chartsIssue + ' 期', '#a97619'),
    card('由你指数', d.uniIndex, deltaHtml(uniDelta), UNI_COLOR),
    card('更新时间', updateRange(d), d.dynamic ? '每 10 分钟更新' : '已结算', '#2c6f99', true),
  ];

  const dimCards = dims.map((dim, i) => {
    const dimDelta = (lastTwo.length === 2 && d.dynamic) ? deltaOf(lastTwo, getDim(i), 1) : null;
    return card(dim.name, dim.index, d.dynamic ? deltaHtml(dimDelta) : '已结算', DIM_COLORS[i % DIM_COLORS.length]);
  });

  els.cards.innerHTML = `<div class="summary-row">${summary.join('')}</div>` + (dimCards.length ? `<div class="dim-row">${dimCards.join('')}</div>` : '');
}

function renderIssues() {
  const sel = state.selected && state.selected.chartsIssue;
  els.issueList.innerHTML = state.issues.map(issue => {
    const active = issue.chartsIssue === sel;
    const dot = issue.dynamic ? ' ●' : '';
    return `<div class="issue ${active ? 'active' : ''}" data-issue="${issue.chartsIssue}">
      <div class="issue-top"><strong>${issue.chartsIssue} 期${dot}</strong><span>#${issue.curRank}</span></div>
      <div class="issue-sub">指数 ${issue.uniIndex}</div>
      <div class="issue-dates">${(issue.chartsIssueStartTime || '')} — ${(issue.chartsIssueEndTime || '')}</div>
    </div>`;
  }).join('') || '<div class="issue empty">暂无数据</div>';

  els.issueList.querySelectorAll('[data-issue]').forEach(el => {
    el.addEventListener('click', () => {
      state.selected = state.issues.find(i => i.chartsIssue === el.dataset.issue) || state.current;
      state.selectedDay = null;
      render();
    });
  });
}

function renderTable() {
  const snaps = daySnaps();
  if (!snaps.length) {
    els.thead.innerHTML = '';
    els.tbody.innerHTML = '<tr><td colspan="99">暂无快照，等待 SCF 定时抓取（每 10 分钟）</td></tr>';
    els.rowCount.textContent = '0 条';
    return;
  }
  const dims = snaps[0].dims || [];
  els.thead.innerHTML = '<tr><th>时间</th><th>排名</th><th>由你指数</th>' + dims.map(d => `<th>${d.name}</th>`).join('') + '<th>总分涨幅</th></tr>';
  els.tbody.innerHTML = snaps.map((s, i) => {
    const prev = snaps[i - 1];
    const uniDelta = prev ? parseFloat((s.uniIndex - prev.uniIndex).toFixed(2)) : null;
    const dimCells = s.dims.map((d, di) => {
      const prevDim = prev && prev.dims ? prev.dims[di] : null;
      const dv = prevDim ? parseFloat((d.index - prevDim.index).toFixed(2)) : null;
      return `<td>${d.index}${dv === null ? '' : ' ' + deltaParenHtml(dv)}</td>`;
    }).join('');
    return `<tr>
      <td>${new Date(s.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
      <td>#${s.rank}</td>
      <td>${s.uniIndex}</td>
      ${dimCells}
      <td>${uniDelta === null ? '' : deltaHtml(uniDelta)}</td>
    </tr>`;
  }).join('');
  els.rowCount.textContent = snaps.length + ' 条';
}

function plotSize(canvas, snaps, baseW) {
  const w = Math.max(baseW, snaps.length > 1 ? snaps.length * MIN_PX_PER_SNAP + 90 : baseW);
  const h = 300;
  const ratio = window.devicePixelRatio || 1;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, w, h };
}

function drawSmooth(ctx, pts) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

function drawTrend() {
  const canvas = els.trendCanvas;
  const snaps = daySnaps();
  _trendSnaps = snaps;
  _trendXOf = null;
  const containerW = canvas.parentElement.clientWidth || 900;
  const { ctx, w, h } = plotSize(canvas, snaps, containerW);

  const pad = { top: 24, right: 24, bottom: 46, left: 58 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  ctx.fillStyle = '#f8faf9';
  ctx.fillRect(0, 0, w, h);

  if (!snaps.length) {
    ctx.fillStyle = '#8a9a91';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('暂无快照，等待 SCF 定时抓取（每 10 分钟）', w / 2, h / 2);
    return;
  }

  const isDelta = state.trendMode === 'delta';
  const n = snaps.length;

  let series = [];
  if (n >= 1) {
    const dimCount = (snaps[0].dims || []).length;
    series = [{ name: '总指数', color: UNI_COLOR, values: snaps.map(s => s.uniIndex) }];
    for (let di = 0; di < dimCount; di++) {
      series.push({ name: snaps[0].dims[di].name, color: DIM_COLORS[di % DIM_COLORS.length], values: snaps.map(s => (s.dims && s.dims[di] ? s.dims[di].index : 0)) });
    }
  }
  if (isDelta) {
    series = series.map(sr => ({ ...sr, values: sr.values.map((v, i) => (i === 0 ? 0 : parseFloat((v - sr.values[i - 1]).toFixed(2)))) }));
  }

  let vals = series.flatMap(s => s.values);
  if (!vals.length) vals = [0];
  let min = Math.min(...vals), max = Math.max(...vals);
  if (isDelta) { min = Math.min(min, 0); max = Math.max(max, 0); }
  const range = (max - min) || 1;
  const padV = range * 0.15;
  const yMin = min - padV, yMax = max + padV;

  const xOf = i => pad.left + (n === 1 ? cw / 2 : (cw / (n - 1)) * i);
  const yOf = v => pad.top + ch - ((v - yMin) / (yMax - yMin)) * ch;
  _trendXOf = xOf;

  const step = niceStep(yMax - yMin, 4);
  ctx.font = '11px system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    const y = yOf(v);
    const isZero = Math.abs(v) < 1e-9;
    ctx.strokeStyle = isZero ? 'rgba(22,116,71,0.5)' : '#e2e9e5';
    ctx.setLineDash(isZero ? [5, 3] : []);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isZero ? '#167447' : '#8a9a91';
    const label = isDelta ? (v >= 0 ? '+' : '') + v.toFixed(2) : String(Math.round(v * 10) / 10);
    ctx.fillText(label, pad.left - 8, y);
  }

  series.forEach(sr => {
    const pts = sr.values.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
    ctx.beginPath();
    drawSmooth(ctx, pts);
    ctx.strokeStyle = sr.color;
    ctx.lineWidth = sr.name === '总指数' ? 2.5 : 2;
    ctx.setLineDash(sr.name === '总指数' ? [7, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = sr.color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
  });

  ctx.fillStyle = '#8a9a91';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  snaps.forEach((s, i) => ctx.fillText(fmtTime(s.at), xOf(i), pad.top + ch + 10));

  const latest = snaps[n - 1];
  const legend = series.map(sr => {
    const v = sr.values[n - 1];
    const valueStr = isDelta ? (v >= 0 ? '+' : '') + v.toFixed(2) : String(v);
    let deltaHtml = '';
    if (!isDelta && n >= 2) {
      const d = parseFloat((sr.values[n - 1] - sr.values[n - 2]).toFixed(2));
      const col = d > 0 ? 'var(--green)' : d < 0 ? 'var(--red)' : 'var(--muted)';
      deltaHtml = `<span style="color:${col};margin-left:2px">(${d >= 0 ? '+' : ''}${d.toFixed(2)})</span>`;
    }
    return `<span class="legend"><i style="background:${sr.color}"></i>${sr.name} <b>${valueStr}</b>${deltaHtml}</span>`;
  }).join('');
  const legendEl = document.getElementById('trendLegend');
  if (legendEl) legendEl.innerHTML = `${n} 个快照 &nbsp;·&nbsp; ` + legend;
}

function showTrendTooltip(snap, idx, cx, cy) {
  const isDelta = state.trendMode === 'delta';
  const prev = idx > 0 ? _trendSnaps[idx - 1] : null;
  const dateStr = new Date(snap.at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  const timeStr = fmtTime(snap.at);

  let uniVal = snap.uniIndex;
  let uniDeltaHtml = '';
  if (isDelta) {
    const d = prev ? parseFloat((snap.uniIndex - prev.uniIndex).toFixed(2)) : null;
    uniVal = d === null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(2);
  } else if (prev) {
    const d = parseFloat((snap.uniIndex - prev.uniIndex).toFixed(2));
    const col = d > 0 ? 'var(--green)' : d < 0 ? 'var(--red)' : 'var(--muted)';
    uniDeltaHtml = `<span style="color:${col};margin-left:4px">(${d >= 0 ? '+' : ''}${d.toFixed(2)})</span>`;
  }

  const dimsHtml = (snap.dims || []).map((dim, di) => {
    let v = dim.index;
    let dHtml = '';
    if (isDelta) {
      const prevDim = prev && prev.dims ? prev.dims[di] : null;
      const d = prevDim ? parseFloat((dim.index - prevDim.index).toFixed(2)) : null;
      v = d === null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(2);
    } else if (prev && prev.dims && prev.dims[di]) {
      const d = parseFloat((dim.index - prev.dims[di].index).toFixed(2));
      const col = d > 0 ? 'var(--green)' : d < 0 ? 'var(--red)' : 'var(--muted)';
      dHtml = `<span style="color:${col};margin-left:4px">(${d >= 0 ? '+' : ''}${d.toFixed(2)})</span>`;
    }
    return `<div class="tt-row"><i style="background:${DIM_COLORS[di % DIM_COLORS.length]}"></i><span>${dim.name}</span><b>${v}</b>${dHtml}</div>`;
  }).join('');

  tooltipEl.innerHTML = `
    <div class="tt-title">${dateStr} ${timeStr}</div>
    <div class="tt-rank">排名 #${snap.rank} · 指数 <b>${uniVal}</b>${uniDeltaHtml}</div>
    ${dimsHtml}`;
  tooltipEl.style.display = 'block';
  const tw = tooltipEl.offsetWidth;
  const th = tooltipEl.offsetHeight;
  let x = cx + 14, y = cy + 14;
  if (x + tw > window.innerWidth) x = cx - tw - 10;
  if (y + th > window.innerHeight) y = cy - th - 10;
  tooltipEl.style.left = Math.max(4, x) + 'px';
  tooltipEl.style.top = Math.max(4, y) + 'px';
}

els.trendCanvas.addEventListener('mousemove', e => {
  if (!_trendXOf || !_trendSnaps.length) return;
  const rect = els.trendCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  let nearest = 0, minDist = Infinity;
  _trendSnaps.forEach((_, i) => {
    const d = Math.abs(_trendXOf(i) - mx);
    if (d < minDist) { minDist = d; nearest = i; }
  });
  showTrendTooltip(_trendSnaps[nearest], nearest, e.clientX, e.clientY);
});

els.trendCanvas.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });

function niceStep(range, count) {
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const n = raw / mag;
  const f = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return f * mag;
}

function loadSong(input) {
  let id = String(input).trim();
  const m = id.match(/[?&]uniId=(\d+)/);
  if (m) id = m[1];
  if (!/^\d+$/.test(id)) return;
  state.id = id;
  state.issues = [];
  state.current = null;
  state.selected = null;
  state.selectedDay = null;
  loadSnaps();
  render();
  fetchData();
  loadRemoteSnaps();
}

let searchTimer = null;

function hideSearch() {
  els.searchResults.style.display = 'none';
  els.searchResults.innerHTML = '';
}

function renderSearchResults(list) {
  if (!list.length) { hideSearch(); return; }
  els.searchResults.innerHTML = list.slice(0, 8).map(s => `
    <div class="sr-item" data-id="${s.uniTrackId}">
      <span class="sr-name">${s.trackName}</span>
      <span class="sr-singer">${s.singerNames || ''}</span>
    </div>`).join('');
  els.searchResults.style.display = 'block';
  els.searchResults.querySelectorAll('.sr-item').forEach(el => {
    el.addEventListener('click', () => {
      els.idInput.value = el.dataset.id;
      els.searchInput.value = '';
      hideSearch();
      loadSong(el.dataset.id);
    });
  });
}

async function searchSong(keyword) {
  try {
    const r = await fetch(`${API_BASE}/search?keyword=${encodeURIComponent(keyword)}&source=2&pageNo=0&pageSize=20`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const json = await r.json();
    if (json.code !== '0') throw new Error(json.msg || '搜索失败');
    renderSearchResults((json.data && json.data.content) || []);
  } catch {
    hideSearch();
  }
}

function exportCSV() {
  const snaps = issueSnaps(state.selected || {}).sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!snaps.length) return;
  const dims = snaps[0].dims || [];
  const header = ['时间', '排名', '由你指数', ...dims.map(d => d.name)].join(',');
  const rows = snaps.map(s => [
    new Date(s.at).toLocaleString('zh-CN'),
    s.rank,
    s.uniIndex,
    ...s.dims.map(d => d.index),
  ].join(','));
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `yobang-monitor-${state.id}-${state.selected ? state.selected.chartsIssue : ''}.csv`;
  a.click();
}

async function openRank() {
  els.rankModal.style.display = 'flex';
  els.rankList.innerHTML = '<div class="rank-loading">加载中…</div>';
  els.rankIssueTitle.textContent = '';
  try {
    const r = await fetch(`${API_BASE}/charts/dynamic?offset=0&limit=10&platform=website`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const json = await r.json();
    if (json.code !== '0') throw new Error(json.msg || '接口错误');
    const data = json.data || {};
    const list = data.chartsList || [];
    els.rankIssueTitle.textContent = data.issueTitle ? '· ' + data.issueTitle : '';
    renderRankList(list);
  } catch (e) {
    els.rankList.innerHTML = '<div class="rank-loading">加载失败：' + e.message + '</div>';
  }
}

function renderRankList(list) {
  els.rankList.innerHTML = list.slice(0, 10).map(item => {
    const rank = item.rank;
    const rc = item.rankChange || 0;
    const uc = parseFloat(item.uniChange || 0);
    const rankCls = rank <= 3 ? ' top' + rank : '';
    const rcHtml = rc > 0
      ? `<span class="rc up">▲${rc}</span>`
      : rc < 0 ? `<span class="rc down">▼${Math.abs(rc)}</span>` : '<span class="rc flat">—</span>';
    const ucHtml = `<span class="rc ${uc > 0 ? 'up' : uc < 0 ? 'down' : 'flat'}">${uc >= 0 ? '+' : ''}${uc.toFixed(2)}</span>`;
    return `<div class="rank-item" data-id="${item.uniTrackId}">
      <div class="rank-no${rankCls}">${rank}</div>
      <img class="rank-cover" src="${item.coverImages || ''}" alt="">
      <div class="rank-info">
        <div class="rank-name">${item.songName}</div>
        <div class="rank-singer">${item.singerName || ''}</div>
      </div>
      <div class="rank-score">${item.uniIndex}</div>
      <div class="rank-changes"><span title="名次变化">${rcHtml}</span><span title="指数变化">${ucHtml}</span></div>
    </div>`;
  }).join('');

  els.rankList.querySelectorAll('.rank-item').forEach(el => {
    el.addEventListener('click', () => {
      closeRank();
      const id = el.dataset.id;
      if (id) { els.idInput.value = id; loadSong(id); }
    });
  });
}

function closeRank() {
  els.rankModal.style.display = 'none';
}

els.loadBtn.addEventListener('click', () => loadSong(els.idInput.value));
els.idInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadSong(els.idInput.value); });
els.refreshBtn.addEventListener('click', () => { fetchData(); loadRemoteSnaps(); });
els.exportBtn.addEventListener('click', exportCSV);
els.rankBtn.addEventListener('click', openRank);
els.rankClose.addEventListener('click', closeRank);
els.rankModal.addEventListener('click', e => { if (e.target === els.rankModal) closeRank(); });
els.trendMode.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.trendMode = btn.dataset.mode;
  els.trendMode.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
  drawTrend();
});
els.dayFilter.addEventListener('change', () => {
  state.selectedDay = els.dayFilter.value || null;
  render();
});
els.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const kw = els.searchInput.value.trim();
  if (!kw) { hideSearch(); return; }
  searchTimer = setTimeout(() => searchSong(kw), 350);
});
els.searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') hideSearch(); });
document.addEventListener('click', e => {
  if (!e.target.closest('.search-box')) hideSearch();
});

loadSnaps();
render();
loadDefaultSong();