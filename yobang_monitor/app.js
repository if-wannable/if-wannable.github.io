const API_BASE = 'https://yobang.tencentmusic.com/unichartsapi/v1/songs';
const STORAGE_KEY = 'yobang-monitor-v1';
const GIST_ID = 'b153fed7b323ef2c10c230f12bd67142';
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
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  cards: document.getElementById('cards'),
  trendMode: document.getElementById('trendMode'),
  trendCanvas: document.getElementById('trendCanvas'),
  growthCanvas: document.getElementById('growthCanvas'),
  thead: document.getElementById('thead'),
  tbody: document.getElementById('tbody'),
  rowCount: document.getElementById('rowCount'),
};

const state = {
  id: '',
  issues: [],
  current: null,
  selected: null,
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

async function loadRemoteSnaps() {
  if (!state.id) return;
  try {
    const g = await (await fetch(`https://api.github.com/gists/${GIST_ID}?_=${Date.now()}`, { cache: 'no-store' })).json();
    const f = g.files && g.files[`yobang-snap-${state.id}.json`];
    if (!f || !f.raw_url) return;
    const raw = await (await fetch(f.raw_url, { cache: 'no-store' })).json();
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

function render() {
  renderCards();
  renderIssues();
  renderTable();
  drawTrend();
  drawGrowth();
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
      render();
    });
  });
}

function renderTable() {
  const snaps = issueSnaps(state.selected || {}).sort((a, b) => new Date(a.at) - new Date(b.at));
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
    return `<tr>
      <td>${new Date(s.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
      <td>#${s.rank}</td>
      <td>${s.uniIndex}</td>
      ${s.dims.map(d => `<td>${d.index}</td>`).join('')}
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

function seriesOf(snap) {
  return [snap.uniIndex, ...(snap.dims || []).map(d => (d ? d.index : 0))];
}

function drawSmooth(ctx, pts) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

function drawTrend() {
  const canvas = els.trendCanvas;
  const snaps = issueSnaps(state.selected || {}).sort((a, b) => new Date(a.at) - new Date(b.at));
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
    return `<span class="legend"><i style="background:${sr.color}"></i>${sr.name} <b>${isDelta ? (v >= 0 ? '+' : '') + v.toFixed(2) : v}</b></span>`;
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
  if (isDelta) {
    const d = prev ? parseFloat((snap.uniIndex - prev.uniIndex).toFixed(2)) : null;
    uniVal = d === null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(2);
  }

  const dimsHtml = (snap.dims || []).map((dim, di) => {
    let v = dim.index;
    if (isDelta) {
      const prevDim = prev && prev.dims ? prev.dims[di] : null;
      const d = prevDim ? parseFloat((dim.index - prevDim.index).toFixed(2)) : null;
      v = d === null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(2);
    }
    return `<div class="tt-row"><i style="background:${DIM_COLORS[di % DIM_COLORS.length]}"></i><span>${dim.name}</span><b>${v}</b></div>`;
  }).join('');

  tooltipEl.innerHTML = `
    <div class="tt-title">${dateStr} ${timeStr}</div>
    <div class="tt-rank">排名 #${snap.rank} · 指数 <b>${uniVal}</b></div>
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

function drawGrowth() {
  const canvas = els.growthCanvas;
  const snaps = issueSnaps(state.selected || {}).sort((a, b) => new Date(a.at) - new Date(b.at));
  const containerW = canvas.parentElement.clientWidth || 900;
  const demos = snaps.map((s, i) => {
    if (i === 0) return null;
    return { at: s.at, deltas: seriesOf(s).map((v, si) => parseFloat((v - seriesOf(snaps[i - 1])[si]).toFixed(2))) };
  }).filter(Boolean);

  const h = 180;
  const ratio = window.devicePixelRatio || 1;
  const slotW = 56;
  const w = Math.max(containerW, demos.length * slotW + 80);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#f8faf9';
  ctx.fillRect(0, 0, w, h);

  if (!demos.length) {
    ctx.fillStyle = '#8a9a91';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('快照不足，多抓几次后展示时段涨幅', w / 2, h / 2);
    return;
  }

  const names = ['总指数', ...(snaps[0].dims || []).map(d => d.name)];
  const colors = [UNI_COLOR, ...(snaps[0].dims || []).map((_, i) => DIM_COLORS[i % DIM_COLORS.length])];
  const D = names.length;

  const maxAbs = Math.max(0.01, ...demos.flatMap(d => d.deltas.map(Math.abs)));
  const pad = { top: 22, right: 16, bottom: 50, left: 54 };
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const zeroY = pad.top + ih / 2;

  ctx.strokeStyle = 'rgba(22,116,71,0.3)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(pad.left + iw, zeroY); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#8a9a91';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('+' + maxAbs.toFixed(2), pad.left - 6, pad.top);
  ctx.fillText('0', pad.left - 6, zeroY);
  ctx.fillText('-' + maxAbs.toFixed(2), pad.left - 6, pad.top + ih);

  const slot = iw / demos.length;
  const barW = Math.max(5, Math.min(14, slot / D));

  demos.forEach((demo, i) => {
    const cx = pad.left + (i + 0.5) * slot;
    const gx = cx - (D * barW) / 2;
    demo.deltas.forEach((delta, di) => {
      const bh = Math.max(1, (Math.abs(delta) / maxAbs) * (ih / 2));
      const pos = delta >= 0;
      ctx.fillStyle = colors[di] + (pos ? 'cc' : '88');
      const bx = gx + di * barW;
      ctx.fillRect(bx + 1, pos ? zeroY - bh : zeroY, barW - 2, bh);
    });
    ctx.fillStyle = '#8a9a91';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmtTime(demo.at), cx, pad.top + ih + 5);
  });

  ctx.font = '10px system-ui';
  const legendY = pad.top + ih + 20;
  let lx = pad.left;
  names.forEach((name, di) => {
    ctx.fillStyle = colors[di];
    ctx.fillRect(lx, legendY, 7, 7);
    ctx.fillStyle = '#8a9a91';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(name, lx + 10, legendY);
    lx += 10 + ctx.measureText(name).width + 14;
  });
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

els.loadBtn.addEventListener('click', () => loadSong(els.idInput.value));
els.idInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadSong(els.idInput.value); });
els.refreshBtn.addEventListener('click', () => { fetchData(); loadRemoteSnaps(); });
els.exportBtn.addEventListener('click', exportCSV);
els.trendMode.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.trendMode = btn.dataset.mode;
  els.trendMode.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
  drawTrend();
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