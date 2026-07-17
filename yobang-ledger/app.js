const API_BASE = 'https://yobang.tencentmusic.com/unichartsapi/v1/songs';
const STORAGE_KEY = 'yobang-ledger-v3';
const DEFAULT_ID = '530004147';
const MIN_PX_PER_SNAP = 52;

const DIMENSION_COLORS = ['#167447', '#2c6f99', '#a97619', '#c9553d', '#5b6abf'];

const tooltip = document.createElement('div');
tooltip.style.cssText = [
  'position:fixed', 'display:none', 'background:rgba(18,28,22,0.93)',
  'color:#ddeee5', 'border-radius:10px', 'padding:10px 14px', 'font-size:12px',
  'pointer-events:none', 'z-index:9999', 'line-height:1.75',
  'box-shadow:0 6px 24px rgba(0,0,0,0.28)', 'min-width:148px',
].join(';');
document.body.appendChild(tooltip);

const els = {
  tabs:            document.querySelectorAll('.tab'),
  metricGrid:      document.getElementById('metricGrid'),
  trendCanvas:     document.getElementById('trendCanvas'),
  chartScroll:     document.getElementById('chartScroll'),
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
  dayFilter:       document.getElementById('dayFilter'),
};

let state = {
  songId:        DEFAULT_ID,
  current:       null,
  history:       [],
  selectedIssue: null,
  snapshots:     [],
  selectedDay:   null,
  chartMode:     'score',
};

// ── Storage ───────────────────────────────────────────────────────────────────

function storageKey(id) { return `${STORAGE_KEY}:${id}`; }

function loadSnapshots() {
  try {
    const raw = localStorage.getItem(storageKey(state.songId));
    const data = raw ? (JSON.parse(raw).snapshots || []) : [];
    state.snapshots = data.sort((a, b) => new Date(a.at) - new Date(b.at));
  } catch { state.snapshots = []; }
}

