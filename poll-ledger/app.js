const STORAGE_KEY = "douban-poll-ledger-v3";

const sampleCsv = `captured_at,topic_id,poll_id,participant_count,result_visible,option_id,option,votes,percent,note
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843356,anna 刘耀文,905,25,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843357,Mimi 张泽禹,195,5,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843358,牙雾笑主 陈浚铭,757,21,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843359,杨梅饮 马嘉祺,773,22,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843360,章若楠 丁程鑫,712,20,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843361,Cd 冷却中贺峻霖,279,8,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843362,ahdkewn白敬亭,841,24,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843363,睡着了也困鞠婧祎,667,19,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843364,芝麻酱饼张极,209,6,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843365,香芹又青 李兰迪,483,14,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843366,卖掉裤衩来上网李煜东,253,7,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843367,FreiGeist成毅,253,7,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843368,甜酱吃一口左航,280,8,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843369,生打青椰肖战,331,9,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843370,狐狸小狗陈思罕,821,23,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843371,功夫豆浆左奇函,378,11,已登录/已投票后可查看结果
2026-07-14T10:31:18+08:00,493741132,10258668,3559,true,32843372,momo王源,567,16,已登录/已投票后可查看结果`;

const OPTION_COLORS = [
  "#167447","#2c6f99","#a97619","#c9553d","#5b6abf","#7a5c28",
  "#0f8a8a","#b54e7a","#6f7f28","#8d5ab5","#45755e","#d06b35",
  "#2f5f9f","#b3841f","#6d7f96","#b05b45","#4d8c57"
];

const els = {
  tabs: document.querySelectorAll(".tab"),
  views: {
    dashboard: document.querySelector("#dashboardView"),
    data: document.querySelector("#dataView")
  },
  trackerList: document.querySelector("#trackerList"),
  participantMetric: document.querySelector("#participantMetric"),
  participantDelta: document.querySelector("#participantDelta"),
  snapshotMetric: document.querySelector("#snapshotMetric"),
  lastCaptureMetric: document.querySelector("#lastCaptureMetric"),
  optionMetric: document.querySelector("#optionMetric"),
  visibilityMetric: document.querySelector("#visibilityMetric"),
  leaderMetric: document.querySelector("#leaderMetric"),
  leaderFoot: document.querySelector("#leaderFoot"),
  trendCanvas: document.querySelector("#trendCanvas"),
  optionVoteCanvas: document.querySelector("#optionVoteCanvas"),
  optionChartScroll: document.querySelector("#optionChartScroll"),
  optionTrendStatus: document.querySelector("#optionTrendStatus"),
  optionLegend: document.querySelector("#optionLegend"),
  segments: document.querySelectorAll(".segment"),
  optionSegments: document.querySelectorAll("[data-opt-mode]"),
  rankingList: document.querySelector("#rankingList"),
  rankingStatus: document.querySelector("#rankingStatus"),
  exportRankingBtn: document.querySelector("#exportRankingBtn"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  clearHighlightBtn: document.querySelector("#clearHighlightBtn"),
  refreshBtn: document.querySelector("#refreshBtn"),
  refreshStatus: document.querySelector("#refreshStatus"),
  dataRows: document.querySelector("#dataRows"),
  rowCount: document.querySelector("#rowCount")
};

let state = {
  rows: [],
  selectedKey: "",
  chartMode: "participants",
  optionMode: "votes",
  activeOptionIds: new Set(),
  hoverSnapIndex: null
};

let dragState = null;

// ── CSV parsing ──────────────────────────────────────────────────────────────

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (quoted && ch === '"' && next === '"') { cell += '"'; i++; }
    else if (ch === '"') { quoted = !quoted; }
    else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some(v => v.trim())) rows.push(row);
      row = []; cell = "";
    } else { cell += ch; }
  }
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map(h => h.trim());
  return rows.map(values => {
    const item = {};
    headers.forEach((h, i) => { item[h] = values[i] ?? ""; });
    return normalizeRow(item);
  }).filter(r => r.captured_at && r.option);
}

function normalizeRow(item) {
  const option = String(item.option || "");
  return {
    captured_at: String(item.captured_at || ""),
    topic_id: String(item.topic_id || ""),
    poll_id: String(item.poll_id || ""),
    participant_count: toNumber(item.participant_count),
    result_visible: String(item.result_visible).toLowerCase() === "true",
    option_id: option,
    option,
    votes: toOptionalNumber(item.votes),
    percent: toOptionalNumber(String(item.percent || "").replace("%", "")),
    note: String(item.note || "")
  };
}

