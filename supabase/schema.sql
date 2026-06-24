-- 辦公室訂午餐系統 - 資料庫建立腳本
-- 請在 Supabase SQL Editor 執行此腳本

-- 員工表
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- 餐廳表
create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  note text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- 菜單表
create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  name text not null,
  price int not null,
  created_at timestamptz default now()
);

-- 每日設定表（每天、每個分類各一筆：上傳菜單圖片＋本日店家名稱）
-- category：lunch=午餐, drinks=飲料點心, celebration=慶祝活動
create table if not exists daily_schedule (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category text not null default 'lunch',
  restaurant_id uuid references restaurants(id),
  restaurant_name text,
  menu_image text,
  created_at timestamptz default now(),
  unique(date, category)
);

-- 訂單表
-- category：lunch=午餐, drinks=飲料點心, celebration=慶祝活動
-- rating：1~5 顆星，未評分為 null
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category text not null default 'lunch',
  employee_id uuid references employees(id),
  menu_item_id uuid references menu_items(id),
  item_name text,
  note text,
  qty int not null default 1,
  subtotal int not null,
  rating int,
  created_at timestamptz default now(),
  unique(date, employee_id, menu_item_id)
);

-- 開放所有人讀寫（小型內部工具，不需複雜權限）
alter table employees enable row level security;
alter table restaurants enable row level security;
alter table menu_items enable row level security;
alter table daily_schedule enable row level security;
alter table orders enable row level security;

create policy "allow all" on employees for all using (true) with check (true);
create policy "allow all" on restaurants for all using (true) with check (true);
create policy "allow all" on menu_items for all using (true) with check (true);
create policy "allow all" on daily_schedule for all using (true) with check (true);
create policy "allow all" on orders for all using (true) with check (true);

-- 範例資料（可選）
insert into employees (name) values
  ('王小明'), ('李小華'), ('張美玲'), ('陳大偉'), ('林志遠'),
  ('黃怡君'), ('吳俊傑'), ('劉雅婷'), ('蔡宗翰'), ('許淑芬')
on conflict do nothing;
