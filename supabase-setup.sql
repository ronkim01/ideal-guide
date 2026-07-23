-- ============================================================
-- 방명록 테이블 생성 스크립트
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 "Run" 하세요.
-- ============================================================

-- 1) messages 테이블 생성
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  name        text,
  content     text not null,
  created_at  timestamptz not null default now()
);

-- 2) RLS(행 수준 보안) 켜기
alter table public.messages enable row level security;

-- 3) 누구나 읽기 허용
create policy "누구나 읽기"
  on public.messages
  for select
  to anon, authenticated
  using (true);

-- 4) 누구나 쓰기(글 남기기) 허용
create policy "누구나 쓰기"
  on public.messages
  for insert
  to anon, authenticated
  with check (true);
