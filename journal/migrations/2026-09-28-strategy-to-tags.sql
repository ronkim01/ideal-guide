-- ============================================================
-- 전략을 하나만 고르는 방식 → 여러 개 고르는 방식으로
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 "Run" 하세요.
--
-- 이미 기록한 전략은 그대로 옮겨집니다. 지워지는 것 없습니다.
-- ============================================================

-- 전략 목록 (여러 개). 예: {FVG,유동성}
alter table public.trades add column if not exists strategies text[];

-- 지금까지 하나씩 적어둔 전략을 목록으로 옮긴다
update public.trades
   set strategies = array[strategy]
 where strategy is not null
   and strategy <> ''
   and strategies is null;

-- 기존 strategy 칸은 지우지 않고 남겨둡니다 (첫 번째 전략이 계속 들어갑니다).
-- 혹시 예전 화면으로 되돌리더라도 기록이 깨지지 않게 하기 위함입니다.

notify pgrst, 'reload schema';
