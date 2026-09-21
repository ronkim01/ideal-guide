// 매매일지 — 월간 AI 복기 리포트
//
// 사용법:
//   node src/journal-report.js            → 지난달 리포트 생성
//   node src/journal-report.js 2026-09    → 특정 월 리포트 생성
//   node src/journal-report.js --dry-run  → AI 호출 없이 집계만 확인
//
// 결과는 저장소가 아니라 Supabase(journal_reports)에 저장됩니다.
// 저장소가 공개일 수 있으므로 매매 금액이 파일로 남지 않게 한 의도적인 선택입니다.
import { loadEnv, runAgent } from "./company.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

loadEnv();

const DRY = process.argv.includes("--dry-run");
const monthArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a));

/* ── 대상 월 결정 (KST 기준, 인자 없으면 지난달) ─────────────── */
function lastMonthKST() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  kst.setUTCDate(1);
  kst.setUTCMonth(kst.getUTCMonth() - 1);
  return kst.toISOString().slice(0, 7);
}
const month = monthArg || lastMonthKST();
const [yy, mm] = month.split("-").map(Number);
const from = `${month}-01`;
const to = `${month}-${String(new Date(yy, mm, 0).getDate()).padStart(2, "0")}`;

/* ── Supabase REST 호출 (의존성 없이 fetch만 사용) ───────────── */
async function api(path, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function signIn() {
  const email = process.env.JOURNAL_EMAIL;
  const password = process.env.JOURNAL_PASSWORD;
  if (!email || !password) {
    console.error(
      "\n❌ JOURNAL_EMAIL / JOURNAL_PASSWORD가 없습니다.\n" +
        "   매매일지에 로그인할 때 쓰는 이메일·비밀번호를 넣어주세요.\n" +
        "   · 로컬: .env 파일에 JOURNAL_EMAIL=... / JOURNAL_PASSWORD=...\n" +
        "   · GitHub: Settings → Secrets and variables → Actions 에 같은 이름으로 등록\n"
    );
    process.exit(1);
  }
  const auth = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  return { token: auth.access_token, userId: auth.user.id };
}

/* ── 집계 (앱 화면과 같은 계산식) ────────────────────────────── */
function summarize(trades) {
  const num = (t) => Number(t.pnl);
  const wins = trades.filter((t) => t.result === "win");
  const loses = trades.filter((t) => t.result === "lose");
  const draws = trades.filter((t) => t.result === "draw");
  const decided = wins.length + loses.length;
  const winRate = decided ? wins.length / decided : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + Math.abs(num(t)), 0) / wins.length : 0;
  const avgLoss = loses.length ? loses.reduce((s, t) => s + Math.abs(num(t)), 0) / loses.length : 0;

  const chrono = [...trades].sort((a, b) =>
    a.traded_at === b.traded_at
      ? String(a.created_at).localeCompare(String(b.created_at))
      : a.traded_at.localeCompare(b.traded_at));

  let cum = 0, peak = 0, mdd = 0, streak = 0, maxStreak = 0;
  for (const t of chrono) {
    cum += num(t);
    peak = Math.max(peak, cum);
    mdd = Math.max(mdd, peak - cum);
    streak = t.result === "lose" ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }

  const bySymbol = {};
  const byTag = {};
  const byDow = Array.from({ length: 7 }, () => ({ pnl: 0, n: 0, w: 0, l: 0 }));
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  for (const t of trades) {
    (bySymbol[t.symbol] ??= { pnl: 0, n: 0, w: 0, l: 0 });
    bySymbol[t.symbol].pnl += num(t); bySymbol[t.symbol].n++;
    if (t.result === "win") bySymbol[t.symbol].w++;
    if (t.result === "lose") bySymbol[t.symbol].l++;

    for (const g of t.tags || []) {
      (byTag[g] ??= { pnl: 0, n: 0, w: 0, l: 0 });
      byTag[g].pnl += num(t); byTag[g].n++;
      if (t.result === "win") byTag[g].w++;
      if (t.result === "lose") byTag[g].l++;
    }

    const d = new Date(t.traded_at + "T00:00:00").getDay();
    byDow[d].pnl += num(t); byDow[d].n++;
    if (t.result === "win") byDow[d].w++;
    if (t.result === "lose") byDow[d].l++;
  }

  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    month,
    trade_count: trades.length,
    total: r2(trades.reduce((s, t) => s + num(t), 0)),
    wins: wins.length, loses: loses.length, draws: draws.length,
    win_rate: r2(winRate * 100),
    avg_win: r2(avgWin),
    avg_loss: r2(avgLoss),
    payoff: avgLoss ? r2(avgWin / avgLoss) : null,
    expectancy: decided ? r2(winRate * avgWin - (1 - winRate) * avgLoss) : 0,
    mdd: r2(mdd),
    max_lose_streak: maxStreak,
    best: trades.length ? r2(Math.max(...trades.map(num))) : 0,
    worst: trades.length ? r2(Math.min(...trades.map(num))) : 0,
    long_count: trades.filter((t) => t.position === "long").length,
    short_count: trades.filter((t) => t.position === "short").length,
    by_symbol: Object.fromEntries(Object.entries(bySymbol).map(([k, v]) => [k, { ...v, pnl: r2(v.pnl) }])),
    by_tag: Object.fromEntries(Object.entries(byTag).map(([k, v]) => [k, { ...v, pnl: r2(v.pnl) }])),
    by_dow: Object.fromEntries(byDow.map((v, i) => [DOW[i], { ...v, pnl: r2(v.pnl) }]).filter(([, v]) => v.n)),
  };
}