function toNumber(v) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function toOptionalNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toCsv(rows) {
  const headers = ["captured_at","topic_id","poll_id","participant_count","result_visible","option_id","option","votes","percent","note"];
  return [headers.join(","), ...rows.map(r => headers.map(h => csvEscape(r[h] ?? "")).join(","))].join("\n") + "\n";
}
function csvEscape(v) {
  const t = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replaceAll('"','""')}"` : t;
}

// ── Data grouping ────────────────────────────────────────────────────────────

function trackerKey(row) { return `${row.topic_id||"unknown"}:${row.poll_id||"poll"}`; }

function groupedRows() {
  const groups = new Map();
  state.rows.forEach(row => {
    const key = trackerKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

function currentRows() {
  const key = state.selectedKey || [...groupedRows().keys()][0] || "";
  return key ? state.rows.filter(r => trackerKey(r) === key) : [];
}

function snapshots(rows = currentRows()) {
  const map = new Map();
  rows.forEach(r => {
    if (!map.has(r.captured_at)) map.set(r.captured_at, []);
    map.get(r.captured_at).push(r);
  });
  return [...map.entries()]
    .map(([time, items]) => ({ time, items }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}

function latestSnapshot() { const s = snapshots(); return s[s.length-1] || null; }

function optionList(rows = currentRows()) {
  const byId = new Map();
  rows.forEach(r => byId.set(r.option_id || r.option, r));
  return [...byId.values()];
}

function mergeRows(base, incoming) {
  const byKey = new Map();
  [...base, ...incoming].forEach(r => {
    const key = [r.captured_at, r.topic_id, r.poll_id, r.option_id || r.option].join("|");
    byKey.set(key, r);
  });
  return [...byKey.values()].sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
}

// ── Storage ──────────────────────────────────────────────────────────────────

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: state.rows, selectedKey: state.selectedKey }));
}

function loadStored() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      state.rows = Array.isArray(parsed.rows) ? parsed.rows.map(normalizeRow) : [];
      state.selectedKey = parsed.selectedKey || "";
      return true;
    } catch { localStorage.removeItem(STORAGE_KEY); }
  }
  return false;
}

async function fetchCsv() {
  for (const path of ["../douban_poll_log.csv", "./douban_poll_log.csv"]) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (res.ok) {
        const rows = parseCsv(await res.text());
        if (rows.length) return rows;
      }
    } catch { /* ignore */ }
  }
  return null;
}

async function load() {
  loadStored();
  state.rows = mergeRows(state.rows, parseCsv(sampleCsv).filter(r => r.participant_count !== 0));
  const rows = await fetchCsv();
  console.log("[poll-ledger] fetchCsv returned", rows ? `${rows.length} rows` : "null");
  if (rows) {
    state.rows = mergeRows(state.rows, rows);
    state.selectedKey = [...groupedRows().keys()][0] || "";
    console.log("[poll-ledger] total rows after merge:", state.rows.length, "groups:", groupedRows().size);
    return;
  }
  state.selectedKey = [...groupedRows().keys()][0] || "";
}

// ── View / render ─────────────────────────────────────────────────────────────

function setView(name) {
  els.tabs.forEach(t => t.classList.toggle("is-active", t.dataset.view === name));
  Object.entries(els.views).forEach(([k, v]) => v && v.classList.toggle("is-visible", k === name));
}

function render() {
  if (!state.selectedKey) state.selectedKey = [...groupedRows().keys()][0] || "";
  renderTrackers();
  renderMetrics();
  renderRanking();
  renderTable();
  drawChart();
  drawOptionChart();
  save();
}

function renderTrackers() {
  const groups = groupedRows();
  els.trackerList.innerHTML = "";
  groups.forEach((rows, key) => {
    const latest = snapshots(rows).at(-1);
    const btn = document.createElement("button");
    btn.className = "tracker-item";
    btn.type = "button";
    btn.innerHTML = `<strong>${escapeHtml(rows[0].topic_id || "未命名投票")}</strong><span>${latest ? formatDate(latest.time) : "尚未记录"} · ${rows[0].poll_id || "poll"}</span>`;
    btn.addEventListener("click", () => { state.selectedKey = key; render(); });
    if (key === state.selectedKey) btn.style.borderColor = "#85b79c";
    els.trackerList.append(btn);
  });
}

