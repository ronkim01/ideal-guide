/* ============================================================
   매매일지 — 앱 로직
   저장소: Supabase (내 계정 1개, RLS로 내 기록만 접근)
   ============================================================ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const TAGS = ["계획대로", "추세추종", "돌파", "역추세", "분할매수",
              "손절지연", "FOMO", "뇌동매매", "익절조급", "레버리지과다"];

const state = {
  trades: [],
  tab: "today",
  editingId: null,
  side: "long",
  tags: [],
  currency: localStorage.getItem("mj.currency") || "USDT",
  filters: { period: "all", symbol: "all", side: "all", result: "all" },
};

/* ── 유틸 ─────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const monthKey = (iso) => iso.slice(0, 7);
const shortDate = (iso) => iso.slice(5).replace("-", ".");

function money(v, opts = {}) {
  const { sign = false, unit = true } = opts;
  const n = Number(v) || 0;
  const krw = state.currency === "KRW";
  const abs = Math.abs(n).toLocaleString("ko-KR", {
    minimumFractionDigits: krw ? 0 : 2,
    maximumFractionDigits: krw ? 0 : 2,
  });
  const mark = n > 0 ? "+" : n < 0 ? "−" : "";
  const sym = unit ? (krw ? "₩" : "$") : "";
  return (sign ? mark : n < 0 ? "−" : "") + sym + abs;
}

const toneOf = (n) => (n > 0 ? "up" : n < 0 ? "down" : "flat");
const RESULT_KO = { win: "승", draw: "무", lose: "패" };
const deriveResult = (pnl) => (pnl > 0 ? "win" : pnl < 0 ? "lose" : "draw");

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ── 로그인 ───────────────────────────────── */
const authView = $("#authView");
const appView = $("#appView");

$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#authBtn"), msg = $("#authMsg");
  btn.disabled = true; btn.textContent = "로그인 중...";
  msg.textContent = ""; msg.className = "msg";

  const { error } = await supabase.auth.signInWithPassword({
    email: $("#authEmail").value.trim(),
    password: $("#authPw").value,
  });

  btn.disabled = false; btn.textContent = "로그인";
  if (error) {
    msg.className = "msg err";
    msg.textContent = error.message.includes("Invalid login")
      ? "이메일 또는 비밀번호가 맞지 않습니다."
      : "로그인 실패: " + error.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
});

function showAuth() {
  authView.hidden = false;
  appView.hidden = true;
  state.trades = [];
}

async function showApp() {
  authView.hidden = true;
  appView.hidden = false;
  await loadTrades();
}

/* ── 데이터 ───────────────────────────────── */
async function loadTrades() {
  $("#syncMsg").textContent = "불러오는 중...";
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .order("traded_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(3000);

  if (error) {
    $("#syncMsg").textContent =
      error.code === "PGRST205"
        ? "⚠️ trades 테이블이 없습니다. supabase-setup.sql을 실행하세요."
        : "불러오기 오류: " + error.message;
    return;
  }
  state.trades = data || [];
  $("#syncMsg").textContent = `총 ${state.trades.length}건 · 마지막 동기화 ${new Date().toLocaleTimeString("ko-KR")}`;
  refreshSymbolList();
  render();
}

async function saveTrade(payload) {
  if (state.editingId) {
    return supabase.from("trades").update(payload).eq("id", state.editingId);
  }
  return supabase.from("trades").insert(payload);
}

async function deleteTrade(id) {
  const t = state.trades.find((x) => x.id === id);
  if (!confirm(`${t.traded_at} ${t.symbol} 기록을 삭제할까요?`)) return;
  const { error } = await supabase.from("trades").delete().eq("id", id);
  if (error) return toast("삭제 실패: " + error.message);
  toast("삭제했습니다");
  await loadTrades();
}

/* ── 입력 폼 ──────────────────────────────── */
const form = $("#tradeForm");

function renderTagPicks() {
  $("#tagPicks").innerHTML = TAGS.map((t) =>
    `<button type="button" class="chip${state.tags.includes(t) ? " is-on" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`
  ).join("");
}

$("#tagPicks").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tag]");
  if (!btn) return;
  const tag = btn.dataset.tag;
  state.tags = state.tags.includes(tag) ? state.tags.filter((t) => t !== tag) : [...state.tags, tag];
  renderTagPicks();
});

