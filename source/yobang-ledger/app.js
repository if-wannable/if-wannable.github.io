const API_BASE = 'https://yobang.tencentmusic.com/unichartsapi/v1/songs';
const STORAGE_KEY = 'yobang-ledger-v4';
const DEFAULT_ID = '530004147';
const MIN_PX_PER_SNAP = 52;

const DIMENSION_COLORS = ['#167447', '#2c6f99', '#a97619', '#c9553d', '#5b6abf'];
const UNIINDEX_COLOR   = '#9747b0'; // purple — distinct from all dimension colors

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
  growthDayFilter: document.getElementById('growthDayFilter'),
  growthCanvas:    document.getElementById('growthCanvas'),
  growthScroll:    document.getElementById('growthScroll'),
  growthPanel:     document.getElementById('growthPanel'),
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

async function loadDataJson() {
  try {
    const r = await fetch(`./data.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json();
    // Merge all issues' snapshots; backfill chartsIssue for snaps written by old scraper
    const allRemote = Object.entries(data.snapshots || {}).flatMap(([issue, snaps]) =>
      snaps.map(s => ({ ...s, chartsIssue: s.chartsIssue || issue }))
    );
    if (allRemote.length) {
      const byAt = new Map(state.snapshots.map(s => [s.at, s]));
      allRemote.forEach(s => byAt.set(s.at, s));
      state.snapshots = [...byAt.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
      try { localStorage.setItem(storageKey(state.songId), JSON.stringify({ snapshots: state.snapshots })); } catch {}
    }
    // Fallback: fill history / selectedIssue from data.json if API hasn't responded yet
    if (!state.history.length && Array.isArray(data.history) && data.history.length) {
      state.history = data.history;
    }
    if (!state.selectedIssue && data.current_issue) {
      state.selectedIssue = data.current || { chartsIssue: data.current_issue };
    }
    render();
    if (state.snapshots.length) {
      els.trendStatus.textContent = `${filteredSnaps().length} 个快照（含云端）`;
    }
  } catch (e) {
    console.warn('data.json load failed:', e);
  }
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

// Parse "2026/07/14" or "2026-07-14" as local date
function parseIssueDate(str) {
  if (!str) return null;
  const s = String(str).trim().split(' ')[0].replace(/\//g, '-');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
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
  // Filter to selected issue only
  if (state.selectedIssue?.chartsIssue) {
    snaps = snaps.filter(s => s.chartsIssue === state.selectedIssue.chartsIssue);
  }
  if (state.selectedDay) snaps = snaps.filter(s => snapDay(s.at) === state.selectedDay);
  // Only keep :05/:15/:25/:35/:45/:55 aligned snapshots
  snaps = snaps.filter(s => new Date(s.at).getMinutes() % 10 === 5);
  return snaps;
}

function computeYBounds(snaps, mode) {
  if (!snaps.length) return { yMin: 0, yMax: 100 };
  let vals = [];
  if (mode === 'score') {
    snaps.forEach(s => {
      s.dims.forEach(d => vals.push(parseFloat(d.index || 0)));
      vals.push(parseFloat(s.uniIndex || 0));
    });
  } else {
    for (let i = 1; i < snaps.length; i++) {
      snaps[i].dims.forEach((d, di) => {
        vals.push(parseFloat(d.index || 0) - parseFloat(snaps[i - 1].dims[di]?.index || 0));
      });
      vals.push(parseFloat(snaps[i].uniIndex || 0) - parseFloat(snaps[i - 1].uniIndex || 0));
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

async function fetchAndRender(save = false) {
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

    if (save && state.current) saveSnapshot(state.current);
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
  drawGrowthCanvas();
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

  const summaryCards = [
    metricCard('当前排名', `#${d.curRank}`, `第 ${d.chartsIssue} 期&nbsp;&nbsp;${d.chartsIssueStartTime} — ${d.chartsIssueEndTime}`, '#a97619'),
    metricCard('由你指数', d.uniIndex, '', '#167447'),
    metricCard('更新区间', `${updateHM} — ${nextHM}`, updateDate, '#2c6f99'),
  ];
  const summaryRow = summaryCards.join('');

  const dimRow = dims.map((dim, i) =>
    metricCard(
      dim.name,
      dim.index,
      '',
      DIMENSION_COLORS[i % DIMENSION_COLORS.length]
    )
  ).join('');

  els.metricGrid.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-bottom:14px';
  els.metricGrid.innerHTML = `
    <div class="metric-row summary-row" style="display:grid;grid-template-columns:repeat(${summaryCards.length},minmax(0,1fr));gap:12px">${summaryRow}</div>
    ${dims.length ? `<div class="dim-row-wrap"><div class="metric-row dim-row" style="display:grid;grid-template-columns:repeat(${dims.length},minmax(0,1fr));gap:12px">${dimRow}</div></div>` : ''}
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
      state.selectedDay = null;
      renderMetricGrid();
      renderIssueList();
      renderChartControls();
      drawTrendCanvas();
      drawGrowthCanvas();
    });
  });
}

function buildCalHtml(days, issue) {
  const start = parseIssueDate(issue?.chartsIssueStartTime);
  const end   = parseIssueDate(issue?.chartsIssueEndTime);
  if (start && end) {
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const calDays = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) calDays.push(new Date(d));
    const todayKey = snapDay(new Date().toISOString());
    const allActive = !state.selectedDay;
    return `<div class="cal-week">
      <button class="cal-all-btn${allActive ? ' is-active' : ''}" data-day="" type="button">全部</button>
      ${calDays.map(d => {
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        const hasData = days.includes(key);
        const isActive = state.selectedDay === key;
        const isToday = todayKey === key;
        return `<button class="cal-day${hasData ? ' has-data' : ''}${isActive ? ' is-active' : (isToday ? ' is-today' : '')}"
          data-day="${key}" type="button"${!hasData ? ' aria-disabled="true"' : ''}>
          <span class="cal-wd">${weekDays[d.getDay()]}</span>
          <span class="cal-date">${d.getDate()}</span>
          ${hasData ? '<span class="cal-dot"></span>' : '<span class="cal-dot" style="opacity:0"></span>'}
        </button>`;
      }).join('')}
    </div>`;
  } else if (days.length > 1) {
    const allActive = !state.selectedDay;
    return `<div class="day-filter-bar">
      <button class="day-btn${allActive ? ' is-active' : ''}" data-day="">全部</button>
      ${days.map(d => `<button class="day-btn${state.selectedDay === d ? ' is-active' : ''}" data-day="${d}">${d}</button>`).join('')}
    </div>`;
  }
  return '';
}

function attachCalListeners(container) {
  container.querySelectorAll('.cal-day, .cal-all-btn, .day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedDay = btn.dataset.day || null;
      renderChartControls();
      drawTrendCanvas();
      drawGrowthCanvas();
    });
  });
}

function renderChartControls() {
  // Snapshots for the current issue only (for knowing which days have data)
  const issuedSnaps = state.snapshots.filter(s =>
    !state.selectedIssue?.chartsIssue || s.chartsIssue === state.selectedIssue.chartsIssue
  );
  const days = issuedSnaps.length ? [...new Set(issuedSnaps.map(s => snapDay(s.at)))] : [];
  if (state.selectedDay && !days.includes(state.selectedDay)) state.selectedDay = null;

  const modeHtml = `<div class="mode-bar">
    <button class="mode-btn${state.chartMode === 'score' ? ' is-active' : ''}" data-mode="score">实时分数</button>
    <button class="mode-btn${state.chartMode === 'delta' ? ' is-active' : ''}" data-mode="delta">区间涨幅</button>
  </div>`;

  const calHtml = buildCalHtml(days, state.selectedIssue);

  els.dayFilter.innerHTML = `<div class="chart-controls">${modeHtml}</div>${calHtml}`;
  if (els.growthDayFilter) els.growthDayFilter.innerHTML = calHtml;

  els.dayFilter.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.chartMode = btn.dataset.mode;
      renderChartControls();
      drawTrendCanvas();
    });
  });
  attachCalListeners(els.dayFilter);
  if (els.growthDayFilter) attachCalListeners(els.growthDayFilter);
}
    });
  });
}

// ── Chart ─────────────────────────────────────────────────────────────────────

let _chartSnaps = [];
let _chartXOf = null;
let _growthData = [];
let _growthLayout = null;

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

  // ── 总指数 line (dashed, drawn on top of dims) ───────────────────────────
  const uniPts = snaps.map((snap, si) => {
    const val = isDelta
      ? (si === 0 ? 0 : parseFloat(snap.uniIndex || 0) - parseFloat(snaps[si - 1].uniIndex || 0))
      : parseFloat(snap.uniIndex || 0);
    return { x: xOf(si), y: yOf(val) };
  });

  if (!isDelta) {
    const uniGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    uniGrad.addColorStop(0, UNIINDEX_COLOR + '22');
    uniGrad.addColorStop(1, UNIINDEX_COLOR + '00');
    ctx.beginPath();
    drawSmooth(ctx, uniPts);
    ctx.lineTo(uniPts.at(-1).x, pad.top + ch);
    ctx.lineTo(uniPts[0].x, pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = uniGrad;
    ctx.fill();
  }

  ctx.beginPath();
  drawSmooth(ctx, uniPts);
  ctx.strokeStyle = UNIINDEX_COLOR;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.setLineDash([7, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  uniPts.forEach((pt, si) => {
    const isHover = highlightIdx === si;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isHover ? 5.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = UNIINDEX_COLOR;
    ctx.lineWidth = isHover ? 2.5 : 1.5;
    ctx.stroke();
  });

  // Legend with delta hint
  const latest = snaps.at(-1);
  const prev2 = snaps.length >= 2 ? snaps.at(-2) : null;

  function deltaEntry(curVal, prevVal) {
    if (!prev2) return { display: '—', color: '#8a9a91' };
    const diff = curVal - prevVal;
    return {
      display: (diff >= 0 ? '+' : '') + diff.toFixed(2),
      color: diff > 0 ? '#167447' : diff < 0 ? '#c9553d' : '#8a9a91',
    };
  }

  const uniEntry = deltaEntry(parseFloat(latest.uniIndex || 0), parseFloat(prev2?.uniIndex || 0));
  const uniLegend = `<div class="legend-item legend-item--uni">
    <div class="legend-swatch legend-swatch--dashed" style="background:${UNIINDEX_COLOR}"></div>
    <span class="legend-name">总指数</span>
    <span class="legend-value" style="color:${uniEntry.color}">${uniEntry.display}</span>
  </div>`;

  els.dimensionLegend.innerHTML = uniLegend + snaps[0].dims.map((dim, di) => {
    const curVal = parseFloat(latest.dims[di]?.index || 0);
    const { display: deltaDisplay, color: deltaColor } = deltaEntry(curVal, parseFloat(prev2?.dims[di]?.index || 0));
    return `<div class="legend-item">
      <div class="legend-swatch" style="background:${DIMENSION_COLORS[di % DIMENSION_COLORS.length]}"></div>
      <span class="legend-name">${dim.name}</span>
      <span class="legend-value" style="color:${deltaColor}">${deltaDisplay}</span>
    </div>`;
  }).join('');
  els.trendStatus.textContent = `${snaps.length} 个快照`;
}

function drawSmooth(ctx, pts) {
  if (!pts.length) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
}

// ── Hourly growth chart (per dimension) ──────────────────────────────────────

function drawGrowthCanvas() {
  const canvas = els.growthCanvas;
  if (!canvas) return;

  const snaps = filteredSnaps();

  if (!snaps.length || !state.selectedIssue?.dynamic) {
    if (els.growthPanel) els.growthPanel.style.display = 'none';
    _growthData = []; _growthLayout = null;
    return;
  }
  if (els.growthPanel) els.growthPanel.style.display = '';

  const dims = snaps[0]?.dims || [];
  if (!dims.length) { canvas.style.display = 'none'; return; }

  canvas.style.display = '';
  if (els.growthScroll) els.growthScroll.style.display = '';

  // Group by hour
  const hourGroups = {};
  snaps.forEach(s => {
    const dt = new Date(s.at);
    const key = `${String(dt.getHours()).padStart(2, '0')}:00`;
    if (!hourGroups[key]) hourGroups[key] = [];
    hourGroups[key].push(s);
  });

  const hours = Object.keys(hourGroups).sort();

  // All series: each dim + uniIndex at the end
  const allSeries = [
    ...dims.map((d, di) => ({
      name: d.name,
      color: DIMENSION_COLORS[di % DIMENSION_COLORS.length],
      growth: (group, i) => parseFloat(group[i].dims[di]?.index || 0) - parseFloat(group[i - 1].dims[di]?.index || 0),
    })),
    {
      name: '总指数',
      color: UNIINDEX_COLOR,
      growth: (group, i) => parseFloat(group[i].uniIndex || 0) - parseFloat(group[i - 1].uniIndex || 0),
    },
  ];

  // Per-series growth per hour (sum of increments within the hour)
  const barData = hours.map(key => {
    const group = hourGroups[key];
    const dimGrowths = allSeries.map(ser => {
      let total = 0;
      for (let i = 1; i < group.length; i++) total += ser.growth(group, i);
      return parseFloat(total.toFixed(2));
    });
    return { label: key, dimGrowths };
  });

  if (!barData.length) { canvas.style.display = 'none'; return; }

  const D = allSeries.length;
  const BAR_W = Math.max(7, Math.min(16, 70 / D));
  const SLOT_W = D * BAR_W + 14;
  const ratio = window.devicePixelRatio || 1;
  const containerW = els.growthScroll?.clientWidth || 400;
  // Let canvas be as wide as content needs; container handles scroll
  const W = Math.max(hours.length * SLOT_W + 70, containerW);
  const H = 160;

  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f8faf9'); bg.addColorStop(1, '#ffffff');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const PAD = { top: 24, right: 14, bottom: 38, left: 46 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const zeroY = PAD.top + innerH / 2;

  const maxAbs = Math.max(0.01, ...barData.flatMap(b => b.dimGrowths.map(Math.abs)));

  // Zero line
  ctx.strokeStyle = 'rgba(22,116,71,0.25)';
  ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(PAD.left, zeroY); ctx.lineTo(W - PAD.right, zeroY); ctx.stroke();
  ctx.setLineDash([]);

  // Y labels
  ctx.fillStyle = '#8a9a91'; ctx.font = '9px system-ui';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(`+${maxAbs.toFixed(2)}`, PAD.left - 4, PAD.top + 2);
  ctx.fillText('0', PAD.left - 4, zeroY);
  ctx.fillText(`-${maxAbs.toFixed(2)}`, PAD.left - 4, PAD.top + innerH - 2);

  const slotW = innerW / hours.length;

  _growthData = barData;
  _growthLayout = { PAD, slotW, D, BAR_W, innerH, zeroY, maxAbs, dims: allSeries, W, H };

  barData.forEach((bar, hi) => {
    const slotCx = PAD.left + (hi + 0.5) * slotW;
    const groupStartX = slotCx - (D * BAR_W) / 2;

    bar.dimGrowths.forEach((growth, di) => {
      const bx = groupStartX + di * BAR_W;
      const bh = Math.max(1, (Math.abs(growth) / maxAbs) * (innerH / 2));
      const isPos = growth >= 0;
      const col = allSeries[di].color;
      ctx.fillStyle = col + (isPos ? 'cc' : '88');
      if (isPos) {
        ctx.fillRect(bx + 1, zeroY - bh, BAR_W - 2, bh);
      } else {
        ctx.fillRect(bx + 1, zeroY, BAR_W - 2, bh);
      }

      // Value label only when bars are wide enough
      if (Math.abs(growth) > 0.001 && BAR_W >= 13) {
        ctx.fillStyle = col;
        ctx.font = '8px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = isPos ? 'bottom' : 'top';
        const sign = isPos ? '+' : '';
        ctx.fillText(`${sign}${growth.toFixed(2)}`, bx + BAR_W / 2, isPos ? zeroY - bh - 1 : zeroY + bh + 1);
      }
    });

    // Hour label
    ctx.fillStyle = '#8a9a91'; ctx.font = '9px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(bar.label, slotCx, H - PAD.bottom + 4);
  });

  // Legend — compact, centered, includes all series
  ctx.font = '9px system-ui';
  const legendY = H - PAD.bottom + 18;
  const SQ = 6, LGAP = 3, LSEP = 8;
  const itemWidths = allSeries.map(ser => SQ + LGAP + ctx.measureText(ser.name).width);
  const totalLegW = itemWidths.reduce((s, w) => s + w, 0) + LSEP * (D - 1);
  let lx = (W - totalLegW) / 2;
  allSeries.forEach((ser, di) => {
    ctx.fillStyle = ser.color;
    ctx.fillRect(lx, legendY, SQ, SQ);
    ctx.fillStyle = '#8a9a91'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(ser.name, lx + SQ + LGAP, legendY);
    lx += itemWidths[di] + LSEP;
  });
}

// ── Growth canvas hover ───────────────────────────────────────────────────────

els.growthCanvas?.addEventListener('mousemove', (e) => {
  if (!_growthData.length || !_growthLayout) return;
  const { PAD, slotW, D, BAR_W, dims, zeroY, innerH, maxAbs } = _growthLayout;

  const rect = els.growthCanvas.getBoundingClientRect();
  const scaleX = (els.growthCanvas.width / (window.devicePixelRatio || 1)) / rect.width;
  const mx = (e.clientX - rect.left) * scaleX;

  const hi = Math.floor((mx - PAD.left) / slotW);
  if (hi < 0 || hi >= _growthData.length) { tooltip.style.display = 'none'; return; }

  const bar = _growthData[hi];
  const groupStartX = PAD.left + (hi + 0.5) * slotW - (D * BAR_W) / 2;
  const di = Math.min(D - 1, Math.max(0, Math.floor((mx - groupStartX) / BAR_W)));

  const growth = bar.dimGrowths[di];
  const sign = growth >= 0 ? '+' : '';
  const col = dims[di]?.color || UNIINDEX_COLOR;
  const dimsHtml = bar.dimGrowths.map((g, idx) => {
    const c = dims[idx]?.color || UNIINDEX_COLOR;
    const s = g >= 0 ? '+' : '';
    return `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:5px;vertical-align:middle"></span>${dims[idx]?.name} <strong style="color:${g >= 0 ? '#7ed8a8' : '#f4a090'}">${s}${g.toFixed(2)}</strong></div>`;
  }).join('');

  tooltip.innerHTML = `<div style="font-weight:600;margin-bottom:5px;color:#a8ccb8">${bar.label} 涨幅</div>${dimsHtml}`;
  tooltip.style.display = 'block';
  const tx = e.clientX + 16;
  const tw = tooltip.offsetWidth;
  tooltip.style.left = (tx + tw > window.innerWidth ? e.clientX - tw - 10 : tx) + 'px';
  tooltip.style.top = Math.max(4, e.clientY - 10) + 'px';
});