function renderMetrics() {
  const snaps = snapshots();
  const latest = snaps.at(-1);
  const previous = snaps.at(-2);
  const latestRows = latest?.items || [];
  const participant = latestRows[0]?.participant_count ?? 0;
  const previousParticipant = previous?.items[0]?.participant_count ?? participant;
  const delta = participant - previousParticipant;
  const visible = latestRows.some(r => r.result_visible || r.votes !== null || r.percent !== null);
  const leaders = latestRows.filter(r => r.votes !== null).sort((a, b) => b.votes - a.votes);

  els.participantMetric.textContent = participant ? participant.toLocaleString("zh-CN") : "-";
  els.participantDelta.textContent = snaps.length > 1 ? `${delta >= 0 ? "+" : ""}${delta.toLocaleString("zh-CN")} 较上次` : "首条记录";
  els.snapshotMetric.textContent = snaps.length || "-";
  els.lastCaptureMetric.textContent = latest ? formatDate(latest.time) : "尚未记录";
  els.optionMetric.textContent = optionList().length || "-";
  els.visibilityMetric.textContent = visible ? "已记录票数" : "只见参与人数";
  els.leaderMetric.textContent = leaders[0]?.option || "-";
  els.leaderFoot.textContent = leaders[0] ? `${leaders[0].votes.toLocaleString("zh-CN")} 票` : "等待票数";
}

function renderRanking() {
  const snaps = snapshots();
  const latest = snaps.at(-1);
  const previous = snaps.at(-2);
  els.rankingList.innerHTML = "";

  if (!latest) { els.rankingStatus.textContent = "尚无记录"; return; }

  const latestRows = (latest.items || []).filter(r => r.votes !== null && r.votes !== undefined);
  if (latestRows.length === 0) { els.rankingStatus.textContent = "暂无票数，结果未可见"; return; }

  const sorted = [...latestRows].sort((a, b) => b.votes - a.votes);
  const maxVotes = Math.max(1, sorted[0].votes);

  const previousRank = new Map();
  if (previous) {
    (previous.items || [])
      .filter(r => r.votes !== null && r.votes !== undefined)
      .sort((a, b) => b.votes - a.votes)
      .forEach((r, idx) => previousRank.set(r.option_id || r.option, idx + 1));
  }

  sorted.forEach((row, idx) => {
    const rank = idx + 1;
    const prev = previousRank.get(row.option_id || row.option);
    const delta = prev ? prev - rank : 0;
    const deltaIcon = !prev ? "" : delta > 0 ? "▲"+delta : delta < 0 ? "▼"+Math.abs(delta) : "–";
    const deltaClass = !prev ? "is-flat" : delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat";
    const width = Math.max(4, Math.round((row.votes / maxVotes) * 100));
    const li = document.createElement("li");
    li.className = "ranking-item" + (rank <= 3 ? " is-top" : "");
    li.innerHTML = `
      <span class="ranking-rank">${rank}</span>
      <span class="ranking-main">
        <span class="ranking-name">${escapeHtml(row.option)}</span>
        <span class="ranking-bar" aria-hidden="true"><span style="width:${width}%"></span></span>
      </span>
      <span class="ranking-meta">
        <span class="ranking-votes">${row.votes.toLocaleString("zh-CN")} 票${prev ? `<span class="ranking-delta ${deltaClass}">${deltaIcon}</span>` : ""}</span>
        <span class="ranking-percent">${row.percent === null ? "" : `${row.percent}%`}</span>
      </span>
    `;
    els.rankingList.append(li);
  });

  const totalVotes = sorted.reduce((s, r) => s + r.votes, 0);
  els.rankingStatus.textContent = `共 ${sorted.length} 项 · ${totalVotes.toLocaleString("zh-CN")} 票`;
}