$$(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.side = btn.dataset.pos;
    $$(".seg-btn").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", String(on));
    });
  });
});

function resetForm() {
  state.editingId = null;
  state.tags = [];
  state.side = "long";
  form.reset();
  $("#fDate").value = localDate();
  $("#fResult").value = "auto";
  $$(".seg-btn").forEach((b) => {
    const on = b.dataset.pos === "long";
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-checked", String(on));
  });
  $("#entryTitle").textContent = "✍️ 매매 기록";
  $("#saveBtn").textContent = "기록하기";
  $("#cancelEdit").hidden = true;
  renderTagPicks();
}

function startEdit(id) {
  const t = state.trades.find((x) => x.id === id);
  if (!t) return;
  state.editingId = id;
  state.side = t.position;
  state.tags = [...(t.tags || [])];
  $("#fDate").value = t.traded_at;
  $("#fSymbol").value = t.symbol;
  $("#fPnl").value = t.pnl;
  $("#fMemo").value = t.memo || "";
  $("#fResult").value = t.result === deriveResult(Number(t.pnl)) ? "auto" : t.result;
  $$(".seg-btn").forEach((b) => {
    const on = b.dataset.pos === t.position;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-checked", String(on));
  });
  $("#entryTitle").textContent = "✏️ 기록 수정";
  $("#saveBtn").textContent = "수정 저장";
  $("#cancelEdit").hidden = false;
  renderTagPicks();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#cancelEdit").addEventListener("click", resetForm);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pnl = Number($("#fPnl").value);
  if (!Number.isFinite(pnl)) return toast("손익을 숫자로 입력하세요");

  const pick = $("#fResult").value;
  const payload = {
    traded_at: $("#fDate").value || localDate(),
    symbol: $("#fSymbol").value.trim().toUpperCase(),
    position: state.side,
    pnl,
    result: pick === "auto" ? deriveResult(pnl) : pick,
    memo: $("#fMemo").value.trim() || null,
    tags: state.tags,
  };

  const btn = $("#saveBtn");
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = "저장 중...";

  const { error } = await saveTrade(payload);

  btn.disabled = false;
  btn.textContent = label;

  if (error) {
    $("#formMsg").className = "msg err";
    $("#formMsg").textContent = "저장 실패: " + error.message;
    return;
  }
  $("#formMsg").textContent = "";
  toast(state.editingId ? "수정했습니다" : "기록했습니다");
  resetForm();
  await loadTrades();
});

function refreshSymbolList() {
  const syms = [...new Set(state.trades.map((t) => t.symbol))].sort();
  $("#symbolList").innerHTML = syms.map((s) => `<option value="${esc(s)}">`).join("");
}

/* ── 통화 ─────────────────────────────────── */
$("#currency").addEventListener("change", (e) => {
  state.currency = e.target.value;
  try { localStorage.setItem("mj.currency", state.currency); } catch {}
  $("#unitHint").textContent = state.currency === "KRW" ? "(원)" : "(USDT)";
  render();
});

/* ── 탭 ───────────────────────────────────── */
$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.tab = tab.dataset.tab;
    $$(".tab").forEach((t) => {
      const on = t === tab;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-selected", String(on));
    });
    $$(".panel").forEach((p) => { p.hidden = p.dataset.panel !== state.tab; });
    render();
  });
});

