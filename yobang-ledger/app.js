const API_BASE = 'https://yobang.tencentmusic.com/unichartsapi/v1/songs';
const STORAGE_KEY = 'yobang-ledger-v2';
const DEFAULT_ID = '530004147';

const DIMENSION_COLORS = [
  '#167447', '#2c6f99', '#a97619', '#c9553d', '#5b6abf',
];

const els = {
  tabs:            document.querySelectorAll('.tab'),
  dashboardView:   document.getElementById('dashboardView'),
  dataView:        document.getElementById('dataView'),
  metricGrid:      document.getElementById('metricGrid'),
  trendCanvas:     document.getElementById('trendCanvas'),
  dimensionLegend: document.getElementById('dimensionLegend'),
  trendStatus:     document.getElementById('trendStatus'),
  tableHead:       document.getElementById('tableHead'),
  dataRows:        document.getElementById('dataRows'),
  rowCount:        document.getElementById('rowCount'),
  lastSync:        document.getElementById('lastSync'),
  refreshBtn:      document.getElementById('refreshBtn'),
  issueList:       document.getElementById('issueList'),
  songIdInput:     document.getElementById('songIdInput'),
  loadBtn:         document.getElementById('loadBtn'),
};

let state = {
  songId:    DEFAULT_ID,
  current:   null,
  history:   [],
  snapshots: [],
};

// ── Storage ──────────────────────────────────────────────────────────────────

function storageKey(songId) {
  return `${STORAGE_KEY}:${songId}`;
}

function loadSnapshots() {
  try {
    const raw = localStorage.getItem(storageKey(state.songId));
    state.snapshots = raw ? (JSON.parse(raw).snapshots || []) : [];
  } catch {
    state.snapshots = [];
  }
}

function saveSnapshot(issueData) {
  const snap = {
    at:          new Date().toISOString(),
    chartsIssue: issueData.chartsIssue,
    uniIndex:    issueData.uniIndex,
    curRank:     issueData.curRank,
    dims: issueData.classifyIndices.map(d => ({
      name:       d.name,
      code:       d.code,
      percentage: d.percentage,
      index:      d.index,
    })),
  };
  // Keep only current issue snapshots to avoid mixing weeks
  state.snapshots = state.snapshots.filter(s => s.chartsIssue === issueData.chartsIssue);
  state.snapshots.push(snap);
  if (state.snapshots.length > 300) state.snapshots = state.snapshots.slice(-300);
  try {
    localStorage.setItem(storageKey(state.songId), JSON.stringify({ snapshots: state.snapshots }));
  } catch {}
}

// ── API ──────────────────────────────────────────────────────────────────────

async function fetchAndRender() {
  els.lastSync.textContent = '获取中…';
  try {
    const url = `${API_BASE}/${state.songId}/charts_detail?_=${Date.now()}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (json.code !== '0') throw new Error(json.msg || '接口返回错误');

    state.history = json.data || [];
    state.current = state.history.find(d => d.dynamic) || state.history[0] || null;

    if (state.current) saveSnapshot(state.current);
    render();

    const t = new Date().toLocaleTimeString('zh-CN');
    els.lastSync.textContent = state.current
      ? `同步于 ${t} · 第 ${state.current.chartsIssue} 期`
      : `同步于 ${t}`;
  } catch (e) {
    els.lastSync.textContent = `获取失败：${e.message}`;
    els.trendStatus.textContent = e.message;
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function render() {
  renderMetricGrid();
  renderIssueList();
  drawTrendCanvas();
  renderTable();
}

function renderMetricGrid() {
  if (!state.current) { els.metricGrid.innerHTML = '<div class="metric"><span class="metric-label">暂无数据</span><strong>—</strong></div>'; return; }
  const d = state.current;
  const items = [
    { label: '当前排名',  value: `#${d.curRank}`,  unit: `第 ${d.chartsIssue} 期`,                             color: '#a97619' },
    { label: '由你指数',  value: d.uniIndex,         unit: `${d.chartsIssueStartTime} — ${d.chartsIssueEndTime}`, color: '#167447' },
    ...d.classifyIndices.map((dim, i) => ({
      label: `${dim.name} (${dim.percentage}%)`,
      value: dim.index,
      unit:  dim.subdivisions.join(' · '),
      color: DIMENSION_COLORS[i % DIMENSION_COLORS.length],
    })),
  ];
  els.metricGrid.innerHTML = items.map(item => `
    <div class="metric" style="border-top:3px solid ${item.color}">
      <span class="metric-label">${item.label}</span>
      <strong>${item.value}</strong>
      <span class="metric-foot">${item.unit}</span>
    </div>`).join('');
}