function saveSnapshot(issue) {
  const snap = {
    at:             canonicalAt(),
    chartsIssue:    issue.chartsIssue,
    uniIndex:       issue.uniIndex,
    curRank:        issue.curRank,
    nextUpdateTime: issue.nextUpdateTime || null,
    dims: visibleDims(issue).map(d => ({
      name: d.name, code: d.code, percentage: d.percentage, index: d.index,
    })),
  };
  state.snapshots = state.snapshots.filter(s => s.chartsIssue === issue.chartsIssue);
  // One snapshot per 10-min slot (keyed by hour * 10 + floor(min/10))
  const d = new Date(snap.at);
  const slot = d.getHours() * 10 + Math.floor(d.getMinutes() / 10);
  const idx = state.snapshots.findIndex(s => {
    const sd = new Date(s.at);
    return sd.getHours() * 10 + Math.floor(sd.getMinutes() / 10) === slot;
  });
  if (idx >= 0) { state.snapshots[idx] = snap; } else { state.snapshots.push(snap); }
  if (state.snapshots.length > 300) state.snapshots = state.snapshots.slice(-300);
  try { localStorage.setItem(storageKey(state.songId), JSON.stringify({ snapshots: state.snapshots })); } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function visibleDims(issue) {
  return issue.classifyIndices.filter(d => parseFloat(d.index) > 0);
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function snapDay(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// "2026-07-17 11:10:00" → "11:00" (minus 10 min)
function subtractTenMin(nextUpdateTime) {
  if (!nextUpdateTime) return '—';
  const parts = String(nextUpdateTime).split(' ');
  const timePart = parts[parts.length - 1];
  const [h, m] = timePart.split(':').map(Number);
  const total = ((h * 60 + m - 10) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Normalize to the :05/:15/:25/... mark of the current 10-min block
function canonicalAt() {
  const d = new Date();
  d.setMinutes(Math.floor(d.getMinutes() / 10) * 10 + 5, 0, 0);
  return d.toISOString();
}

// X-axis label: actual fetch time
function snapDisplayTime(snap) {
  return fmtTime(snap.at);
}

function metricCard(label, value, foot, color) {
  return `<div class="metric" style="border-top:3px solid ${color}">
    <span class="metric-label">${label}</span>
    <strong>${value}</strong>
    <span class="metric-foot">${foot}</span>
  </div>`;
}

function filteredSnaps() {
  let snaps = state.snapshots;
  if (state.selectedDay) snaps = snaps.filter(s => snapDay(s.at) === state.selectedDay);
  // Only keep :05/:15/:25/:35/:45/:55 aligned snapshots
  snaps = snaps.filter(s => new Date(s.at).getMinutes() % 10 === 5);
  return snaps;
}

function computeYBounds(snaps, mode) {
  if (!snaps.length) return { yMin: 0, yMax: 100 };
  let vals = [];
  if (mode === 'score') {
    snaps.forEach(s => s.dims.forEach(d => vals.push(parseFloat(d.index || 0))));
  } else {
    for (let i = 1; i < snaps.length; i++) {
      snaps[i].dims.forEach((d, di) => {
        vals.push(parseFloat(d.index || 0) - parseFloat(snaps[i - 1].dims[di]?.index || 0));
      });
    }
    if (!vals.length) vals = [0];
  }
  let mn = Math.min(...vals);
  let mx = Math.max(...vals);
  if (mode === 'delta') { mn = Math.min(mn, 0); mx = Math.max(mx, 0); }
  const range = mx - mn || 1;
  const pad = range * 0.2;
  return { yMin: mn - pad, yMax: mx + pad };
}

function niceGridTicks(yMin, yMax, count = 5) {
  const range = yMax - yMin || 1;
  const rawStep = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const n = rawStep / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const start = Math.floor(yMin / step) * step;
  const ticks = [];
  for (let v = start; v <= yMax + step * 0.01; v = parseFloat((v + step).toPrecision(10))) {
    if (v >= yMin - step * 0.01) ticks.push(parseFloat(v.toPrecision(10)));
  }
  return ticks;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchAndRender() {
  els.lastSync.textContent = '获取中…';
  try {
    const r = await fetch(`${API_BASE}/${state.songId}/charts_detail?_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (json.code !== '0') throw new Error(json.msg || '接口返回错误');

    state.history = json.data || [];
    state.current = state.history.find(d => d.dynamic) || state.history[0] || null;

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

// ── Rendering ─────────────────────────────────────────────────────────────────

function render() {
  renderMetricGrid();
  renderIssueList();
  renderChartControls();
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
  const updateHM = subtractTenMin(d.nextUpdateTime);
  const nextHM = d.nextUpdateTime ? d.nextUpdateTime.split(' ').slice(-1)[0] : (d.dynamic ? '—' : '结算');
  const updateDate = d.nextUpdateTime
    ? String(d.nextUpdateTime).split(' ')[0].slice(5).replace('-', '/')
    : '—';

  const summaryRow = [
    metricCard('当前排名', `#${d.curRank}`, `第 ${d.chartsIssue} 期`, '#a97619'),
    metricCard('由你指数', d.uniIndex, `${d.chartsIssueStartTime} — ${d.chartsIssueEndTime}`, '#167447'),
    metricCard('更新区间', `${updateHM} — ${nextHM}`, updateDate, '#2c6f99'),
  ].join('');

  const dimRow = dims.map((dim, i) =>
    metricCard(
      `${dim.name} <small style="font-weight:normal;opacity:.65">${dim.percentage}%</small>`,
      dim.index,
      dim.subdivisions.join(' · '),
      DIMENSION_COLORS[i % DIMENSION_COLORS.length]
    )
  ).join('');

  els.metricGrid.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-bottom:14px';
  els.metricGrid.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">${summaryRow}</div>
    ${dims.length ? `<div style="display:grid;grid-template-columns:repeat(${dims.length},minmax(0,1fr));gap:12px">${dimRow}</div>` : ''}
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

function renderChartControls() {
  const snaps = state.snapshots;
  const days = snaps.length ? [...new Set(snaps.map(s => snapDay(s.at)))] : [];
  if (state.selectedDay && !days.includes(state.selectedDay)) state.selectedDay = null;

  const modeHtml = `<div class="mode-bar">
    <button class="mode-btn${state.chartMode === 'score' ? ' is-active' : ''}" data-mode="score">实时分数</button>
    <button class="mode-btn${state.chartMode === 'delta' ? ' is-active' : ''}" data-mode="delta">区间涨幅</button>
  </div>`;

  const dayHtml = days.length > 1 ? `<div class="day-filter-bar">
    <button class="day-btn${!state.selectedDay ? ' is-active' : ''}" data-day="">全部</button>
    ${days.map(d => `<button class="day-btn${state.selectedDay === d ? ' is-active' : ''}" data-day="${d}">${d}</button>`).join('')}
  </div>` : '';

  els.dayFilter.innerHTML = `<div class="chart-controls">${modeHtml}${dayHtml}</div>`;

  els.dayFilter.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.chartMode = btn.dataset.mode;
      renderChartControls();
      drawTrendCanvas();
    });
  });
  els.dayFilter.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedDay = btn.dataset.day || null;
      renderChartControls();
      drawTrendCanvas();
    });
  });
}