/* ── 집계 ─────────────────────────────────── */
function summarize(trades) {
  const wins = trades.filter((t) => t.result === "win");
  const loses = trades.filter((t) => t.result === "lose");
  const draws = trades.filter((t) => t.result === "draw");
  const total = trades.reduce((s, t) => s + Number(t.pnl), 0);
  const decided = wins.length + loses.length;
  const winRate = decided ? wins.length / decided : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + Math.abs(Number(t.pnl)), 0) / wins.length : 0;
  const avgLoss = loses.length ? loses.reduce((s, t) => s + Math.abs(Number(t.pnl)), 0) / loses.length : 0;
  const payoff = avgLoss ? avgWin / avgLoss : null;
  const expectancy = decided ? winRate * avgWin - (1 - winRate) * avgLoss : 0;

  // 시간순 정렬 후 누적 곡선 · 연속패 · 최대낙폭
  const chrono = [...trades].sort((a, b) =>
    a.traded_at === b.traded_at
      ? String(a.created_at).localeCompare(String(b.created_at))
      : a.traded_at.localeCompare(b.traded_at));

  let cum = 0, peak = 0, mdd = 0, streak = 0, maxStreak = 0;
  const curve = chrono.map((t) => {
    cum += Number(t.pnl);
    peak = Math.max(peak, cum);
    mdd = Math.max(mdd, peak - cum);
    streak = t.result === "lose" ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
    return { ...t, cum };
  });

  const best = trades.length ? Math.max(...trades.map((t) => Number(t.pnl))) : 0;
  const worst = trades.length ? Math.min(...trades.map((t) => Number(t.pnl))) : 0;

  return { trades, chrono, curve, total, wins: wins.length, loses: loses.length,
           draws: draws.length, winRate, avgWin, avgLoss, payoff, expectancy,
           mdd, maxStreak, best, worst };
}

/* ── 조각 렌더러 ──────────────────────────── */
function heroTile(label, value, sub) {
  return `<div class="card hero">
    <div class="hero-label">${esc(label)}</div>
    <div class="hero-value ${toneOf(value)}">${money(value, { sign: true })}</div>
    <div class="hero-sub">${esc(sub)}</div>
  </div>`;
}

function tile(label, valueHtml, sub, extra = "") {
  return `<div class="tile">
    <div class="tile-label">${esc(label)}</div>
    <div class="tile-value">${valueHtml}</div>
    ${sub ? `<div class="tile-sub">${esc(sub)}</div>` : ""}
    ${extra}
  </div>`;
}

function winRateTile(s) {
  const pct = (s.winRate * 100).toFixed(1);
  const decided = s.wins + s.loses;
  const meter = decided
    ? `<div class="meter">
         <div class="meter-win" style="width:${(s.wins / decided) * 100}%"></div>
         <div class="meter-lose" style="width:${(s.loses / decided) * 100}%"></div>
       </div>`
    : "";
  return tile("승률", `${decided ? pct : "—"}<span style="font-size:.8rem">%</span>`,
    `${s.wins}승 ${s.draws}무 ${s.loses}패`, meter);
}

