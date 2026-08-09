# 🏢 AI 자동화 회사

7개 부서 AI 에이전트가 **스스로 계획하고, 일하고, 학습하는** 1인 창업자용 AI 회사입니다.

```
👔 대표실 ──→ 목표·우선순위 결정, 부서에 업무 배분
    │
    ├─ 📣 마케팅팀   → 주제 · 카피 · 발행안
    ├─ 🤝 영업팀     → 고객 목록 · 연락문 · 상담안
    ├─ 🎧 고객지원팀 → FAQ · 답변문 · 개선요청
    ├─ 💰 재무팀     → 현금표 · 비용점검 · 경고
    ├─ 💻 개발팀     → 제작물 · 테스트 · 배포안
    └─ ⚙️  운영팀    → 업무 흐름 · 자동화 목록 · 점검표
    │
🔁 회고 ──→ 결과 평가 후 부서별 교훈을 memory/에 축적 (스스로 학습)
```

## 작동 원리

1. **대표실**이 비즈니스 프로필 + 지난 업무 기록 + 축적된 교훈을 읽고 오늘의 목표를 정한 뒤, 필요한 부서에만 업무를 배분합니다.
2. **각 부서**가 병렬로 일하며 "복사해서 바로 쓸 수 있는" 결과물을 `workspace/날짜/`에 저장합니다.
3. **회고 에이전트**가 결과를 평가해 부서별 교훈을 `company/memory/`에 기록합니다. 이 교훈은 다음 실행 때 각 부서 프롬프트에 다시 주입되어 **회사가 갈수록 똑똑해집니다.**
4. **GitHub Actions**가 매일 아침 9시(KST)에 이 사이클을 자동 실행하고 결과를 커밋합니다.

## 시작하기

### 1) 비즈니스 정보 입력 (가장 중요!)

`company/business.md`를 열어 실제 비즈니스 내용으로 수정하세요. 이 파일이 모든 부서의 판단 기준이 됩니다.

### 2) API 키 준비

[Anthropic Console](https://console.anthropic.com)에서 API 키를 발급받으세요.

**로컬 실행용** — 프로젝트 루트에 `.env` 파일 생성:

```
ANTHROPIC_API_KEY=sk-ant-...
```

**자동 실행용(추천)** — GitHub 저장소에서:
`Settings → Secrets and variables → Actions → New repository secret`
- Name: `ANTHROPIC_API_KEY`
- Value: 발급받은 키

### 3) 실행

```bash
npm install

# 대표실이 스스로 오늘의 목표를 정하고 실행
npm run company

# 목표를 직접 지정해서 실행
node src/run.js "이번 주 첫 유료 고객 3명 확보 준비"
```

### 4) 자동 실행 (스스로 일하는 모드)

기본 브랜치에 머지되면 **매일 아침 9시(KST)** 자동으로 실행됩니다.
수동으로 돌리고 싶으면: GitHub → `Actions` 탭 → `AI Company Daily Run` → `Run workflow` (목표 입력 가능)

## 폴더 구조

```
company/
  business.md          ← 비즈니스 프로필 (직접 작성)
  departments/         ← 7개 부서의 역할 정의 (수정해서 부서 성격 조정 가능)
  memory/              ← 부서별 축적된 교훈 (자동 생성·갱신)
workspace/
  2026-08-09/
    plan.md            ← 대표실 계획
    marketing.md 등    ← 부서별 결과물
    retro.md           ← 회고 + 내일 할 일 체크리스트
src/
  company.js           ← 핵심 라이브러리
  run.js               ← 하루 업무 사이클 실행
```

## 커스터마이징

- **부서 성격 바꾸기**: `company/departments/*.md` 수정 (예: 마케팅팀에 "인스타그램 위주로" 추가)
- **교훈 초기화**: `company/memory/` 파일 삭제
- **실행 시간 변경**: `.github/workflows/ai-company.yml`의 cron 수정

## 비용 안내

1회 실행에 대표실 + 배분된 부서(2~6개) + 회고 에이전트가 각 1회씩 Claude API를 호출합니다.
모델은 `claude-opus-5`를 사용하며, 하루 1회 실행 기준 통상 수백 원~수천 원 수준입니다.
비용을 줄이려면 `src/company.js`의 `MODEL`을 `claude-sonnet-5`로 변경하세요.

---

> 기존 방명록 데모(`index.html`, `app.js`, `styles.css`)는 그대로 유지되어 있습니다. 개발팀 에이전트가 이 코드를 개선 대상으로 인식합니다.
