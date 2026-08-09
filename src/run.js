// AI 자동화 회사 — 하루 업무 사이클 실행
//
// 사용법:
//   node src/run.js                  → 대표실이 스스로 오늘의 목표를 정하고 실행
//   node src/run.js "목표 문장"      → 지정한 목표로 실행
//
// 흐름: 대표실(계획) → 각 부서 병렬 실행(결과물) → 회고(교훈을 메모리에 축적)
import {
  DEPARTMENTS,
  loadEnv,
  readBusinessProfile,
  readDepartmentPrompt,
  readMemory,
  readRecentWork,
  runAgent,
  appendMemory,
  saveOutput,
  todayStr,
} from "./company.js";

loadEnv();

const goalArg = process.argv.slice(2).join(" ").trim();
const date = todayStr();
const business = readBusinessProfile();

console.log(`\n🏢 AI 자동화 회사 — ${date} 업무 시작\n`);

// ── 1단계: 대표실이 계획을 세운다 ─────────────────────────────
const PLAN_SCHEMA = {
  type: "object",
  properties: {
    goal: { type: "string", description: "오늘의 목표 한 문장" },
    priorities: { type: "array", items: { type: "string" }, description: "우선순위 최대 3개" },
    decisions: { type: "array", items: { type: "string" }, description: "오늘 내린 결정과 이유" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          department: {
            type: "string",
            enum: ["marketing", "sales", "support", "finance", "dev", "ops"],
          },
          task: { type: "string", description: "부서에 배분하는 구체적 업무 지시" },
          expected_output: { type: "string", description: "기대하는 결과물 형태" },
        },
        required: ["department", "task", "expected_output"],
        additionalProperties: false,
      },
    },
  },
  required: ["goal", "priorities", "decisions", "tasks"],
  additionalProperties: false,
};

console.log("👔 대표실: 오늘의 목표와 업무 배분을 결정하는 중...");

const plan = await runAgent({
  label: "대표실",
  system: readDepartmentPrompt("ceo"),
  maxTokens: 16000,
  schema: PLAN_SCHEMA,
  user: [
    `## 비즈니스 프로필\n${business}`,
    `## 대표실의 축적된 교훈\n${readMemory("ceo") || "(아직 없음)"}`,
    `## 최근 업무 기록\n${readRecentWork()}`,
    goalArg
      ? `## 오늘의 목표 (사용자가 직접 지정)\n${goalArg}\n\n이 목표를 달성하기 위한 계획과 부서별 업무 배분을 만들어라.`
      : `## 지시\n오늘 회사가 해야 할 가장 중요한 일을 스스로 판단해 목표를 정하고, 부서별 업무를 배분하라.`,
  ].join("\n\n"),
});

const planMd = [
  `# ${date} 대표실 계획`,
  `\n## 목표\n${plan.goal}`,
  `\n## 우선순위\n${plan.priorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
  `\n## 결정\n${plan.decisions.map((d) => `- ${d}`).join("\n")}`,
  `\n## 부서별 업무 배분\n${plan.tasks
    .map((t) => `- **${DEPARTMENTS[t.department].name}**: ${t.task}\n  - 기대 결과물: ${t.expected_output}`)
    .join("\n")}`,
].join("\n");
saveOutput(date, "plan.md", planMd);

console.log(`\n🎯 오늘의 목표: ${plan.goal}`);
console.log(`📋 업무 배분: ${plan.tasks.map((t) => DEPARTMENTS[t.department].name).join(", ")}\n`);