function tradeRows(trades, emptyText) {
  if (!trades.length) return `<p class="empty">${esc(emptyText)}</p>`;
  return `<ul class="rows">` + trades.map((t) => {
    const pnl = Number(t.pnl);
    const res = t.result;
    const color = res === "win" ? "var(--profit)" : res === "lose" ? "var(--loss)" : "var(--muted)";
    return `<li class="row">
      <div class="row-date">${esc(shortDate(t.traded_at))}</div>
      <div class="row-main">
        <div class="row-top">
          <span class="row-sym">${esc(t.symbol)}</span>
          <span class="row-pos">${t.position === "long" ? "롱" : "숏"}</span>
          <span class="row-res" style="color:${color}"><i style="background:${color}"></i>${RESULT_KO[res]}</span>
        </div>
        ${t.memo ? `<div class="row-memo">${esc(t.memo)}</div>` : ""}
        ${(t.tags || []).length ? `<div class="row-tags">${t.tags.map((g) => `<span class="row-tag">${esc(g)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="row-right">
        <div class="row-pnl ${toneOf(pnl)}">${money(pnl, { sign: true })}</div>
        <div class="row-acts">
          <button class="icon-btn" data-edit="${t.id}" type="button">수정</button>
          <button class="icon-btn" data-del="${t.id}" type="button">삭제</button>
        </div>
      </div>
    </li>`;
  }).join("") + `</ul>`;
}

function listCard(title, trades, emptyText, cap = 0) {
  const shown = cap && trades.length > cap ? trades.slice(0, cap) : trades;
  const more = trades.length - shown.length;
  return `<div class="card">
    <div class="list-head">
      <h2 class="list-title">${esc(title)}</h2>
      <span class="list-count">${trades.length}건</span>
    </div>
    ${tradeRows(shown, emptyText)}
    ${more > 0 ? `<p class="empty">최근 ${cap}건만 표시했습니다 · ${more}건 더 있음 (필터로 좁혀보세요)</p>` : ""}
  </div>`;
}

/* ── 차트: 누적 손익 곡선 ─────────────────── */
function equityCurveSVG(curve, width) {
  if (curve.length === 0) return `<p class="empty">표시할 기록이 없습니다.</p>`;

  const H = 210, padT = 16, padB = 26, padL = 6;
  // 끝점 금액 라벨이 카드 밖으로 넘치지 않도록 자릿수만큼 오른쪽 여백 확보
  const endLabel = money(curve[curve.length - 1].cum, { sign: true });
  const padR = Math.min(width * 0.42, 22 + endLabel.length * 7.4);
  const plotH = H - padT - padB;
  const plotW = Math.max(60, width - padL - padR);

  const vals = curve.map((p) => p.cum);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.12;
  hi += pad; lo -= pad;

  const x = (i) => padL + (curve.length === 1 ? plotW : (i / (curve.length - 1)) * plotW);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * plotH;
  const zeroY = y(0);

  const pts = curve.map((p, i) => `${x(i).toFixed(1)},${y(p.cum).toFixed(1)}`);
  const line = `M${pts.join("L")}`;
  const area = `${line}L${x(curve.length - 1).toFixed(1)},${zeroY.toFixed(1)}L${x(0).toFixed(1)},${zeroY.toFixed(1)}Z`;

  const last = curve[curve.length - 1];
  const endTone = last.cum >= 0 ? "var(--profit)" : "var(--loss)";
  const uid = "eq" + Math.random().toString(36).slice(2, 7);

  const hover = curve.map((p, i) => {
    const w = curve.length === 1 ? plotW : plotW / (curve.length - 1);
    return `<rect x="${(x(i) - w / 2).toFixed(1)}" y="${padT}" width="${w.toFixed(1)}" height="${plotH}"
      fill="transparent" data-i="${i}" data-x="${x(i).toFixed(1)}" data-y="${y(p.cum).toFixed(1)}"></rect>`;
  }).join("");

  return `<svg width="${width}" height="${H}" role="img" aria-label="누적 손익 곡선">
    <defs>
      <clipPath id="${uid}-up"><rect x="0" y="0" width="${width}" height="${Math.max(0, zeroY)}"/></clipPath>
      <clipPath id="${uid}-dn"><rect x="0" y="${Math.max(0, zeroY)}" width="${width}" height="${H}"/></clipPath>
    </defs>
    <line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${padL + plotW}" y2="${zeroY.toFixed(1)}"
          stroke="var(--axis)" stroke-width="1"/>
    <path d="${area}" fill="var(--profit)" opacity="0.10" clip-path="url(#${uid}-up)"/>
    <path d="${area}" fill="var(--loss)"   opacity="0.10" clip-path="url(#${uid}-dn)"/>
    <path d="${line}" fill="none" stroke="var(--profit)" stroke-width="2" stroke-linejoin="round"
          stroke-linecap="round" clip-path="url(#${uid}-up)"/>
    <path d="${line}" fill="none" stroke="var(--loss)" stroke-width="2" stroke-linejoin="round"
          stroke-linecap="round" clip-path="url(#${uid}-dn)"/>
    <line class="xhair" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="var(--axis)"
          stroke-width="1" opacity="0"/>
    <circle cx="${x(curve.length - 1).toFixed(1)}" cy="${y(last.cum).toFixed(1)}" r="4.5"
            fill="${endTone}" stroke="var(--surface)" stroke-width="2"/>
    <text x="${(x(curve.length - 1) + 9).toFixed(1)}" y="${(y(last.cum) + 4).toFixed(1)}"
          font-size="12" font-weight="700" fill="var(--ink)">${endLabel}</text>
    <text x="${padL}" y="${H - 8}" font-size="11" fill="var(--muted)">${esc(shortDate(curve[0].traded_at))}</text>
    <text x="${(padL + plotW).toFixed(1)}" y="${H - 8}" font-size="11" fill="var(--muted)"
          text-anchor="end">${esc(shortDate(last.traded_at))}</text>
    <g class="hit">${hover}</g>
  </svg>`;
}

/* ── 차트: 일별 손익 막대 ─────────────────── */
function dailyBarsSVG(days, width) {
  const H = 190, padT = 14, padB = 24, padL = 6, padR = 6;
  const plotH = H - padT - padB;
  const plotW = Math.max(60, width - padL - padR);
  if (!days.length) return `<p class="empty">표시할 기록이 없습니다.</p>`;

  const vals = days.map((d) => d.pnl);
  let hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  if (hi === lo) { hi += 1; lo -= 1; }
  const span = hi - lo;
  const y = (v) => padT + (1 - (v - lo) / span) * plotH;
  const zeroY = y(0);

  const band = plotW / days.length;
  const bw = Math.max(3, Math.min(24, band - 2));

  const bars = days.map((d, i) => {
    const cx = padL + band * i + band / 2;
    const bx = cx - bw / 2;
    const top = d.pnl >= 0 ? y(d.pnl) : zeroY;
    const h = Math.abs(y(d.pnl) - zeroY);
    const fill = d.pnl >= 0 ? "var(--profit)" : "var(--loss)";
    const r = Math.min(4, bw / 2, h);
    const path = d.pnl >= 0
      ? `M${bx},${zeroY} L${bx},${top + r} Q${bx},${top} ${bx + r},${top} L${bx + bw - r},${top} Q${bx + bw},${top} ${bx + bw},${top + r} L${bx + bw},${zeroY} Z`
      : `M${bx},${zeroY} L${bx},${zeroY + h - r} Q${bx},${zeroY + h} ${bx + r},${zeroY + h} L${bx + bw - r},${zeroY + h} Q${bx + bw},${zeroY + h} ${bx + bw},${zeroY + h - r} L${bx + bw},${zeroY} Z`;
    return d.pnl === 0 && d.count === 0 ? "" : `<path d="${path}" fill="${fill}"/>`;
  }).join("");

  const hits = days.map((d, i) =>
    `<rect x="${(padL + band * i).toFixed(1)}" y="${padT}" width="${band.toFixed(1)}" height="${plotH}"
      fill="transparent" data-i="${i}" data-x="${(padL + band * i + band / 2).toFixed(1)}"
      data-y="${Math.min(y(d.pnl), zeroY).toFixed(1)}"></rect>`).join("");

  const step = days.length > 20 ? 5 : days.length > 10 ? 2 : 1;
  const ticks = days.map((d, i) => (i % step === 0
    ? `<text x="${(padL + band * i + band / 2).toFixed(1)}" y="${H - 8}" font-size="10"
         fill="var(--muted)" text-anchor="middle">${d.label}</text>` : "")).join("");

  return `<svg width="${width}" height="${H}" role="img" aria-label="일별 손익">
    ${bars}
    <line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${padL + plotW}" y2="${zeroY.toFixed(1)}"
          stroke="var(--axis)" stroke-width="1"/>
    ${ticks}
    <g class="hit">${hits}</g>
  </svg>`;
}

/* 차트 박스 + 툴팁 배선 */
function chartCard(title, note, boxId, legend = "") {
  return `<div class="card chart-card">
    <div class="chart-head">
      <h2 class="chart-title">${esc(title)}</h2>
      <span class="chart-note">${esc(note)}</span>
    </div>
    <div class="chart-box" id="${boxId}"></div>
    ${legend}
  </div>`;
}

const PNL_LEGEND = `<div class="legend">
  <span><i style="background:var(--profit)"></i>수익</span>
  <span><i style="background:var(--loss)"></i>손실</span>
</div>`;

function mountChart(boxId, build, tipText) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const draw = () => {
    const w = Math.max(240, box.clientWidth || 300);
    box.innerHTML = build(w) + `<div class="tip"></div>`;
    const tip = $(".tip", box);
    const xhair = $(".xhair", box);
    $$(".hit rect", box).forEach((r) => {
      const show = () => {
        const i = Number(r.dataset.i);
        tip.innerHTML = tipText(i);
        tip.style.left = r.dataset.x + "px";
        tip.style.top = r.dataset.y + "px";
        tip.classList.add("is-on");
        if (xhair) {
          xhair.setAttribute("x1", r.dataset.x);
          xhair.setAttribute("x2", r.dataset.x);
          xhair.setAttribute("opacity", "1");
        }
      };
      const hide = () => {
        tip.classList.remove("is-on");
        if (xhair) xhair.setAttribute("opacity", "0");
      };
      r.addEventListener("mouseenter", show);
      r.addEventListener("mouseleave", hide);
      r.addEventListener("touchstart", (e) => { e.preventDefault(); show(); }, { passive: false });
      r.addEventListener("touchend", hide);
    });
  };
  draw();
  box._redraw = draw;
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    $$(".chart-box").forEach((b) => b._redraw && b._redraw());
  }, 150);
});