els.growthCanvas?.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

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

// ── Export ─────────────────────────────────────────────────────────────────────

function downloadText(content, filename, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
}

function exportCSV() {
  const snaps = state.snapshots;
  if (!snaps.length) return;
  const dims = snaps[0].dims.map(d => d.name);
  const header = ['时间', '排名', '由你指数', ...dims].join(',');
  const rows = snaps.map(s =>
    [new Date(s.at).toLocaleString('zh-CN'), s.curRank, s.uniIndex,
     ...s.dims.map(d => d.index)].join(',')
  );
  downloadText([header, ...rows].join('\n'), `yobang-${state.songId}.csv`, 'text/csv');
}

function exportJSON() {
  downloadText(JSON.stringify(state.snapshots, null, 2), `yobang-${state.songId}.json`, 'application/json');
}

// ── Share ──────────────────────────────────────────────────────────────────────

async function shareSnapshot() {
  const d = state.selectedIssue;
  if (!d) return;
  const dims = visibleDims(d).map(dim => `${dim.name} ${dim.index}`).join(' · ');
  const text = `📊 由你榜第 ${d.chartsIssue} 期\n排名 #${d.curRank} · 指数 ${d.uniIndex}\n${dims}`;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('shareBtn');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  } catch (e) {
    console.warn('clipboard write failed:', e);
  }
}

