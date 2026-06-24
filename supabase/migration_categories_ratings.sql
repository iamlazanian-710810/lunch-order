-- ============================================================
-- 點餐系統 升級 SQL（新增：分類、評分、本日店家名稱）
-- 請到 Supabase 後台 → 左側 SQL Editor → New query → 整段貼上 → 按 Run
-- 重複執行也安全（有 if not exists / if exists 保護）
-- ============================================================

-- 1) 訂單表：新增「分類」與「評分」
--    category：lunch=午餐, drinks=飲料點心, celebration=慶祝活動
--    rating：1~5 顆星，未評分為 null
alter table orders add column if not exists category text not null default 'lunch';
alter table orders add column if not exists rating int;

-- 2) 每日設定表：新增「本日店家名稱」與「分類」
alter table daily_schedule add column if not exists restaurant_name text;
alter table daily_schedule add column if not exists category text not null default 'lunch';

-- 3) 每日設定改為「每天、每個分類各一筆」
--    （原本限制是每天只能一筆，現在午餐/飲料/慶祝各自一筆）
alter table daily_schedule drop constraint if exists daily_schedule_date_key;
alter table daily_schedule
  add constraint daily_schedule_date_category_key unique (date, category);

-- 完成。新欄位的舊資料會自動視為「午餐」。