function renderIssueList() {
  els.issueList.innerHTML = state.history.map(issue => `
    <div class="tracker-item">
      <strong>${issue.chartsIssue} 期</strong>
      <span>${issue.chartsIssueStartTime} — ${issue.chartsIssueEndTime}</span>
      <span>排名 #${issue.curRank} · 指数 ${issue.uniIndex}</span>
    </div>`).join('') || '<div class="tracker-item"><span>暂无数据</span></div>';
}

function drawTrendCanvas() {
  const canvas = els.trendCanvas;
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 980;
  const H = canvas.clientHeight || 360;
  canvas.width  = Math.floor(W * ratio);
  canvas.height = Math.floor(H * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const snaps = state.snapshots;
  const pad = { top: 22, right: 24, bottom: 48, left: 54 };
  const w = W - pad.left - pad.right;
  const h = H - pad.top - pad.bottom;

  // Y grid 0–100
  ctx.strokeStyle = '#d9dfdc'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (h / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + w, y); ctx.stroke();
    ctx.fillStyle = '#68736e'; ctx.font = '11px system-ui';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(100 - 25 * i), pad.left - 6, y);
  }

  if (snaps.length === 0 || !snaps[0]?.dims?.length) {
    ctx.fillStyle = '#68736e'; ctx.font = '14px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('暂无快照，5 分钟后自动记录第一条', W / 2, H / 2);
    els.trendStatus.textContent = '等待快照';
    els.dimensionLegend.innerHTML = '';
    return;
  }

  const fmt = iso => new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  ctx.fillStyle = '#68736e'; ctx.font = '11px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(fmt(snaps[0].at), pad.left, pad.top + h + 8);
  if (snaps.length > 1) ctx.fillText(fmt(snaps.at(-1).at), pad.left + w, pad.top + h + 8);

  const dims = snaps[0].dims;
  dims.forEach((dim, di) => {
    const color = DIMENSION_COLORS[di % DIMENSION_COLORS.length];
    const pts = snaps.map((snap, si) => ({
      x: pad.left + (snaps.length === 1 ? w / 2 : (w / (snaps.length - 1)) * si),
      y: pad.top + h - (Math.min(100, Math.max(0, parseFloat(snap.dims[di]?.index || '0'))) / 100) * h,
    }));

    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
    ctx.stroke();

    const lp = pts.at(-1);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lp.x, lp.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  });

  const latest = snaps.at(-1);
  els.dimensionLegend.innerHTML = dims.map((dim, di) => `
    <div class="legend-item">
      <div class="legend-swatch" style="background:${DIMENSION_COLORS[di % DIMENSION_COLORS.length]}"></div>
      <span class="legend-name">${dim.name} (${dim.percentage}%)</span>
      <span class="legend-value">${latest.dims[di]?.index ?? '—'}</span>
    </div>`).join('');
  els.trendStatus.textContent = `${snaps.length} 个快照`;
}

function renderTable() {
  const snaps = [...state.snapshots].reverse();
  if (!snaps.length) {
    els.dataRows.innerHTML = '<tr><td colspan="99">暂无快照</td></tr>';
    els.rowCount.textContent = '0 行';
    return;
  }
  const dims = snaps[0].dims || [];
  els.tableHead.innerHTML = '<th>时间</th><th>排名</th><th>由你指数</th>' +
    dims.map(d => `<th>${d.name}</th>`).join('');
  els.dataRows.innerHTML = snaps.map(s => `
    <tr>
      <td>${new Date(s.at).toLocaleString('zh-CN')}</td>
      <td>#${s.curRank}</td>
      <td>${s.uniIndex}</td>
      ${(s.dims || []).map(d => `<td>${d.index}</td>`).join('')}
    </tr>`).join('');
  els.rowCount.textContent = `${state.snapshots.length} 行`;
}

// ── Tab ──────────────────────────────────────────────────────────────────────

function setView(name) {
  els.tabs.forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('is-visible', v.id === name + 'View'));
}

// ── Song Switching ───────────────────────────────────────────────────────────

function loadSong(id) {
  const trimmed = id.trim();
  if (!trimmed || trimmed === state.songId) { fetchAndRender(); return; }
  state.songId = trimmed;
  els.songIdInput.value = trimmed;
  loadSnapshots();
  state.current = null; state.history = [];
  render();
  fetchAndRender();
}

// ── Init ─────────────────────────────────────────────────────────────────────

els.tabs.forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));
els.refreshBtn.addEventListener('click', () => fetchAndRender());
els.loadBtn.addEventListener('click', () => loadSong(els.songIdInput.value));
els.songIdInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadSong(els.songIdInput.value); });

loadSnapshots();
setView('dashboard');
fetchAndRender();
setInterval(fetchAndRender, 5 * 60 * 1000);