/* ── 패널: 오늘 ───────────────────────────── */
function renderToday(panel) {
  const today = localDate();
  const list = state.trades.filter((t) => t.traded_at === today);
  const s = summarize(list);

  panel.innerHTML =
    heroTile("오늘 실현 손익", s.total, list.length ? `${list.length}건 · ${s.wins}승 ${s.draws}무 ${s.loses}패` : "오늘 기록 없음") +
    `<div class="tiles">
      ${winRateTile(s)}
      ${tile("최고 수익", `<span class="up">${list.length ? money(s.best, { sign: true }) : "—"}</span>`, "오늘 한 건 기준")}
      ${tile("최대 손실", `<span class="down">${list.length ? money(s.worst, { sign: true }) : "—"}</span>`, "오늘 한 건 기준")}
    </div>` +
    listCard("오늘 매매 내역", list, "오늘 기록이 아직 없습니다. 위에서 첫 매매를 기록해보세요.");
}

/* ── 패널: 이번 달 ────────────────────────── */
function renderMonth(panel) {
  const mk = monthKey(localDate());
  const list = state.trades.filter((t) => monthKey(t.traded_at) === mk);
  const s = summarize(list);

  const [yy, mm] = mk.split("-").map(Number);
  const lastDay = new Date(yy, mm, 0).getDate();
  const today = new Date();
  const upto = (today.getFullYear() === yy && today.getMonth() + 1 === mm) ? today.getDate() : lastDay;

  const days = [];
  for (let d = 1; d <= upto; d++) {
    const iso = `${mk}-${String(d).padStart(2, "0")}`;
    const dayTrades = list.filter((t) => t.traded_at === iso);
    days.push({
      label: String(d),
      iso,
      pnl: dayTrades.reduce((a, t) => a + Number(t.pnl), 0),
      count: dayTrades.length,
    });
  }

  panel.innerHTML =
    heroTile(`${mm}월 실현 손익`, s.total, list.length ? `${list.length}건 · ${s.wins}승 ${s.draws}무 ${s.loses}패` : "이번 달 기록 없음") +
    `<div class="tiles">
      ${winRateTile(s)}
      ${tile("손익비", s.payoff ? s.payoff.toFixed(2) : "—", "평균수익 ÷ 평균손실")}
      ${tile("1회 기대값", `<span class="${toneOf(s.expectancy)}">${list.length ? money(s.expectancy, { sign: true }) : "—"}</span>`, "매매 한 건당")}
    </div>` +
    chartCard("일별 실현 손익", `${mm}월 1일 ~ ${upto}일`, "monthBars", PNL_LEGEND) +
    listCard("이번 달 매매 내역", list, "이번 달 기록이 없습니다.");

  mountChart("monthBars", (w) => dailyBarsSVG(days, w), (i) => {
    const d = days[i];
    return `${mm}월 ${d.label}일 · ${d.count}건<br>${money(d.pnl, { sign: true })}`;
  });
}