// ── Chart ─────────────────────────────────────────────────────────────────────

let _chartSnaps = [];
let _chartXOf = null;

function drawTrendCanvas(highlightIdx = null) {
  const canvas = els.trendCanvas;
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;

  const snaps = filteredSnaps();
  _chartSnaps = snaps;

  const containerW = (els.chartScroll ? els.chartScroll.clientWidth : 0) || 980;
  const H = 360;
  const W = Math.max(containerW, snaps.length > 1 ? snaps.length * MIN_PX_PER_SNAP + 90 : containerW);

  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const pad = { top: 28, right: 28, bottom: 52, left: 62 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f8faf9');
  bg.addColorStop(1, '#ffffff');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Historical (non-dynamic) issue — no trend needed
  if (state.selectedIssue && !state.selectedIssue.dynamic) {
    ctx.fillStyle = '#8a9a91';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('历史榜期不展示趋势', W / 2, H / 2);
    els.trendStatus.textContent = '历史期';
    els.dimensionLegend.innerHTML = '';
    _chartXOf = null;
    return;
  }

  // No data
  if (!snaps.length || !snaps[0]?.dims?.length) {
    ctx.fillStyle = '#8a9a91';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无快照，开启定时抓取后自动记录', W / 2, H / 2);
    els.trendStatus.textContent = '等待快照';
    els.dimensionLegend.innerHTML = '';
    _chartXOf = null;
    return;
  }

  const isDelta = state.chartMode === 'delta';
  const { yMin, yMax } = computeYBounds(snaps, state.chartMode);
  const yRange = yMax - yMin || 1;

  const xOf = (i) => pad.left + (snaps.length === 1 ? cw / 2 : (cw / (snaps.length - 1)) * i);
  const yOf = (val) => pad.top + ch - ((val - yMin) / yRange) * ch;
  _chartXOf = xOf;

  // Grid ticks
  const ticks = niceGridTicks(yMin, yMax, 5);
  ticks.forEach((tick, ti) => {
    const y = yOf(tick);
    if (y < pad.top - 4 || y > pad.top + ch + 4) return;
    const isZeroLine = isDelta && Math.abs(tick) < 1e-9;
    ctx.strokeStyle = isZeroLine ? 'rgba(22,116,71,0.45)' : (ti === 0 ? '#c4ccc8' : '#e2e9e5');
    ctx.lineWidth = isZeroLine ? 1.5 : 1;
    ctx.setLineDash(isZeroLine ? [5, 3] : (ti === 0 ? [] : [4, 5]));
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isZeroLine ? '#167447' : '#8a9a91';
    ctx.font = `${isZeroLine ? 'bold ' : ''}11px system-ui`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const label = isDelta
      ? (tick >= 0 ? '+' : '') + tick.toFixed(2)
      : String(Math.round(tick * 10) / 10);
    ctx.fillText(label, pad.left - 8, y);
  });

  // Left axis line
  ctx.strokeStyle = '#c4ccc8'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + ch); ctx.stroke();

  const dimCount = snaps[0].dims.length;

  for (let di = 0; di < dimCount; di++) {
    const color = DIMENSION_COLORS[di % DIMENSION_COLORS.length];

    const pts = snaps.map((snap, si) => {
      const val = isDelta
        ? (si === 0 ? 0 : parseFloat(snap.dims[di]?.index || 0) - parseFloat(snaps[si - 1].dims[di]?.index || 0))
        : parseFloat(snap.dims[di]?.index || 0);
      return { x: xOf(si), y: yOf(val) };
    });

    // Gradient area fill (score mode only)
    if (!isDelta) {
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
      grad.addColorStop(0, color + '2e');
      grad.addColorStop(1, color + '00');
      ctx.beginPath();
      drawSmooth(ctx, pts);
      ctx.lineTo(pts.at(-1).x, pad.top + ch);
      ctx.lineTo(pts[0].x, pad.top + ch);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Line stroke
    ctx.beginPath();
    drawSmooth(ctx, pts);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.stroke();

    // Dots
    pts.forEach((pt, si) => {
      const isHover = highlightIdx === si;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isHover ? 5.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = isHover ? 2.5 : 1.5;
      ctx.stroke();
    });
  }

  // Crosshair
  if (highlightIdx !== null && highlightIdx >= 0 && highlightIdx < snaps.length) {
    const x = xOf(highlightIdx);
    ctx.strokeStyle = 'rgba(90,110,100,0.30)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ch); ctx.stroke();
    ctx.setLineDash([]);
  }

  // X-axis labels — all snaps here are already :05-aligned via canonicalAt()
  ctx.fillStyle = '#8a9a91'; ctx.font = '11px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i < snaps.length; i++) {
    const x = xOf(i);
    ctx.fillText(snapDisplayTime(snaps[i]), x, pad.top + ch + 10);
    ctx.strokeStyle = '#c4ccc8'; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x, pad.top + ch); ctx.lineTo(x, pad.top + ch + 4); ctx.stroke();
  }

  // Legend with delta hint
  const latest = snaps.at(-1);
  els.dimensionLegend.innerHTML = snaps[0].dims.map((dim, di) => {
    const curVal = latest.dims[di]?.index ?? '—';
    let deltaStr = '';
    if (snaps.length >= 2) {
      const diff = parseFloat(curVal || 0) - parseFloat(snaps.at(-2).dims[di]?.index || 0);
      if (diff !== 0) {
        const sign = diff > 0 ? '+' : '';
        deltaStr = ` <small style="color:${diff > 0 ? '#167447' : '#c9553d'}">${sign}${diff.toFixed(2)}</small>`;
      }
    }
    return `<div class="legend-item">
      <div class="legend-swatch" style="background:${DIMENSION_COLORS[di % DIMENSION_COLORS.length]}"></div>
      <span class="legend-name">${dim.name} (${dim.percentage}%)</span>
      <span class="legend-value">${curVal}${deltaStr}</span>
    </div>`;
  }).join('');
  els.trendStatus.textContent = `${snaps.length} 个快照`;
}

