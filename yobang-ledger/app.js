const DATA_URL = './data.json';
const API_BASE = 'https://yobang.tencentmusic.com/unichartsapi/v1/songs';
const DIMENSION_COLORS = ['#167447', '#2c6f99', '#a97619', '#c9553d', '#5b6abf'];
const MIN_PX_PER_SNAP = 52;

const tooltip = document.createElement('div');
tooltip.style.cssText = [
  'position:fixed', 'display:none', 'background:rgba(18,28,22,0.93)',
  'color:#ddeee5', 'border-radius:10px', 'padding:10px 14px', 'font-size:12px',
  'pointer-events:none', 'z-index:9999', 'line-height:1.75',
  'box-shadow:0 6px 24px rgba(0,0,0,0.28)', 'min-width:148px',
].join(';');
document.body.appendChild(tooltip);

const els = {
  songInfo:        document.getElementById('songInfo'),
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
  dayFilter:       document.getElementById('dayFilter'),
  chartModeBar:    document.getElementById('chartModeBar'),
  searchInput:     document.getElementById('searchInput'),
  searchBtn:       document.getElementById('searchBtn'),
  searchResults:   document.getElementById('searchResults'),
};

let state = {
  data:          null,
  trackedData:   null,  // original data.json content
  selectedIssue: null,
  selectedDay:   null,
  chartMode:     'score',
  isLive:        false, // true when viewing a searched (non-tracked) song
};

// ── Data ──────────────────────────────────────────────────────────────────────

async function fetchData() {
  try {
    const r = await fetch(`${DATA_URL}?_=${Date.now()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    state.trackedData = data;
    if (!state.isLive) {
      state.data = data;
      const issues = allIssues();
      if (state.selectedIssue) {
        state.selectedIssue = issues.find(i => i.chartsIssue === state.selectedIssue.chartsIssue) || issues[0] || null;
      } else {
        state.selectedIssue = issues[0] || null;
      }
      render();
    }
    const t = data.updated_at
      ? new Date(data.updated_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : '--';
    if (els.lastSync) els.lastSync.textContent = `上次更新 ${t}`;
  } catch (e) {
    if (els.lastSync) els.lastSync.textContent = `获取失败: ${e.message}`;
    console.error(e);
  }
}

// ── Search & live load ────────────────────────────────────────────────────────

async function searchSongs(query) {
  query = query.trim();
  if (!query) return;

  if (/^\d+$/.test(query)) {
    await loadLiveSong(query);
    return;
  }

  if (els.searchResults) els.searchResults.innerHTML = '<div class="search-hint">搜索中…</div>';

  const endpoints = [
    `${API_BASE}/search?keyword=${encodeURIComponent(query)}&pageSize=10&pageNum=1`,
    `https://yobang.tencentmusic.com/unichartsapi/v1/search?keyword=${encodeURIComponent(query)}&pageSize=10`,
  ];

  let results = [];
  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      const d = await res.json();
      const list = d?.data?.list || d?.data?.songs || d?.data?.content || [];
      if (list.length) { results = list; break; }
    } catch (_) {}
  }

  if (!results.length) {
    if (els.searchResults) els.searchResults.innerHTML =
      '<div class="search-hint">未找到结果，请直接输入歌曲 uniId（纯数字）后按搜</div>';
    return;
  }

  if (els.searchResults) {
    els.searchResults.innerHTML = results.map(s => {
      const uniId = s.uniId || s.id || s.songId || '';
      const name = s.trackName || s.name || s.songName || '';
      const singer = s.singerName || s.singer || '';
      return `<div class="search-item" data-uni="${uniId}">
        <div class="search-item-name">${name}</div>
        <div class="search-item-singer">${singer}</div>
      </div>`;
    }).join('');
    els.searchResults.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', () => loadLiveSong(el.dataset.uni));
    });
  }
}

