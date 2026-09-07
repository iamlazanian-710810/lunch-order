-- ============================================================
-- 點餐系統升級 SQL（第二版）
--   1) 修好「員工刪不掉」：刪員工時，連同他的訂單一起刪除
--   2) 慶祝活動改為「期間制」：一個活動 = 一段收單期間 = 一張彙總表單
--   3) 午餐 / 飲料點心 的「今日、明日」不需要改資料庫（用日期欄位區分）
--
-- 使用方式：Supabase 後台 → 左側 SQL Editor → New query → 整段貼上 → 按 Run
-- 重複執行也安全（都有 if not exists / if exists 保護）
-- ============================================================

-- ------------------------------------------------------------
-- 1) 員工刪除：改成連鎖刪除（刪員工 → 他的訂單一起刪掉）
--    原本的設定會擋住刪除，導致後台按「刪除」沒有反應
-- ------------------------------------------------------------
alter table orders drop constraint if exists orders_employee_id_fkey;
alter table orders
  add constraint orders_employee_id_fkey
  foreign key (employee_id) references employees(id) on delete cascade;

-- ------------------------------------------------------------
-- 2) 慶祝活動表（活動名稱 + 開放期間 + 店家 + 菜單圖）
-- ------------------------------------------------------------
create table if not exists celebration_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- 活動名稱，例如「10月壽星慶生會」
  restaurant_name text,               -- 店家名稱（可空白）
  menu_image text,                    -- 菜單圖片
  start_date date not null,           -- 開放預訂/修改的起日
  end_date date not null,             -- 截止日（含當天）
  note text,
  created_at timestamptz default now()
);

alter table celebration_events enable row level security;
drop policy if exists "allow all" on celebration_events;
create policy "allow all" on celebration_events for all using (true) with check (true);

-- ------------------------------------------------------------
-- 3) 訂單掛到活動上（慶祝活動用；午餐/飲料維持用 date 欄位）
--    刪除活動時，該活動的訂單一起刪除
-- ------------------------------------------------------------
alter table orders add column if not exists event_id uuid;
alter table orders drop constraint if exists orders_event_id_fkey;
alter table orders
  add constraint orders_event_id_fkey
  foreign key (event_id) references celebration_events(id) on delete cascade;

create index if not exists orders_event_id_idx on orders (event_id);
create index if not exists orders_date_category_idx on orders (date, category);

-- ------------------------------------------------------------
-- 4) 移除舊的唯一鍵限制
--    原本是 unique(date, employee_id, menu_item_id)，
--    但現在同一人同一天本來就可以點很多筆（menu_item_id 已不使用）
-- ------------------------------------------------------------
alter table orders drop constraint if exists orders_date_employee_id_menu_item_id_key;

-- 完成。