function renderTable() {
  const rows = [...currentRows()].sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
  els.rowCount.textContent = `${rows.length} 行`;
  els.dataRows.innerHTML = "";
  rows.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(formatDate(row.captured_at))}</td>
      <td>${row.participant_count.toLocaleString("zh-CN")}</td>
      <td>${escapeHtml(row.option)}</td>
      <td>${row.votes === null ? "" : row.votes.toLocaleString("zh-CN")}</td>
      <td>${row.percent === null ? "" : `${row.percent}%`}</td>
      <td>${escapeHtml(row.note)}</td>
    `;
    els.dataRows.append(tr);
  });
}

// ── Charts ────────────────────────────────────────────────────────────────────

function drawChart() {
  const canvas = els.trendCanvas;
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 980, H = canvas.clientHeight || 320;
  canvas.width = Math.floor(W * ratio);
  canvas.height = Math.floor(H * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const pad = { top: 22, right: 24, bottom: 42, left: 58 };
  const w = W - pad.left - pad.right, h = H - pad.top - pad.bottom;
  const snaps = snapshots();
  const values = snaps.map(snap =>
    state.chartMode === "votes"
      ? snap.items.reduce((s, r) => s + (r.votes || 0), 0)
      : snap.items[0]?.participant_count || 0
  );
  const max = Math.max(1, ...values), min = Math.min(...values, max), span = Math.max(1, max - min);

  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#d9dfdc"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (h/4)*i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left+w, y); ctx.stroke();
  }
  ctx.fillStyle = "#68736e"; ctx.font = "12px system-ui";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    ctx.fillText(Math.round(max-(span/4)*i).toLocaleString("zh-CN"), pad.left-10, pad.top+(h/4)*i);
  }
  if (!snaps.length) {
    ctx.fillStyle = "#68736e"; ctx.textAlign = "center";
    ctx.fillText("暂无记录", W/2, H/2); return;
  }

  const points = values.map((v, i) => ({
    x: pad.left + (snaps.length===1 ? w/2 : (w/(snaps.length-1))*i),
    y: pad.top + h - ((v-min)/span)*h,
    time: snaps[i].time
  }));

  const grad = ctx.createLinearGradient(pad.left, 0, pad.left+w, 0);
  grad.addColorStop(0, "#167447"); grad.addColorStop(0.55, "#2c6f99"); grad.addColorStop(1, "#a97619");
  ctx.strokeStyle = grad; ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((p, i) => i===0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  ctx.fillStyle = "#68736e"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText(formatShortDate(points[0].time), points[0].x, pad.top+h+14);
  if (points.length > 1) ctx.fillText(formatShortDate(points.at(-1).time), points.at(-1).x, pad.top+h+14);
}


function drawOptionChart() {
  const canvas = els.optionVoteCanvas;
  const legend = els.optionLegend;
  const status = els.optionTrendStatus;
  if (!canvas || !legend) return;

  const mode = state.optionMode;
  const voteSnaps = snapshots().filter(s => s.items.some(r => r.votes !== null));

  // Width: use the scroll-wrap's visible width as the floor so the chart fills
  // the panel; when there are many snapshots, neededW exceeds visibleW and the
  // canvas overflows -> horizontal scrollbar kicks in.
  const visibleW = canvas.parentElement?.clientWidth || 600;
  const spacing = 100;
  const neededW = Math.max(visibleW, (voteSnaps.length - 1) * spacing + 200);
  const W = neededW, H = canvas.clientHeight || 420;

  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(W * ratio);
  canvas.height = Math.floor(H * ratio);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const options = optionList().map((row, i) => ({
    id: row.option_id || row.option,
    name: row.option,
    color: OPTION_COLORS[i % OPTION_COLORS.length]
  }));

  const latestSnap = voteSnaps.at(-1);
  const previousSnap = voteSnaps.at(-2);

  legend.innerHTML = "";
  options.forEach(option => {
    const latestRow = latestSnap?.items.find(r => (r.option_id||r.option) === option.id);
    const previousRow = previousSnap?.items.find(r => (r.option_id||r.option) === option.id);
    const latestVotes = latestRow?.votes ?? null;
    const previousVotes = previousRow?.votes ?? null;
    const intervalGrowth = latestVotes !== null && previousVotes !== null ? latestVotes - previousVotes : null;
    const isActive = state.activeOptionIds.has(option.id);
    const item = document.createElement("div");
    item.className = "legend-item" + (isActive ? " is-highlighted" : "");
    item.dataset.optionId = option.id;
    item.innerHTML = `
      <span class="legend-swatch" style="background:${option.color}"></span>
      <span class="legend-name" title="${escapeAttr(option.name)}">${escapeHtml(option.name)}</span>
      <span class="legend-value">${latestVotes === null ? "-" : `${latestVotes.toLocaleString("zh-CN")} 票`}${intervalGrowth === null ? "" : ` · 上轮 ${intervalGrowth >= 0 ? "+" : ""}${intervalGrowth}`}</span>
    `;
    item.addEventListener("click", () => {
      if (state.activeOptionIds.has(option.id)) state.activeOptionIds.delete(option.id);
      else state.activeOptionIds.add(option.id);
      drawOptionChart();
    });
    legend.append(item);
  });

  const pad = { top: 24, right: 28, bottom: 44, left: 60 };
  const w = W - pad.left - pad.right, h = H - pad.top - pad.bottom;

  // Build series based on mode. Both modes share the same x-coordinate system
  // (index into voteSnaps), so toggling between them keeps positions stable.
  const seriesList = [];
  let yFor, gridVals, zeroY;

  if (mode === "growth") {
    const allGrowth = [];
    options.forEach(opt => {
      const points = [];
      for (let i = 1; i < voteSnaps.length; i++) {
        const prev = voteSnaps[i-1].items.find(r => (r.option_id||r.option) === opt.id);
        const curr = voteSnaps[i].items.find(r => (r.option_id||r.option) === opt.id);
        if (prev?.votes != null && curr?.votes != null) {
          const growth = curr.votes - prev.votes;
          points.push({ snapIndex: i, value: growth, votes: curr.votes, time: voteSnaps[i].time });
          allGrowth.push(growth);
        }
      }
      seriesList.push({ id: opt.id, name: opt.name, color: opt.color, points });
    });
    const maxAbs = Math.max(1, ...allGrowth.map(Math.abs));
    zeroY = pad.top + h/2;
    yFor = v => zeroY - (v / maxAbs) * (h/2);
    gridVals = [maxAbs, maxAbs/2, 0, -maxAbs/2, -maxAbs];
  } else {
    const allVotes = [];
    options.forEach(opt => {
      const points = [];
      voteSnaps.forEach((snap, i) => {
        const r = snap.items.find(item => (item.option_id||item.option) === opt.id);
        if (r?.votes != null) {
          points.push({ snapIndex: i, value: r.votes, votes: r.votes, time: snap.time });
          allVotes.push(r.votes);
        }
      });
      seriesList.push({ id: opt.id, name: opt.name, color: opt.color, points });
    });
    const max = Math.max(1, ...allVotes);
    zeroY = pad.top + h;
    yFor = v => pad.top + h - (v / max) * h;
    gridVals = [max, max*3/4, max/2, max/4, 0];
  }

  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#d9dfdc"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (h/4)*i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left+w, y); ctx.stroke();
  }
  if (mode === "growth") {
    ctx.strokeStyle = "#b8c5be";
    ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(pad.left+w, zeroY); ctx.stroke();
  }

  ctx.fillStyle = "#68736e"; ctx.font = "12px system-ui";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const val = gridVals[i];
    const label = mode === "growth"
      ? (val > 0 ? "+" : "") + Math.round(val).toLocaleString("zh-CN")
      : Math.round(val).toLocaleString("zh-CN");
    ctx.fillText(label, pad.left-10, pad.top+(h/4)*i);
  }

  if (!voteSnaps.length || (mode === "growth" && voteSnaps.length < 2)) {
    status.textContent = mode === "growth" ? "需要至少 2 个快照" : "尚无可见票数";
    ctx.fillStyle = "#68736e"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(mode === "growth" ? "快照不足，无法计算增长" : "等页面显示票数后，这里会绘制折线图", W/2, H/2);
    canvas._chartMeta = null;
    return;
  }

  status.textContent = mode === "growth"
    ? `${voteSnaps.length} 个快照 · 显示相邻快照票数增量`
    : `${voteSnaps.length} 个票数快照`;

  const xFor = i => pad.left + (voteSnaps.length === 1 ? w/2 : (w/(voteSnaps.length-1))*i);
  const hasActive = state.activeOptionIds.size > 0;

  seriesList.forEach(opt => {
    const isActive = state.activeOptionIds.has(opt.id);
    if (!opt.points.length) return;
    ctx.strokeStyle = hasActive && !isActive ? opt.color + "28" : opt.color;
    ctx.lineWidth = isActive ? 3 : 1.5;
    ctx.beginPath();
    opt.points.forEach((p, i) => {
      const x = xFor(p.snapIndex), y = yFor(p.value);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (isActive) {
      const last = opt.points.at(-1);
      const lx = xFor(last.snapIndex), ly = yFor(last.value);
      ctx.font = "bold 12px system-ui";
      ctx.textBaseline = "middle";
      const label = opt.name.length > 12 ? opt.name.slice(0,12)+"…" : opt.name;
      const lw = ctx.measureText(label).width;
      const bx = Math.min(lx + 8, W - lw - 6);
      ctx.fillStyle = opt.color + "22";
      ctx.beginPath();
      ctx.roundRect(bx - 4, ly - 10, lw + 8, 20, 4);
      ctx.fill();
      ctx.fillStyle = opt.color;
      ctx.textAlign = "left";
      ctx.fillText(label, bx, ly);
    }
  });

  ctx.fillStyle = "#68736e"; ctx.font = "12px system-ui";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  // Show ~8 evenly spaced x-axis labels (first, last, and intermediates).
  const labelStep = Math.max(1, Math.ceil(voteSnaps.length / 8));
  for (let i = 0; i < voteSnaps.length; i += labelStep) {
    ctx.fillText(formatShortDate(voteSnaps[i].time), xFor(i), pad.top+h+14);
  }
  if (voteSnaps.length > 1 && (voteSnaps.length - 1) % labelStep !== 0) {
    ctx.fillText(formatShortDate(voteSnaps.at(-1).time), xFor(voteSnaps.length-1), pad.top+h+14);
  }

  if (state.hoverSnapIndex !== null && state.hoverSnapIndex >= 0 && state.hoverSnapIndex < voteSnaps.length) {
    const snap = voteSnaps[state.hoverSnapIndex];
    const vx = xFor(state.hoverSnapIndex);
    ctx.strokeStyle = "#85b79c";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(vx, pad.top);
    ctx.lineTo(vx, pad.top + h);
    ctx.stroke();
    ctx.setLineDash([]);

    const hasSelection = state.activeOptionIds.size > 0;
    const visibleOpts = hasSelection
      ? options.filter(opt => state.activeOptionIds.has(opt.id))
      : options;
    const lines = [formatShortDate(snap.time)];
    visibleOpts.forEach(opt => {
      const r = snap.items.find(item => (item.option_id||item.option) === opt.id);
      if (r && r.votes !== null) {
        if (mode === "growth" && state.hoverSnapIndex > 0) {
          const prevSnap = voteSnaps[state.hoverSnapIndex - 1];
          const prevRow = prevSnap?.items.find(item => (item.option_id||item.option) === opt.id);
          const growth = prevRow?.votes != null ? r.votes - prevRow.votes : null;
          lines.push(`${opt.name}: ${r.votes.toLocaleString("zh-CN")} 票${growth !== null ? ` (${growth >= 0 ? "+" : ""}${growth})` : ""}`);
        } else {
          lines.push(`${opt.name}: ${r.votes.toLocaleString("zh-CN")} 票`);
        }
      }
    });
    ctx.font = "12px system-ui";
    const lineH = 16;
    const boxW = Math.min(320, Math.max(...lines.map(l => ctx.measureText(l).width)) + 16);
    const boxH = lines.length * lineH + 10;
    let boxX = vx + 10;
    if (boxX + boxW > W - 4) boxX = vx - boxW - 10;
    const boxY = pad.top + 6;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.strokeStyle = "#d9dfdc";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      ctx.fillStyle = "#17201c";
      ctx.font = i === 0 ? "bold 12px system-ui" : "12px system-ui";
      ctx.fillText(line, boxX + 8, boxY + 6 + i * lineH);
    });
  }

  canvas._chartMeta = { seriesList, xFor, yFor, voteSnaps, mode };
}


// ── Ranking export ─────────────────────────────────────────────────────────────

function exportRankingImage() {
  const list = els.rankingList;
  if (!list || !list.children.length) return;
  const items = [...list.querySelectorAll(".ranking-item")];
  const ratio = 2;
  const itemH = 52, gap = 6;
  const pad = { x: 24, top: 52, bottom: 24 };
  const itemW = Math.min(Math.max(list.clientWidth || 600, 360), 760);
  const totalH = pad.top + items.length*(itemH+gap) - gap + pad.bottom;
  const canvas = document.createElement("canvas");
  canvas.width = (itemW + pad.x*2) * ratio;
  canvas.height = totalH * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const GOLD = "#a97619", GREEN = "#167447";

  ctx.fillStyle = "#f4f6f5";
  ctx.fillRect(0, 0, itemW + pad.x*2, totalH);

  ctx.fillStyle = "#17201c"; ctx.font = "bold 16px system-ui";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("当前排名", pad.x, 28);
  ctx.fillStyle = "#68736e"; ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  ctx.fillText(els.rankingStatus.textContent, itemW + pad.x, 28);

  items.forEach((item, idx) => {
    const y = pad.top + idx*(itemH+gap);
    const isTop = item.classList.contains("is-top");

    ctx.fillStyle = "#ffffff";
    roundRect(ctx, pad.x, y, itemW, itemH, 8); ctx.fill();
    if (isTop) {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
      roundRect(ctx, pad.x, y, itemW, itemH, 8); ctx.stroke();
    }

    const cx = pad.x + 30, cy = y + itemH/2;
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI*2);
    ctx.fillStyle = isTop ? GOLD : "#eef3ef"; ctx.fill();
    ctx.fillStyle = isTop ? "#2a2a2a" : "#68736e";
    ctx.font = "bold 13px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(idx+1), cx, cy);

    const name = item.querySelector(".ranking-name")?.textContent?.trim() || "";
    ctx.fillStyle = "#17201c"; ctx.font = "600 13px system-ui";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(name.length > 18 ? name.slice(0,18)+"…" : name, pad.x+50, y + itemH/2 - 8);

    const barEl = item.querySelector(".ranking-bar span");
    const pct = barEl ? parseFloat(barEl.style.width) : 0;
    const barW = Math.max(4, ((itemW - 50 - 90) * pct) / 100);
    const barY = y + itemH/2 + 8;
    ctx.fillStyle = "#e8eeeb";
    roundRect(ctx, pad.x+50, barY-3, itemW-50-90, 6, 3); ctx.fill();
    const grad = ctx.createLinearGradient(pad.x+50, 0, pad.x+50+barW, 0);
    grad.addColorStop(0, GREEN); grad.addColorStop(1, GOLD);
    ctx.fillStyle = grad;
    roundRect(ctx, pad.x+50, barY-3, barW, 6, 3); ctx.fill();

    const votesText = [...(item.querySelector(".ranking-votes")?.childNodes||[])].filter(n=>n.nodeType===3).map(n=>n.textContent).join("").trim();
    const pctText = item.querySelector(".ranking-percent")?.textContent?.trim() || "";
    ctx.fillStyle = "#17201c"; ctx.font = "600 13px system-ui";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(votesText, pad.x+itemW-4, y+itemH/2-8);
    ctx.fillStyle = "#68736e"; ctx.font = "12px system-ui";
    ctx.fillText(pctText, pad.x+itemW-4, y+itemH/2+8);
  });

  const link = document.createElement("a");
  link.download = `ranking_${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x, y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

function exportDataCsv() {
  const rows = currentRows();
  if (!rows.length) return;
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `douban_poll_log_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Manual refresh ─────────────────────────────────────────────────────────────

async function manualRefresh() {
  if (els.refreshBtn) {
    els.refreshBtn.disabled = true;
    els.refreshBtn.textContent = "刷新中…";
  }
  if (els.refreshStatus) els.refreshStatus.textContent = "";
  const rows = await fetchCsv();
  if (rows) {
    state.rows = mergeRows(state.rows, rows);
    render();
    if (els.refreshStatus) els.refreshStatus.textContent = `已更新 · ${formatDate(new Date().toISOString())}`;
  } else {
    if (els.refreshStatus) els.refreshStatus.textContent = "获取失败，请稍后重试";
  }
  if (els.refreshBtn) {
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "刷新数据";
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function escapeAttr(v) { return escapeHtml(v).replaceAll("'","&#39;"); }

function formatDate(v) {
  const d = new Date(v);
  if (!Number.isFinite(d.valueOf())) return v || "";
  return new Intl.DateTimeFormat("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);
}
function formatShortDate(v) {
  const d = new Date(v);
  if (!Number.isFinite(d.valueOf())) return "";
  return new Intl.DateTimeFormat("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);
}

// ── Event binding ─────────────────────────────────────────────────────────────

function bindEvents() {
  els.tabs.forEach(tab => tab.addEventListener("click", () => setView(tab.dataset.view)));

  els.segments.forEach(seg => {
    seg.addEventListener("click", () => {
      state.chartMode = seg.dataset.chart;
      els.segments.forEach(s => s.classList.toggle("is-active", s === seg));
      drawChart();
    });
  });

  els.optionSegments.forEach(seg => {
    seg.addEventListener("click", () => {
      state.optionMode = seg.dataset.optMode;
      els.optionSegments.forEach(s => s.classList.toggle("is-active", s === seg));
      state.hoverSnapIndex = null;
      drawOptionChart();
    });
  });

  if (els.refreshBtn) els.refreshBtn.addEventListener("click", manualRefresh);
  if (els.exportRankingBtn) els.exportRankingBtn.addEventListener("click", exportRankingImage);
  if (els.exportCsvBtn) els.exportCsvBtn.addEventListener("click", exportDataCsv);
  if (els.clearHighlightBtn) els.clearHighlightBtn.addEventListener("click", () => {
    state.activeOptionIds.clear();
    drawOptionChart();
  });

  // Canvas interactions: click line to toggle highlight, hover for tooltip,
  // drag to pan horizontally when the chart overflows its scroll-wrap.
  if (els.optionVoteCanvas) {
    const canvas = els.optionVoteCanvas;
    const scrollWrap = canvas.parentElement;

    const pointXY = p => {
      const meta = canvas._chartMeta;
      if (!meta) return null;
      return { x: meta.xFor(p.snapIndex), y: meta.yFor(p.value) };
    };

    const findNearestOption = (mx, my) => {
      const meta = canvas._chartMeta;
      if (!meta) return { id: null, dist: Infinity };
      let closestId = null, minDist = Infinity;
      meta.seriesList.forEach(opt => {
        opt.points.forEach(p => {
          const xy = pointXY(p);
          if (!xy) return;
          const d = Math.hypot(mx - xy.x, my - xy.y);
          if (d < minDist) { minDist = d; closestId = opt.id; }
        });
      });
      return { id: closestId, dist: minDist };
    };

    const findNearestSnap = mx => {
      const meta = canvas._chartMeta;
      if (!meta || !meta.voteSnaps?.length) return null;
      let nearestIdx = 0, minXDist = Infinity;
      meta.voteSnaps.forEach((_, i) => {
        const d = Math.abs(mx - meta.xFor(i));
        if (d < minXDist) { minXDist = d; nearestIdx = i; }
      });
      return nearestIdx;
    };

    canvas.addEventListener("mousedown", event => {
      const meta = canvas._chartMeta;
      if (!meta) return;
      dragState = {
        startX: event.clientX,
        scrollLeft: scrollWrap?.scrollLeft ?? 0,
        moved: false
      };
    });

    canvas.addEventListener("mousemove", event => {
      const meta = canvas._chartMeta;
      if (!meta) return;
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left, my = event.clientY - rect.top;

      if (dragState) {
        const dx = event.clientX - dragState.startX;
        if (Math.abs(dx) > 5) {
          dragState.moved = true;
          canvas.classList.add("is-dragging");
          if (scrollWrap) scrollWrap.scrollLeft = dragState.scrollLeft - dx;
        }
        return;
      }

      const { dist } = findNearestOption(mx, my);
      canvas.style.cursor = dist < 32 ? "pointer" : "grab";

      const chartLeft = 60, chartRight = meta.xFor(meta.voteSnaps.length - 1);
      if (mx < chartLeft - 20 || mx > chartRight + 20) {
        if (state.hoverSnapIndex !== null) {
          state.hoverSnapIndex = null;
          drawOptionChart();
        }
        return;
      }
      const nearestIdx = findNearestSnap(mx);
      if (nearestIdx !== null && state.hoverSnapIndex !== nearestIdx) {
        state.hoverSnapIndex = nearestIdx;
        drawOptionChart();
      }
    });

    canvas.addEventListener("mouseup", event => {
      if (!dragState) return;
      const wasMoved = dragState.moved;
      dragState = null;
      canvas.classList.remove("is-dragging");

      if (wasMoved) return;

      const meta = canvas._chartMeta;
      if (!meta) return;
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left, my = event.clientY - rect.top;
      const { id, dist } = findNearestOption(mx, my);
      if (dist < 32 && id) {
        if (state.activeOptionIds.has(id)) state.activeOptionIds.delete(id);
        else state.activeOptionIds.add(id);
        drawOptionChart();
      }
    });

    canvas.addEventListener("mouseleave", () => {
      if (dragState) { dragState = null; canvas.classList.remove("is-dragging"); }
      if (state.hoverSnapIndex !== null) {
        state.hoverSnapIndex = null;
        drawOptionChart();
      }
    });
  }

  window.addEventListener("resize", () => { drawChart(); drawOptionChart(); });



  // Auto-refresh every 10 minutes
  setInterval(async () => {
    const rows = await fetchCsv();
    if (rows) { state.rows = mergeRows(state.rows, rows); render(); }
  }, 10 * 60 * 1000);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

load().then(() => { bindEvents(); render(); });
