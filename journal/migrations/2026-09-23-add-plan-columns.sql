-- ============================================================
-- 이미 매매일지 표를 만든 뒤에 진입가·TP·SL 칸을 추가하는 스크립트
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 "Run" 하세요.
--
-- 기존 매매 기록은 지워지지 않습니다. 없는 칸만 새로 붙입니다.
-- ============================================================

alter table public.trades add column if not exists entry_price numeric(20,8);  -- 진입가
alter table public.trades add column if not exists tp_price    numeric(20,8);  -- 목표가 (Take Profit)
alter table public.trades add column if not exists sl_price    numeric(20,8);  -- 손절가 (Stop Loss)

-- Supabase가 새 칸을 인식하게 한다.
-- 이 줄이 없으면 "Could not find the 'entry_price' column ... in the schema cache" 에러가 난다.
notify pgrst, 'reload schema';

-- 확인용: 아래를 따로 실행하면 현재 칸 목록이 나옵니다.
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'trades'
--  order by ordinal_position;