/* ── AI 복기 스키마 ──────────────────────────────────────────── */
const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "patterns", "strengths", "rules", "question"],
  properties: {
    headline: { type: "string", description: "이번 달을 한 문장으로 (40자 이내)" },
    summary: { type: "string", description: "2~3문장 요약. 숫자는 주어진 통계만 인용" },
    patterns: {
      type: "array", minItems: 1, maxItems: 4,
      description: "반복된 행동 패턴. 손실을 만든 것 위주로, 근거가 있는 것만",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "evidence", "cost", "fix"],
        properties: {
          title: { type: "string", description: "패턴 이름 (20자 이내)" },
          evidence: { type: "string", description: "기록 속 근거. 날짜·코인·태그를 구체적으로 인용" },
          cost: { type: "string", description: "이 패턴이 실제로 얼마를 잃게 했는지 (통계에 있는 숫자만)" },
          fix: { type: "string", description: "다음 달에 바꿀 구체적 행동 한 가지" },
        },
      },
    },
    strengths: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" },
      description: "유지해야 할 잘한 점" },
    rules: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" },
      description: "다음 달 매매 규칙. 지켰는지 아닌지 판정 가능한 문장으로" },
    question: { type: "string", description: "스스로에게 던질 질문 하나" },
  },
};

const SYSTEM = `당신은 트레이더의 매매 기록을 읽고 복기를 도와주는 코치입니다.

지켜야 할 것:
- 주어진 기록과 통계에만 근거해 말합니다. 없는 숫자를 만들어내지 않습니다.
- 시장 전망이나 종목 추천은 하지 않습니다. 오직 "이 사람의 행동 패턴"만 다룹니다.
- 위로하지 않습니다. 손실을 만든 습관을 이름 붙여 지적하고, 근거가 되는 날짜·코인·태그를 인용합니다.
- 근거가 약하면 패턴으로 넣지 않습니다. 3개를 억지로 채우지 말고 확실한 것만 씁니다.
- 승률이 높아도 기대값이 음수면 그 점을 가장 먼저 지적합니다.
- 복기란(memo)에 적힌 본인의 말과 실제 손익이 어긋나는 지점을 찾아내면 가장 좋은 복기입니다.
- 한국어로, 담백하게 씁니다.`;

/* ── 실행 ────────────────────────────────────────────────────── */
const { token, userId } = await signIn();

const trades = await api(
  `/rest/v1/trades?traded_at=gte.${from}&traded_at=lte.${to}` +
  `&select=traded_at,symbol,position,pnl,result,memo,tags,created_at&order=traded_at.asc`,
  { token }
);

console.log(`📓 ${month} 매매 ${trades.length}건`);

if (trades.length === 0) {
  console.log("기록이 없어 리포트를 만들지 않았습니다.");
  process.exit(0);
}

const stats = summarize(trades);

if (DRY) {
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
}

const tradeLines = trades.map((t) =>
  `${t.traded_at} | ${t.symbol} | ${t.position === "long" ? "롱" : "숏"} | ` +
  `${Number(t.pnl) >= 0 ? "+" : ""}${t.pnl} | ${{ win: "승", draw: "무", lose: "패" }[t.result]}` +
  `${(t.tags || []).length ? ` | 태그: ${t.tags.join(",")}` : ""}` +
  `${t.memo ? ` | 복기: ${t.memo.replace(/\s+/g, " ").slice(0, 300)}` : ""}`
).join("\n");

const user = `${yy}년 ${mm}월 매매 기록을 복기해주세요. 단위는 USDT입니다.

## 집계 (이 숫자만 인용할 것)
${JSON.stringify(stats, null, 2)}

## 매매 내역 (${trades.length}건)
날짜 | 코인 | 포지션 | 손익 | 결과 | 태그 | 본인이 적은 복기
${tradeLines}

위 기록에서 반복되는 행동 패턴을 찾아내고, 다음 달에 지킬 규칙을 제안해주세요.`;

console.log("🤖 복기 생성 중...");
const report = await runAgent({ system: SYSTEM, user, schema: REPORT_SCHEMA, label: "매매복기", maxTokens: 8000 });

await api(`/rest/v1/journal_reports?on_conflict=user_id,month`, {
  method: "POST",
  token,
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: {
    user_id: userId,
    month,
    trade_count: trades.length,
    stats,
    report,
    updated_at: new Date().toISOString(),
  },
});

// 공개 저장소의 Actions 로그에 금액이 남지 않도록 요약만 출력합니다.
console.log(`✅ ${month} 복기 리포트 저장 완료 (매매 ${trades.length}건, 패턴 ${report.patterns.length}개)`);
console.log("   앱의 [복기] 탭에서 확인하세요.");