/* ── 패널: 전체 ───────────────────────────── */
function applyFilters(trades) {
  const f = state.filters;
  let out = [...trades];
  if (f.period !== "all") {
    const n = Number(f.period);
    const from = new Date();
    from.setDate(from.getDate() - (n - 1));
    const fromIso = localDate(from);
    out = out.filter((t) => t.traded_at >= fromIso);
  }
  if (f.symbol !== "all") out = out.filter((t) => t.symbol === f.symbol);
  if (f.side !== "all") out = out.filter((t) => t.position === f.side);
  if (f.result !== "all") out = out.filter((t) => t.result === f.result);
  return out;
}

function renderAll(panel) {
  const list = applyFilters(state.trades);
  const s = summarize(list);
  const syms = [...new Set(state.trades.map((t) => t.symbol))].sort();
  const f = state.filters;
  const opt = (v, label, cur) => `<option value="${esc(v)}"${cur === v ? " selected" : ""}>${esc(label)}</option>`;

  panel.innerHTML =
    `<div class="card">
      <div class="filters">
        <label class="field"><span>기간</span><select data-filter="period">
          ${opt("all", "전체", f.period)}${opt("7", "최근 7일", f.period)}${opt("30", "최근 30일", f.period)}${opt("90", "최근 90일", f.period)}
        </select></label>
        <label class="field"><span>코인</span><select data-filter="symbol">
          ${opt("all", "전체", f.symbol)}${syms.map((x) => opt(x, x, f.symbol)).join("")}
        </select></label>
        <label class="field"><span>포지션</span><select data-filter="side">
          ${opt("all", "전체", f.side)}${opt("long", "롱", f.side)}${opt("short", "숏", f.side)}
        </select></label>
        <label class="field"><span>결과</span><select data-filter="result">
          ${opt("all", "전체", f.result)}${opt("win", "승", f.result)}${opt("draw", "무", f.result)}${opt("lose", "패", f.result)}
        </select></label>
      </div>
    </div>` +
    heroTile("누적 실현 손익", s.total, `${list.length}건 · ${s.wins}승 ${s.draws}무 ${s.loses}패`) +
    chartCard("누적 손익 곡선", "매매 순서대로 누적", "equityBox", PNL_LEGEND) +
    listCard("전체 매매 내역", list, "조건에 맞는 기록이 없습니다.", 200);

  mountChart("equityBox", (w) => equityCurveSVG(s.curve, w), (i) => {
    const p = s.curve[i];
    return `${shortDate(p.traded_at)} ${esc(p.symbol)} ${p.position === "long" ? "롱" : "숏"}<br>
            이 매매 ${money(Number(p.pnl), { sign: true })} · 누적 ${money(p.cum, { sign: true })}`;
  });

  $$("[data-filter]", panel).forEach((sel) => {
    sel.addEventListener("change", () => {
      state.filters[sel.dataset.filter] = sel.value;
      render();
    });
  });
}