// ── Compare ────────────────────────────────────────────────────────────────────

const COMPARE_KEY = 'yobang-compare-list';

function getCompareList() {
  try { return JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]'); } catch { return []; }
}

function saveCompareList(list) {
  try { localStorage.setItem(COMPARE_KEY, JSON.stringify(list)); } catch {}
}

function addToCompare(id) {
  const trimmed = id.trim();
  if (!trimmed) return;
  const list = getCompareList();
  if (list.includes(trimmed)) return;
  list.push(trimmed);
  saveCompareList(list);
  fetchAndRenderCompare();
}

function removeFromCompare(id) {
  saveCompareList(getCompareList().filter(x => x !== id));
  fetchAndRenderCompare();
}

async function fetchAndRenderCompare() {
  const list = getCompareList();
  const status = document.getElementById('compareStatus');
  const grid = document.getElementById('compareGrid');
  if (!list.length) {
    if (status) status.textContent = '添加歌曲开始对比';
    if (grid) grid.innerHTML = '';
    return;
  }
  if (status) status.textContent = '获取中…';

  const results = await Promise.allSettled(list.map(async id => {
    const [detailRes, infoRes] = await Promise.all([
      fetch(`${API_BASE}/${id}/charts_detail?_=${Date.now()}`, { cache: 'no-store' }),
      fetch(`${API_BASE}/${id}/info?_=${Date.now()}`, { cache: 'no-store' }),
    ]);
    const detail = await detailRes.json();
    const info = await infoRes.json();
    const current = (detail.data || []).find(d => d.dynamic) || (detail.data || [])[0] || null;
    return { id, current, info: info.data || {} };
  }));

  if (status) status.textContent = `${list.length} 首歌曲`;
  if (!grid) return;

  grid.innerHTML = results.map((r, i) => {
    const id = list[i];
    if (r.status === 'rejected' || !r.value?.current) {
      return `<div class="compare-card">
        <button class="compare-card-remove" data-id="${id}" type="button">✕</button>
        <h3>${id}</h3>
        <div class="rank" style="color:var(--muted)">—</div>
        <div style="color:var(--muted);font-size:12px">获取失败</div>
      </div>`;
    }
    const { current, info } = r.value;
    const name = info.trackName || id;
    const singer = info.singerName || '';
    const dims = visibleDims(current).map((d, di) =>
      `<div style="font-size:12px;color:var(--muted);margin-top:4px">` +
      `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${DIMENSION_COLORS[di % DIMENSION_COLORS.length]};margin-right:5px"></span>` +
      `${d.name} <strong style="color:var(--ink)">${d.index}</strong></div>`
    ).join('');
    return `<div class="compare-card">
      <button class="compare-card-remove" data-id="${id}" type="button">✕</button>
      <h3>${name}</h3>
      ${singer ? `<div style="color:var(--muted);font-size:12px;margin-bottom:8px">${singer}</div>` : ''}
      <div class="rank" style="color:var(--gold)">#${current.curRank}</div>
      <div style="font-size:13px;color:var(--green);margin-bottom:6px">指数 ${current.uniIndex}</div>
      ${dims}
    </div>`;
  }).join('');

  grid.querySelectorAll('.compare-card-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCompare(btn.dataset.id));
  });
}

