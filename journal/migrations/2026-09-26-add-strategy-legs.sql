-- ============================================================
-- 전략(FVG·오더블럭)과 분할 진입 구간을 기록하기 위한 칸 추가
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 "Run" 하세요.
--
-- 기존 매매 기록은 지워지지 않습니다. 없는 칸만 새로 붙입니다.
-- ============================================================

-- 전략 이름 (FVG / 오더블럭 / 기타 · 비어 있으면 단일 진입)
alter table public.trades add column if not exists strategy text;

-- 진입 구간 목록. [{"price": 72.4, "weight": 33.33}, ...]
-- jsonb라서 구간 수가 늘거나 항목이 추가돼도 다시 마이그레이션할 필요가 없습니다.
alter table public.trades add column if not exists legs jsonb;

-- entry_price는 그대로 둡니다. 구간이 여러 개면 "비중으로 가중평균한 진입가"가
-- 들어가므로, 기존 통계·차트·복기 리포트가 손대지 않아도 그대로 동작합니다.

-- Supabase가 새 칸을 인식하게 한다.
-- 이 줄이 없으면 "Could not find the 'strategy' column ... in the schema cache" 에러가 난다.
notify pgrst, 'reload schema';

-- 확인용: 아래를 따로 실행하면 현재 칸 목록이 나옵니다.
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'trades'
--  order by ordinal_position;
