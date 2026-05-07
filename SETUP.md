# 辦公室午餐訂餐系統 — 上線步驟

## 第一步：建立 Supabase 資料庫

1. 前往 https://supabase.com → 免費註冊 → 建立新專案
2. 進入 **SQL Editor**，貼上 `supabase/schema.sql` 全文，按 Run
3. 回到 **Project Settings → API**，複製：
   - `Project URL`
   - `anon public` key

## 第二步：設定環境變數

編輯 `.env.local`，填入剛才複製的值：

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## 第三步：本地測試

```bash
npm run dev
```

開啟 http://localhost:3000，先去 **管理後台** 新增：
1. 員工名單（或用 schema.sql 的範例資料）
2. 餐廳與菜單

然後回主頁點餐、查報表。

## 第四步：部署到 Vercel（免費）

```bash
# 1. 建立 git repo
git init
git add .
git commit -m "init lunch order system"

# 2. 推到 GitHub（先在 github.com 建立空 repo）
git remote add origin https://github.com/你的帳號/lunch-order.git
git push -u origin main
```

3. 前往 https://vercel.com → Import 剛才的 GitHub repo
4. 在 **Environment Variables** 填入和 `.env.local` 相同的兩個變數
5. Deploy → 取得公開網址，分享給全公司同事

## 日常使用流程

| 誰 | 每天做什麼 |
|---|---|
| 管理員 | 進 `/admin` → 今日設定 → 選餐廳（或按「自動輪流」） |
| 所有人 | 進主頁 → 選自己名字 → 點餐 → 送出 |
| 管理員 | 主頁右側看即時統計，按「複製叫餐清單」打電話訂餐 |
| 月底 | 進 `/report` → 選月份 → 對帳、匯出 CSV |

## 系統功能

- **今日點餐**：選名字、加減品項、即時看同事訂單
- **管理後台**：管理餐廳、菜單、員工；設定今日餐廳；複製叫餐清單
- **月結報表**：每人費用總覽、可展開每日明細、匯出 CSV