async function loadLiveSong(uniId) {
  if (els.searchResults) els.searchResults.innerHTML = '<div class="search-hint">加载中…</div>';
  try {
    const [detailRes, infoRes] = await Promise.all([
      fetch(`${API_BASE}/${uniId}/charts_detail`),
      fetch(`${API_BASE}/${uniId}/info`),
    ]);
    const detail = await detailRes.json();
    const info = await infoRes.json();
    if (detail.code !== 0) throw new Error(detail.message || `code ${detail.code}`);

    const issues = detail.data?.chartsIssues || [];
    const current = issues.find(i => i.dynamic) || issues[0] || null;
    const history = issues.filter(i => !i.dynamic);
    const infoData = info.data || {};

    state.data = {
      song_id: String(uniId),
      updated_at: new Date().toISOString(),
      info: {
        track_name: infoData.trackName || '',
        singer_name: infoData.singerName || '',
        cover_image: infoData.coverImage || '',
        qy_track_id: infoData.qyTrackId || null,
      },
      current_issue: current?.chartsIssue || null,
      current: current || null,
      snapshots: {},
      history,
    };
    state.isLive = true;
    state.selectedIssue = current || issues[0] || null;
    state.selectedDay = null;

    if (els.searchResults) {
      els.searchResults.innerHTML = '<div class="search-hint back-btn" id="backToTracked">← 返回追踪歌曲</div>';
      document.getElementById('backToTracked')?.addEventListener('click', backToTracked);
    }
    render();
  } catch (e) {
    if (els.searchResults) els.searchResults.innerHTML =
      `<div class="search-hint search-err">加载失败: ${e.message}</div>`;
  }
}

function backToTracked() {
  state.isLive = false;
  state.data = state.trackedData;
  state.selectedIssue = null;
  state.selectedDay = null;
  if (els.searchResults) els.searchResults.innerHTML = '';
  if (els.searchInput) els.searchInput.value = '';
  const issues = allIssues();
  state.selectedIssue = issues[0] || null;
  render();
}

function allIssues() {
  if (!state.data) return [];
  const out = [];
  if (state.data.current) out.push(state.data.current);
  if (state.data.history) out.push(...state.data.history);
  return out;
}

function isCurrentIssue(issue) {
  return issue?.chartsIssue === state.data?.current_issue;
}

function currentSnaps() {
  if (!state.data || !state.selectedIssue) return [];
  const snaps = state.data.snapshots?.[state.selectedIssue.chartsIssue] || [];
  if (!state.selectedDay) return snaps;
  return snaps.filter(s => s.at.startsWith(state.selectedDay));
}

function visibleDims(issue) {
  return (issue?.classifyIndices || []).filter(d => (d.index || 0) > 0);
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  renderSongInfo();
  renderMetricGrid();
  renderIssueList();
  renderDayFilter();
  renderChartControls();
  drawTrendCanvas();
  renderTable();
}

function renderSongInfo() {
  if (!els.songInfo || !state.data?.info) return;
  const { track_name, singer_name } = state.data.info;
  els.songInfo.textContent = [track_name, singer_name].filter(Boolean).join(' · ');
}

function renderMetricGrid() {
  if (!els.metricGrid || !state.selectedIssue) return;
  const issue = state.selectedIssue;
  const isCurrent = isCurrentIssue(issue);
  const commentTotal = isCurrent ? state.data?.current?.comment_total : null;

  let interval = '--';
  const ut = issue.updateTime, nut = issue.nextUpdateTime;
  if (ut && nut) {
    const toMs = v => (typeof v === 'number' && v > 1e12) ? v : v * 1000;
    const fmt = v => new Date(toMs(v)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    interval = `${fmt(ut)} – ${fmt(nut)}`;
  }

  const dims = visibleDims(issue);
  const dimCards = dims.map((d, i) => `
    <div class="metric-card">
      <div class="metric-label" style="color:${DIMENSION_COLORS[i % DIMENSION_COLORS.length]}">${d.name}</div>
      <div class="metric-value">${d.index ?? '--'}</div>
    </div>`).join('');

  els.metricGrid.innerHTML = `
    <div class="metric-card">
      <div class="metric-label">当前排名</div>
      <div class="metric-value">${issue.curRank ?? '--'}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">由你指数</div>
      <div class="metric-value">${issue.uniIndex ?? '--'}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">更新区间</div>
      <div class="metric-value metric-value--small">${interval}</div>
    </div>
    ${commentTotal != null ? `<div class="metric-card">
      <div class="metric-label">热评数</div>
      <div class="metric-value">${commentTotal}</div>
    </div>` : ''}
    ${dimCards}`;
}

function renderIssueList() {
  if (!els.issueList) return;
  const issues = allIssues();
  if (!issues.length) {
    els.issueList.innerHTML = '<div class="issue-empty">暂无期数数据</div>';
    return;
  }
  els.issueList.innerHTML = issues.map(issue => {
    const active = issue.chartsIssue === state.selectedIssue?.chartsIssue ? ' active' : '';
    const badge = issue.dynamic ? '<span class="issue-badge">进行中</span>' : '';
    return `<div class="issue-item${active}" data-issue="${issue.chartsIssue}">
      <div class="issue-no">${issue.chartsIssue} ${badge}</div>
      <div class="issue-rank">#${issue.curRank ?? '--'} · ${issue.uniIndex ?? '--'}</div>
    </div>`;
  }).join('');

  els.issueList.querySelectorAll('.issue-item').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedIssue = allIssues().find(i => i.chartsIssue === el.dataset.issue) || null;
      state.selectedDay = null;
      render();
    });
  });
}

