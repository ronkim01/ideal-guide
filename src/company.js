// AI 자동화 회사 — 핵심 라이브러리
// 각 부서 에이전트 실행, 메모리(학습) 관리, 파일 입출력을 담당한다.
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");
export const COMPANY_DIR = path.join(ROOT, "company");
export const MEMORY_DIR = path.join(COMPANY_DIR, "memory");
export const WORKSPACE_DIR = path.join(ROOT, "workspace");

export const MODEL = "claude-opus-5";

// 부서 정의 (대표실 제외 6개 실행 부서)
export const DEPARTMENTS = {
  marketing: { name: "마케팅팀", outputs: "주제 · 카피 · 발행안" },
  sales: { name: "영업팀", outputs: "고객 목록 · 연락문 · 상담안" },
  support: { name: "고객지원팀", outputs: "FAQ · 답변문 · 개선요청" },
  finance: { name: "재무팀", outputs: "현금표 · 비용점검 · 경고" },
  dev: { name: "개발팀", outputs: "제작물 · 테스트 · 배포안" },
  ops: { name: "운영팀", outputs: "업무 흐름 · 자동화 목록 · 점검표" },
};

// .env 파일이 있으면 읽어서 환경변수로 로드 (외부 의존성 없이)
export function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

let _client = null;
export function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(
        "\n❌ ANTHROPIC_API_KEY가 설정되지 않았습니다.\n" +
          "   .env 파일에 ANTHROPIC_API_KEY=sk-ant-... 를 추가하거나,\n" +
          "   GitHub 저장소 Settings → Secrets → ANTHROPIC_API_KEY를 등록하세요.\n"
      );
      process.exit(1);
    }
    _client = new Anthropic();
  }
  return _client;
}

export function readFileIfExists(p, fallback = "") {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : fallback;
}

export function readBusinessProfile() {
  const business = readFileIfExists(
    path.join(COMPANY_DIR, "business.md"),
    "(비즈니스 프로필이 아직 작성되지 않았습니다. company/business.md를 작성하세요.)"
  );
  // 전략 문서가 있으면 함께 주입 — 모든 부서가 같은 전략 기준으로 일하게 한다.
  const strategy = readFileIfExists(path.join(COMPANY_DIR, "strategy.md"));
  return strategy ? `${business}\n\n---\n\n${strategy}` : business;
}

export function readDepartmentPrompt(deptId) {
  return readFileIfExists(path.join(COMPANY_DIR, "departments", `${deptId}.md`));
}

// 부서별 축적된 교훈(메모리) 읽기 — 너무 길면 최근 내용만 사용
export function readMemory(deptId, maxChars = 6000) {
  const text = readFileIfExists(path.join(MEMORY_DIR, `${deptId}.md`));
  return text.length > maxChars ? "...(이전 기록 생략)...\n" + text.slice(-maxChars) : text;
}

// 교훈을 메모리 파일에 누적 (스스로 학습하는 부분)
export function appendMemory(deptId, dateStr, lessons) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  const p = path.join(MEMORY_DIR, `${deptId}.md`);
  const header = fs.existsSync(p) ? "" : `# ${deptId} 팀의 축적된 교훈\n\n`;
  const entry = lessons.map((l) => `- ${l}`).join("\n");
  fs.appendFileSync(p, `${header}## ${dateStr}\n${entry}\n\n`);
}

// 최근 업무 기록 요약 (대표실이 맥락을 이어가도록)
export function readRecentWork(days = 3) {
  if (!fs.existsSync(WORKSPACE_DIR)) return "(아직 업무 기록 없음)";
  const dirs = fs
    .readdirSync(WORKSPACE_DIR)
    .filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d))
    .sort()
    .slice(-days);
  if (dirs.length === 0) return "(아직 업무 기록 없음)";
  const parts = [];
  for (const d of dirs) {
    const plan = readFileIfExists(path.join(WORKSPACE_DIR, d, "plan.md"));
    const retro = readFileIfExists(path.join(WORKSPACE_DIR, d, "retro.md"));
    if (plan) parts.push(`### ${d} 계획\n${plan.slice(0, 1500)}`);
    if (retro) parts.push(`### ${d} 회고\n${retro.slice(0, 1500)}`);
  }
  return parts.join("\n\n") || "(아직 업무 기록 없음)";
}

// 에이전트 1회 실행. schema를 주면 구조화된 JSON을, 없으면 마크다운 텍스트를 반환.
export async function runAgent({ system, user, maxTokens = 32000, schema = null, label = "" }) {
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    // 안전 분류기가 요청을 거부할 경우 서버가 자동으로 대체 모델로 재시도한다.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
  if (schema) {
    params.output_config = { format: { type: "json_schema", schema } };
  }
  const stream = client().beta.messages.stream(params);
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    throw new Error(`[${label}] 요청이 안전상의 이유로 거부되었습니다.`);
  }
  if (msg.stop_reason === "max_tokens") {
    console.warn(`⚠️ [${label}] 출력이 길이 제한에 걸려 잘렸을 수 있습니다.`);
  }
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return schema ? JSON.parse(text) : text;
}

export function todayStr() {
  // KST 기준 날짜
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function saveOutput(dateStr, filename, content) {
  const dir = path.join(WORKSPACE_DIR, dateStr);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), content);
  return path.join("workspace", dateStr, filename);
}