// ── Tab ───────────────────────────────────────────────────────────────────────

function setView(name) {
  els.tabs.forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('is-visible', v.id === name + 'View'));
}

// ── Song switching ────────────────────────────────────────────────────────────

function loadSong(id) {
  let trimmed = id.trim();
  // Support pasting a full yobang URL — extract uniId param
  const urlMatch = trimmed.match(/[?&]uniId=(\d+)/);
  if (urlMatch) trimmed = urlMatch[1];
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
    fetchAndRender(true);
    _autoInterval = setInterval(() => fetchAndRender(true), 10 * 60 * 1000);
  }, delay);
}

// ── Init ──────────────────────────────────────────────────────────────────────

els.tabs.forEach(t => t.addEventListener('click', () => {
  setView(t.dataset.view);
  if (t.dataset.view === 'compare') fetchAndRenderCompare();
}));
els.refreshBtn.addEventListener('click', () => fetchAndRender());
els.loadBtn.addEventListener('click', () => loadSong(els.songIdInput.value));
els.songIdInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadSong(els.songIdInput.value); });
document.getElementById('autoFetchBtn')?.addEventListener('click', toggleAutoFetch);
document.getElementById('shareBtn')?.addEventListener('click', shareSnapshot);
document.getElementById('exportCsvBtn')?.addEventListener('click', exportCSV);
document.getElementById('exportJsonBtn')?.addEventListener('click', exportJSON);
document.getElementById('compareAddBtn')?.addEventListener('click', () => {
  addToCompare(document.getElementById('compareIdInput').value);
  document.getElementById('compareIdInput').value = '';
});
document.getElementById('compareIdInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    addToCompare(e.target.value);
    e.target.value = '';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

loadSnapshots();
setView('dashboard');
fetchAndRender();
toggleAutoFetch();
loadDataJson();