/* ── 패널: 통계 ───────────────────────────── */
function renderStats(panel) {
  const s = summarize(state.trades);
  const n = state.trades.length;

  const bySymbol = {};
  const byDow = Array.from({ length: 7 }, () => ({ pnl: 0, w: 0, l: 0, n: 0 }));
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];

  for (const t of state.trades) {
    const k = t.symbol;
    bySymbol[k] ??= { pnl: 0, w: 0, l: 0, n: 0 };
    bySymbol[k].pnl += Number(t.pnl);
    bySymbol[k].n++;
    if (t.result === "win") bySymbol[k].w++;
    if (t.result === "lose") bySymbol[k].l++;

    const d = new Date(t.traded_at + "T00:00:00").getDay();
    byDow[d].pnl += Number(t.pnl);
    byDow[d].n++;
    if (t.result === "win") byDow[d].w++;
    if (t.result === "lose") byDow[d].l++;
  }

  const symRows = Object.entries(bySymbol)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([sym, v]) => `<tr>
      <td><strong>${esc(sym)}</strong></td>
      <td>${v.n}</td>
      <td>${v.w + v.l ? ((v.w / (v.w + v.l)) * 100).toFixed(0) + "%" : "—"}</td>
      <td class="${toneOf(v.pnl)}">${money(v.pnl, { sign: true })}</td>
    </tr>`).join("");

  const dowRows = byDow.map((v, i) => (v.n ? `<tr>
      <td><strong>${DOW[i]}요일</strong></td>
      <td>${v.n}</td>
      <td>${v.w + v.l ? ((v.w / (v.w + v.l)) * 100).toFixed(0) + "%" : "—"}</td>
      <td class="${toneOf(v.pnl)}">${money(v.pnl, { sign: true })}</td>
    </tr>` : "")).join("");

  panel.innerHTML =
    heroTile("전체 누적 손익", s.total, `${n}건 · ${s.wins}승 ${s.draws}무 ${s.loses}패`) +
    `<div class="tiles">
      ${winRateTile(s)}
      ${tile("손익비", s.payoff ? s.payoff.toFixed(2) : "—", "1보다 크면 이익이 손실보다 큼")}
      ${tile("1회 기대값", `<span class="${toneOf(s.expectancy)}">${n ? money(s.expectancy, { sign: true }) : "—"}</span>`, "매매 한 건당 기대 금액")}
      ${tile("평균 수익", `<span class="up">${s.avgWin ? money(s.avgWin) : "—"}</span>`, `${s.wins}건 평균`)}
      ${tile("평균 손실", `<span class="down">${s.avgLoss ? money(s.avgLoss) : "—"}</span>`, `${s.loses}건 평균`)}
      ${tile("최대 낙폭", `<span class="down">${n ? money(s.mdd) : "—"}</span>`, "누적 고점 대비")}
      ${tile("최대 연속 패", n ? `${s.maxStreak}연패` : "—", "연속으로 진 최대 횟수")}
      ${tile("최고 / 최악", n ? `<span class="up">${money(s.best, { sign: true })}</span>` : "—",
        n ? `최악 ${money(s.worst, { sign: true })}` : "")}
    </div>` +
    `<div class="card">
      <div class="list-head"><h2 class="list-title">코인별 성적</h2></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>코인</th><th>건수</th><th>승률</th><th>누적 손익</th></tr></thead>
        <tbody>${symRows || `<tr><td colspan="4" class="empty">기록 없음</td></tr>`}</tbody>
      </table></div>
    </div>` +
    `<div class="card">
      <div class="list-head"><h2 class="list-title">요일별 성적</h2></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>요일</th><th>건수</th><th>승률</th><th>누적 손익</th></tr></thead>
        <tbody>${dowRows || `<tr><td colspan="4" class="empty">기록 없음</td></tr>`}</tbody>
      </table></div>
    </div>`;
}