// ── 2단계: 각 부서가 병렬로 결과물을 만든다 ──────────────────
async function runDepartment(task) {
  const dept = DEPARTMENTS[task.department];
  console.log(`⚙️  ${dept.name}: 작업 시작 — ${task.task.slice(0, 60)}...`);
  const output = await runAgent({
    label: dept.name,
    system: readDepartmentPrompt(task.department),
    maxTokens: 32000,
    user: [
      `## 비즈니스 프로필\n${business}`,
      `## 우리 팀의 축적된 교훈 (반드시 반영할 것)\n${readMemory(task.department) || "(아직 없음)"}`,
      `## 오늘의 회사 목표\n${plan.goal}`,
      `## 대표실이 배분한 업무\n${task.task}`,
      `## 기대 결과물\n${task.expected_output}`,
      `\n위 업무를 수행하고, 팀 역할 정의에 명시된 결과물 형식(${dept.outputs})에 맞춰 마크다운으로 산출하라.`,
    ].join("\n\n"),
  });
  const file = saveOutput(date, `${task.department}.md`, `# ${date} ${dept.name} 결과물\n\n${output}`);
  console.log(`✅ ${dept.name}: 완료 → ${file}`);
  return { department: task.department, name: dept.name, task: task.task, output };
}

const results = [];
for (const settled of await Promise.allSettled(plan.tasks.map(runDepartment))) {
  if (settled.status === "fulfilled") results.push(settled.value);
  else console.error(`❌ 부서 작업 실패: ${settled.reason?.message ?? settled.reason}`);
}

if (results.length === 0) {
  console.error("모든 부서 작업이 실패했습니다. API 키와 네트워크를 확인하세요.");
  process.exit(1);
}

// ── 3단계: 회고 — 결과를 평가하고 교훈을 메모리에 축적 ────────
console.log("\n🔁 회고: 오늘 업무를 평가하고 교훈을 기록하는 중...");

const RETRO_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "오늘 업무 전체 요약 (사용자가 읽을 3~5문장)" },
    next_actions: {
      type: "array",
      items: { type: "string" },
      description: "운영진(8명 팀)이 내일 실제로 해야 할 행동 목록 (담당 팀 표시)",
    },
    lessons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          department: {
            type: "string",
            enum: ["ceo", "marketing", "sales", "support", "finance", "dev", "ops"],
          },
          lesson: { type: "string", description: "다음 업무에 반영할 구체적 교훈 한 문장" },
        },
        required: ["department", "lesson"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "next_actions", "lessons"],
  additionalProperties: false,
};

const retro = await runAgent({
  label: "회고",
  system: [
    "당신은 이 회사의 회고 담당 AI다. 오늘 각 부서의 결과물을 냉정하게 평가하고,",
    "다음에 더 잘하기 위한 교훈을 부서별로 뽑아낸다.",
    "교훈은 칭찬이 아니라 '다음에 무엇을 다르게 할지'가 담긴 구체적 문장이어야 한다.",
    "이미 잘한 것을 반복하라는 교훈은 그 방식이 왜 효과적이었는지 이유와 함께 적는다.",
  ].join("\n"),
  maxTokens: 16000,
  schema: RETRO_SCHEMA,
  user: [
    `## 오늘의 목표\n${plan.goal}`,
    `## 비즈니스 프로필\n${business.slice(0, 3000)}`,
    ...results.map(
      (r) => `## ${r.name} 결과물 (업무: ${r.task})\n${r.output.slice(0, 8000)}`
    ),
  ].join("\n\n"),
});

for (const l of retro.lessons) {
  appendMemory(l.department, date, [l.lesson]);
}

const retroMd = [
  `# ${date} 회고`,
  `\n## 요약\n${retro.summary}`,
  `\n## 내일 사용자가 할 일\n${retro.next_actions.map((a) => `- [ ] ${a}`).join("\n")}`,
  `\n## 부서별 교훈 (메모리에 축적됨)\n${retro.lessons
    .map((l) => `- **${l.department}**: ${l.lesson}`)
    .join("\n")}`,
].join("\n");
saveOutput(date, "retro.md", retroMd);

// ── 마무리 ────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log(`🏁 ${date} 업무 완료\n`);
console.log(`📌 요약: ${retro.summary}\n`);
console.log("✋ 내일 직접 할 일:");
for (const a of retro.next_actions) console.log(`   - ${a}`);
console.log(`\n📂 결과물: workspace/${date}/  |  🧠 교훈: company/memory/`);
