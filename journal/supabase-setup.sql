-- ============================================================
-- 매매일지 테이블 생성 스크립트
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 "Run" 하세요.
--
-- ⚠️ 방명록(messages)의 "누구나 읽기/쓰기" 정책과 다릅니다.
--    매매 기록은 내 계정만 읽고 쓸 수 있도록 잠급니다.
-- ============================================================

-- 1) trades 테이블
create table if not exists public.trades (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  traded_at  date not null default current_date,          -- 매매 날짜
  symbol     text not null,                               -- 코인 (BTC, ETH ...)
  position   text not null check (position in ('long','short')),
  pnl        numeric(16,4) not null default 0,            -- 실현 손익 (손실은 음수)
  result     text not null check (result in ('win','draw','lose')),
  entry_price numeric(20,8),                              -- 진입가 (구간이 여럿이면 가중평균)
  tp_price    numeric(20,8),                              -- 목표가 (Take Profit)
  sl_price    numeric(20,8),                              -- 손절가 (Stop Loss)
  strategy    text,                                       -- FVG / 오더블럭 / 기타
  legs        jsonb,                                      -- 분할 진입 구간 [{price, weight}]
  memo       text,                                        -- 매매 복기 (분할 매수·매도 내역 포함)
  tags       text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- 1-1) 매매 계획 컬럼 추가
--     ★ 이미 표를 만드신 분은 이 세 줄 때문에 전체를 다시 실행하셔도 안전합니다.
--       (앱에서는 필수 입력이지만, 예전 기록이 지워지지 않도록 DB는 비어 있어도 허용합니다)
alter table public.trades add column if not exists entry_price numeric(20,8);
alter table public.trades add column if not exists tp_price    numeric(20,8);
alter table public.trades add column if not exists sl_price    numeric(20,8);
alter table public.trades add column if not exists strategy    text;
alter table public.trades add column if not exists legs        jsonb;

-- 2) 조회 성능용 인덱스 (날짜 내림차순 조회가 기본)
create index if not exists trades_user_date_idx
  on public.trades (user_id, traded_at desc, created_at desc);

-- 3) RLS 켜기
alter table public.trades enable row level security;

-- 4) 내 기록만 접근 (로그인한 본인 행만)
drop policy if exists "내 기록만 조회" on public.trades;
create policy "내 기록만 조회" on public.trades
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "내 기록만 추가" on public.trades;
create policy "내 기록만 추가" on public.trades
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "내 기록만 수정" on public.trades;
create policy "내 기록만 수정" on public.trades
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "내 기록만 삭제" on public.trades;
create policy "내 기록만 삭제" on public.trades
  for delete to authenticated using (auth.uid() = user_id);

-- ============================================================
-- 5) 월간 AI 복기 리포트 저장 테이블
--    (GitHub Actions에서 생성한 리포트가 여기 쌓이고, 앱의 [복기] 탭에서 읽습니다)
-- ============================================================
create table if not exists public.journal_reports (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month       text not null check (month ~ '^\d{4}-\d{2}$'),   -- 'YYYY-MM'
  trade_count int  not null default 0,
  stats       jsonb not null default '{}'::jsonb,               -- 집계 숫자
  report      jsonb not null default '{}'::jsonb,               -- AI 복기 내용
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, month)                                        -- 같은 달은 덮어쓰기
);

alter table public.journal_reports enable row level security;

drop policy if exists "내 리포트만 조회" on public.journal_reports;
create policy "내 리포트만 조회" on public.journal_reports
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "내 리포트만 추가" on public.journal_reports;
create policy "내 리포트만 추가" on public.journal_reports
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "내 리포트만 수정" on public.journal_reports;
create policy "내 리포트만 수정" on public.journal_reports
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "내 리포트만 삭제" on public.journal_reports;
create policy "내 리포트만 삭제" on public.journal_reports
  for delete to authenticated using (auth.uid() = user_id);

-- ============================================================
-- 6) 스키마 캐시 갱신
--    ★ 이게 없으면 칸을 새로 만들어도 앱에서
--      "Could not find the 'entry_price' column ... in the schema cache"
--      에러가 납니다. 표 구조를 바꿀 때마다 마지막에 실행하세요.
-- ============================================================
notify pgrst, 'reload schema';

-- ============================================================
-- 7) 내 계정 만들기 (SQL이 아니라 대시보드에서)
--    Authentication → Users → "Add user" → "Create new user"
--    · 이메일 / 비밀번호 입력
--    · "Auto Confirm User" 체크  ← 체크해야 메일 인증 없이 바로 로그인됩니다
-- ============================================================
