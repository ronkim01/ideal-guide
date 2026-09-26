-- ============================================================
-- 스티커 메모 표 만들기
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 "Run" 하세요.
-- 기존 매매 기록은 건드리지 않습니다. 표 하나가 새로 생깁니다.
-- ============================================================

create table if not exists public.notes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       text not null default '',
  color      text not null default 'yellow',   -- yellow·pink·blue·green·gray
  font_size  int  not null default 15,
  bold       boolean not null default false,
  pinned     boolean not null default false,   -- 켜면 스크롤해도 화면에 붙어 있다
  x          int not null default 24,          -- 화면 위치
  y          int not null default 120,
  w          int not null default 240,         -- 크기
  h          int not null default 180,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_idx on public.notes (user_id, created_at);

alter table public.notes enable row level security;

drop policy if exists "내 메모만 조회" on public.notes;
create policy "내 메모만 조회" on public.notes
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "내 메모만 추가" on public.notes;
create policy "내 메모만 추가" on public.notes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "내 메모만 수정" on public.notes;
create policy "내 메모만 수정" on public.notes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "내 메모만 삭제" on public.notes;
create policy "내 메모만 삭제" on public.notes
  for delete to authenticated using (auth.uid() = user_id);

notify pgrst, 'reload schema';