function drawSmooth(ctx, pts) {
  if (!pts.length) return;
  if (pts.length === 1) { ctx.moveTo(pts[0].x, pts[0].y); return; }
  if (pts.length === 2) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); return; }
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || pts[i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

// ── Canvas hover ──────────────────────────────────────────────────────────────

els.trendCanvas.addEventListener('mousemove', (e) => {
  const snaps = _chartSnaps;
  if (!snaps.length || !_chartXOf) return;

  const rect = els.trendCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;

  let nearest = 0, minDist = Infinity;
  snaps.forEach((_, i) => {
    const dist = Math.abs(_chartXOf(i) - mx);
    if (dist < minDist) { minDist = dist; nearest = i; }
  });

  drawTrendCanvas(nearest);

  const snap = snaps[nearest];
  const isDelta = state.chartMode === 'delta';
  const timeStr = snapDisplayTime(snap);
  const dateStr = new Date(snap.at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

  const dimsHtml = snap.dims.map((dim, di) => {
    const c = DIMENSION_COLORS[di % DIMENSION_COLORS.length];
    let valStr;
    if (isDelta) {
      if (nearest === 0) {
        valStr = '—';
      } else {
        const diff = parseFloat(dim.index || 0) - parseFloat(snaps[nearest - 1].dims[di]?.index || 0);
        valStr = (diff >= 0 ? '+' : '') + diff.toFixed(2);
      }
    } else {
      valStr = dim.index;
    }
    return `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:5px;vertical-align:middle"></span>${dim.name} <strong>${valStr}</strong></div>`;
  }).join('');

  tooltip.innerHTML = `
    <div style="font-weight:600;margin-bottom:5px;color:#a8ccb8">${dateStr} ${timeStr}</div>
    <div style="margin-bottom:6px;color:#c0d4c8">排名 <strong style="color:#fff">#${snap.curRank}</strong> &nbsp; 指数 <strong style="color:#fff">${snap.uniIndex}</strong></div>
    ${dimsHtml}
  `;
  tooltip.style.display = 'block';

  const tx = e.clientX + 16;
  const ty = e.clientY - 10;
  const tw = tooltip.offsetWidth;
  tooltip.style.left = (tx + tw > window.innerWidth ? e.clientX - tw - 10 : tx) + 'px';
  tooltip.style.top  = Math.max(4, ty) + 'px';
});

els.trendCanvas.addEventListener('mouseleave', () => {
  tooltip.style.display = 'none';
  drawTrendCanvas();
});

// ── Table ─────────────────────────────────────────────────────────────────────

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

// ── Tab ───────────────────────────────────────────────────────────────────────

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
  state.selectedDay = null; state.chartMode = 'score';
  loadSnapshots();
  render();
  fetchAndRender();
}

// ── Auto-fetch scheduler (fire at :05, :15, :25, :35, :45, :55) ──────────────

let _autoTimer = null;
let _autoInterval = null;

function msToNextX5() {
  const now = new Date();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ms = now.getMilliseconds();
  const mMod = m % 10;
  const minsUntil = mMod < 5 ? (5 - mMod) : (15 - mMod);
  return Math.max(0, (minsUntil * 60 - s) * 1000 - ms);
}

function updateAutoBtn(on) {
  const btn = document.getElementById('autoFetchBtn');
  if (!btn) return;
  btn.textContent = on ? '定时抓取 ●' : '定时抓取 ○';
  btn.style.color = on ? 'var(--green)' : '';
  btn.style.borderColor = on ? 'var(--green)' : '';
}

function toggleAutoFetch() {
  if (_autoTimer !== null || _autoInterval !== null) {
    clearTimeout(_autoTimer);
    clearInterval(_autoInterval);
    _autoTimer = null; _autoInterval = null;
    updateAutoBtn(false);
    return;
  }
  const delay = msToNextX5();
  updateAutoBtn(true);
  _autoTimer = setTimeout(() => {
    _autoTimer = null;
    fetchAndRender();
    _autoInterval = setInterval(fetchAndRender, 10 * 60 * 1000);
  }, delay);
}

// ── Init ──────────────────────────────────────────────────────────────────────

els.tabs.forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));
els.refreshBtn.addEventListener('click', () => fetchAndRender());
els.loadBtn.addEventListener('click', () => loadSong(els.songIdInput.value));
els.songIdInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadSong(els.songIdInput.value); });
document.getElementById('autoFetchBtn')?.addEventListener('click', toggleAutoFetch);

loadSnapshots();
setView('dashboard');
fetchAndRender();
