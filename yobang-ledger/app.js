const API_BASE = 'https://yobang.tencentmusic.com/unichartsapi/v1/songs';
const STORAGE_KEY = 'yobang-ledger-v2';
const DEFAULT_ID = '530004147';

const DIMENSION_COLORS = ['#167447', '#2c6f99', '#a97619', '#c9553d', '#5b6abf'];

const els = {
  tabs:            document.querySelectorAll('.tab'),
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
  songId:        DEFAULT_ID,
  current:       null,   // dynamic (ongoing) issue
  history:       [],     // all issues from API
  selectedIssue: null,   // issue being displayed
  snapshots:     [],     // localStorage snapshots (current issue only)
};

// ── Storage ──────────────────────────────────────────────────────────────────

function storageKey(id) { return `${STORAGE_KEY}:${id}`; }

function loadSnapshots() {
  try {
    const raw = localStorage.getItem(storageKey(state.songId));
    state.snapshots = raw ? (JSON.parse(raw).snapshots || []) : [];
  } catch { state.snapshots = []; }
}

function saveSnapshot(issue) {
  const snap = {
    at:          new Date().toISOString(),
    chartsIssue: issue.chartsIssue,
    uniIndex:    issue.uniIndex,
    curRank:     issue.curRank,
    dims: visibleDims(issue).map(d => ({
      name: d.name, code: d.code, percentage: d.percentage, index: d.index,
    })),
  };
  state.snapshots = state.snapshots.filter(s => s.chartsIssue === issue.chartsIssue);
  state.snapshots.push(snap);
  if (state.snapshots.length > 300) state.snapshots = state.snapshots.slice(-300);
  try { localStorage.setItem(storageKey(state.songId), JSON.stringify({ snapshots: state.snapshots })); } catch {}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Exclude dimensions with index 0 (no data for this song)
function visibleDims(issue) {
  return issue.classifyIndices.filter(d => parseFloat(d.index) > 0);
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function metricCard(label, value, foot, color) {
  return `<div class="metric" style="border-top:3px solid ${color}">
    <span class="metric-label">${label}</span>
    <strong>${value}</strong>
    <span class="metric-foot">${foot}</span>
  </div>`;
}

// ── API ──────────────────────────────────────────────────────────────────────

async function fetchAndRender() {
  els.lastSync.textContent = '获取中…';
  try {
    const r = await fetch(`${API_BASE}/${state.songId}/charts_detail?_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (json.code !== '0') throw new Error(json.msg || '接口返回错误');

    state.history = json.data || [];
    state.current = state.history.find(d => d.dynamic) || state.history[0] || null;

    // Keep user selection if still valid; otherwise default to current
    const sel = state.selectedIssue;
    state.selectedIssue = sel
      ? (state.history.find(h => h.chartsIssue === sel.chartsIssue) || state.current)
      : state.current;

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
  const d = state.selectedIssue;
  if (!d) {
    els.metricGrid.style.cssText = '';
    els.metricGrid.innerHTML = '<div class="metric"><span class="metric-label">暂无数据</span><strong>—</strong></div>';
    return;
  }

  const dims = visibleDims(d);

  // updateTime (unix ms) → HH:MM and full date string
  const updateHM = d.updateTime
    ? new Date(d.updateTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const updateDate = d.updateTime
    ? new Date(d.updateTime).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    : '';

  // nextUpdateTime "2026.07.17 11:05" → extract HH:MM
  const nextHM = d.nextUpdateTime ? d.nextUpdateTime.split(' ').slice(-1)[0] : (d.dynamic ? '—' : '结算');

  const summaryRow = [
    metricCard('当前排名', `#${d.curRank}`, `第 ${d.chartsIssue} 期`, '#a97619'),
    metricCard('由你指数', d.uniIndex, `${d.chartsIssueStartTime} — ${d.chartsIssueEndTime}`, '#167447'),
    metricCard('更新区间', `${updateHM} — ${nextHM}`, updateDate ? `${updateDate} · 10 分钟一次` : '10 分钟一次', '#2c6f99'),
  ].join('');

  const dimRow = dims.map((dim, i) =>
    metricCard(
      `${dim.name} <small style="font-weight:normal;opacity:.65">${dim.percentage}%</small>`,
      dim.index,
      dim.subdivisions.join(' · '),
      DIMENSION_COLORS[i % DIMENSION_COLORS.length]
    )
  ).join('');

  // Two rows: summary (4 cols) + dims (N cols), stacked in flex column
  els.metricGrid.style.cssText = 'display:flex; flex-direction:column; gap:12px; margin-bottom:14px';
  els.metricGrid.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px">${summaryRow}</div>
    ${dims.length ? `<div style="display:grid; grid-template-columns:repeat(${dims.length},minmax(0,1fr)); gap:12px">${dimRow}</div>` : ''}
  `;
}

function renderIssueList() {
  const selected = state.selectedIssue?.chartsIssue;
  els.issueList.innerHTML = state.history.map((issue, idx) => {
    const isActive = issue.chartsIssue === selected;
    return `<div class="tracker-item" data-idx="${idx}" style="cursor:pointer;${isActive ? 'border-color:var(--green);background:#edf4f0;' : ''}">
      <strong>${issue.chartsIssue} 期${issue.dynamic ? ' ●' : ''}</strong>
      <span>${issue.chartsIssueStartTime} — ${issue.chartsIssueEndTime}</span>
      <span>排名 #${issue.curRank} · 指数 ${issue.uniIndex}</span>
    </div>`;
  }).join('') || '<div class="tracker-item"><span>暂无数据</span></div>';

  els.issueList.querySelectorAll('[data-idx]').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedIssue = state.history[+el.dataset.idx];
      renderMetricGrid();
      renderIssueList();
    });
  });
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
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const snaps = state.snapshots;
  const pad = { top: 22, right: 24, bottom: 48, left: 54 };
  const w = W - pad.left - pad.right;
  const h = H - pad.top - pad.bottom;

  ctx.strokeStyle = '#d9dfdc'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (h / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + w, y); ctx.stroke();
    ctx.fillStyle = '#68736e'; ctx.font = '11px system-ui';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(100 - 25 * i), pad.left - 6, y);
  }

  if (!snaps.length || !snaps[0]?.dims?.length) {
    ctx.fillStyle = '#68736e'; ctx.font = '14px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('暂无快照，5 分钟后自动记录第一条', W / 2, H / 2);
    els.trendStatus.textContent = '等待快照';
    els.dimensionLegend.innerHTML = '';
    return;
  }

  ctx.fillStyle = '#68736e'; ctx.font = '11px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(fmtTime(snaps[0].at), pad.left, pad.top + h + 8);
  if (snaps.length > 1) ctx.fillText(fmtTime(snaps.at(-1).at), pad.left + w, pad.top + h + 8);

  snaps[0].dims.forEach((dim, di) => {
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
  els.dimensionLegend.innerHTML = snaps[0].dims.map((dim, di) => `
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
  els.tableHead.innerHTML = '<th>时间</th><th>排名</th><th>由你指数</th>' + dims.map(d => `<th>${d.name}</th>`).join('');
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

// ── Song switching ────────────────────────────────────────────────────────────

function loadSong(id) {
  const trimmed = id.trim();
  if (!trimmed || trimmed === state.songId) { fetchAndRender(); return; }
  state.songId = trimmed;
  state.current = null; state.history = []; state.selectedIssue = null;
  loadSnapshots();
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