/* ── 렌더 ─────────────────────────────────── */
function render() {
  const panel = $(`.panel[data-panel="${state.tab}"]`);
  if (!panel) return;
  ({ today: renderToday, month: renderMonth, all: renderAll, stats: renderStats })[state.tab](panel);
}

$("#panels").addEventListener("click", (e) => {
  const ed = e.target.closest("[data-edit]");
  const dl = e.target.closest("[data-del]");
  if (ed) startEdit(Number(ed.dataset.edit));
  if (dl) deleteTrade(Number(dl.dataset.del));
});

/* ── CSV 내보내기 ─────────────────────────── */
$("#csvBtn").addEventListener("click", () => {
  if (!state.trades.length) return toast("내보낼 기록이 없습니다");
  const head = ["날짜", "코인", "포지션", "결과", "손익", "태그", "매매 복기"];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [...state.trades]
    .sort((a, b) => a.traded_at.localeCompare(b.traded_at))
    .map((t) => [
      t.traded_at, t.symbol, t.position === "long" ? "롱" : "숏",
      RESULT_KO[t.result], t.pnl, (t.tags || []).join(" "), t.memo || "",
    ].map(cell).join(","));

  const csv = "﻿" + [head.map(cell).join(","), ...body].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `매매일지_${localDate()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("CSV를 내보냈습니다");
});

/* ── 시작 ─────────────────────────────────── */
$("#currency").value = state.currency;
$("#unitHint").textContent = state.currency === "KRW" ? "(원)" : "(USDT)";
resetForm();

const { data: { session } } = await supabase.auth.getSession();
session ? await showApp() : showAuth();

supabase.auth.onAuthStateChange((event, sess) => {
  if (event === "SIGNED_IN" && sess) showApp();
  if (event === "SIGNED_OUT") showAuth();
});