function renderDayFilter() {
  if (!els.dayFilter) return;
  if (!state.selectedIssue || !isCurrentIssue(state.selectedIssue)) {
    els.dayFilter.innerHTML = '';
    return;
  }
  const snaps = state.data?.snapshots?.[state.selectedIssue.chartsIssue] || [];
  const days = [...new Set(snaps.map(s => s.at.slice(0, 10)))].sort();
  if (days.length <= 1) { els.dayFilter.innerHTML = ''; return; }

  els.dayFilter.innerHTML = [
    `<button class="day-btn${!state.selectedDay ? ' is-active' : ''}" data-day="">全部</button>`,
    ...days.map(d => `<button class="day-btn${state.selectedDay === d ? ' is-active' : ''}" data-day="${d}">${d.slice(5)}</button>`),
  ].join('');

  els.dayFilter.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedDay = btn.dataset.day || null;
      renderDayFilter();
      drawTrendCanvas();
      renderTable();
    });
  });
}

function renderChartControls() {
  if (!els.chartModeBar) return;
  const modes = [['score', '维度分'], ['rank', '排名'], ['uni', '由你指数']];
  els.chartModeBar.innerHTML = modes.map(([m, label]) =>
    `<button class="mode-btn${state.chartMode === m ? ' is-active' : ''}" data-mode="${m}">${label}</button>`
  ).join('');
  els.chartModeBar.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.chartMode = btn.dataset.mode;
      renderChartControls();
      drawTrendCanvas();
    });
  });
}

// ── Canvas ────────────────────────────────────────────────────────────────────

function drawTrendCanvas() {
  const canvas = els.trendCanvas;
  if (!canvas) return;

  if (!state.selectedIssue || !isCurrentIssue(state.selectedIssue)) {
    const ctx = canvas.getContext('2d');
    canvas.width = els.chartScroll?.offsetWidth || 400;
    canvas.height = 200;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (els.trendStatus) els.trendStatus.textContent = '往期数据无趋势图';
    if (els.dimensionLegend) els.dimensionLegend.innerHTML = '';
    return;
  }

  const snaps = currentSnaps();
  if (!snaps.length) {
    if (els.trendStatus) els.trendStatus.textContent = '暂无快照数据';
    if (els.dimensionLegend) els.dimensionLegend.innerHTML = '';
    return;
  }
  if (els.trendStatus) els.trendStatus.textContent = '';

  const mode = state.chartMode;
  const dims = visibleDims(state.selectedIssue);

  let series = [];
  if (mode === 'score') {
    series = dims.map((d, i) => ({
      label: d.name,
      color: DIMENSION_COLORS[i % DIMENSION_COLORS.length],
      values: snaps.map(s => {
        const sd = (s.dims || []).find(x => x.code === d.code);
        return sd ? parseFloat(sd.index) : null;
      }),
    }));
  } else if (mode === 'rank') {
    series = [{ label: '排名', color: '#167447', values: snaps.map(s => s.curRank ? -s.curRank : null) }];
  } else {
    series = [{ label: '由你指数', color: '#2c6f99', values: snaps.map(s => parseFloat(s.uniIndex) || null) }];
  }

  const labels = snaps.map(s => {
    const d = new Date(s.at);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  const W = Math.max(snaps.length * MIN_PX_PER_SNAP, els.chartScroll?.offsetWidth || 400);
  const H = 220;
  canvas.width = W;
  canvas.height = H;
  if (els.chartScroll) els.chartScroll.scrollLeft = els.chartScroll.scrollWidth;

  const PAD = { top: 24, right: 24, bottom: 40, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const allVals = series.flatMap(s => s.values).filter(v => v != null);
  if (!allVals.length) return;
  let yMin = Math.min(...allVals), yMax = Math.max(...allVals);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad; yMax += yPad;

  const xOf = i => PAD.left + (snaps.length <= 1 ? innerW / 2 : (i / (snaps.length - 1)) * innerW);
  const yOf = v => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const y = PAD.top + (k / 4) * innerH;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
  }

  // Y labels
  ctx.fillStyle = 'rgba(200,220,210,0.5)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let k = 0; k <= 4; k++) {
    const v = yMax - (k / 4) * (yMax - yMin);
    const label = mode === 'rank' ? String(Math.round(-v)) : v.toFixed(1);
    ctx.fillText(label, PAD.left - 6, PAD.top + (k / 4) * innerH + 4);
  }

  // X labels
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(snaps.length / Math.floor(innerW / 44)));
  for (let i = 0; i < snaps.length; i += step) {
    ctx.fillText(labels[i], xOf(i), H - PAD.bottom + 14);
  }

  // Series lines (Catmull-Rom → Bezier)
  series.forEach(s => {
    const pts = s.values.map((v, i) => v != null ? [xOf(i), yOf(v)] : null).filter(Boolean);
    if (pts.length < 2) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      ctx.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1],
      );
    }
    ctx.stroke();
    ctx.fillStyle = s.color;
    pts.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
  });

  // Legend
  if (els.dimensionLegend) {
    els.dimensionLegend.innerHTML = series.map(s =>
      `<span class="legend-dot" style="background:${s.color}"></span><span class="legend-label">${s.label}</span>`
    ).join('');
  }

  // Click tooltip
  canvas._clickHandler && canvas.removeEventListener('click', canvas._clickHandler);
  canvas._clickHandler = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    if (snaps.length <= 1) return;
    let closest = 0, minDist = Infinity;
    for (let i = 0; i < snaps.length; i++) {
      const dist = Math.abs(xOf(i) - mx);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    const snap = snaps[closest];
    const dt = new Date(snap.at);
    const timeStr = `${String(dt.getMonth() + 1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    const lines = [
      `🕐 ${timeStr}`,
      `排名: #${snap.curRank ?? '--'}`,
      `由你指数: ${snap.uniIndex ?? '--'}`,
    ];
    if (mode === 'score' && snap.dims) {
      snap.dims.forEach(d => lines.push(`${d.name}: ${d.index}`));
    }
    if (snap.comment_total != null) lines.push(`热评数: ${snap.comment_total}`);
    tooltip.innerHTML = lines.join('<br>');
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(e.clientX + 12, window.innerWidth - 180) + 'px';
    tooltip.style.top = Math.min(e.clientY - 10, window.innerHeight - 160) + 'px';
  };
  canvas.addEventListener('click', canvas._clickHandler);
  document.addEventListener('click', (e) => { if (e.target !== canvas) tooltip.style.display = 'none'; }, { once: false });
}

// ── Table ─────────────────────────────────────────────────────────────────────

function renderTable() {
  if (!els.tableHead || !els.dataRows) return;
  const snaps = currentSnaps();
  const dims = state.selectedIssue ? visibleDims(state.selectedIssue) : [];

  els.tableHead.innerHTML = `<tr><th>时间</th><th>排名</th><th>由你指数</th>${
    dims.map(d => `<th>${d.name}</th>`).join('')
  }<th>热评数</th></tr>`;

  if (!snaps.length) {
    els.dataRows.innerHTML = '<tr><td colspan="99" style="text-align:center;opacity:.5">暂无数据</td></tr>';
    if (els.rowCount) els.rowCount.textContent = '0 条';
    return;
  }

  els.dataRows.innerHTML = [...snaps].reverse().map(s => {
    const dt = new Date(s.at);
    const timeStr = `${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    const dimCells = dims.map(d => {
      const sd = (s.dims || []).find(x => x.code === d.code);
      return `<td>${sd?.index ?? '--'}</td>`;
    }).join('');
    return `<tr><td>${timeStr}</td><td>#${s.curRank ?? '--'}</td><td>${s.uniIndex ?? '--'}</td>${dimCells}<td>${s.comment_total ?? '--'}</td></tr>`;
  }).join('');

  if (els.rowCount) els.rowCount.textContent = `${snaps.length} 条`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

els.refreshBtn?.addEventListener('click', fetchData);
els.searchBtn?.addEventListener('click', () => searchSongs(els.searchInput?.value || ''));
els.searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') searchSongs(els.searchInput.value); });

fetchData();
setInterval(fetchData, 10 * 60 * 1000);
