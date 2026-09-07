import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 點餐分類：lunch=午餐, drinks=飲料點心, celebration=慶祝活動
export type Category = 'lunch' | 'drinks' | 'celebration'

// 每日分類（午餐 / 飲料點心）：這兩類會再分「今日 / 明日」
export type DailyCategory = 'lunch' | 'drinks'

export const CATEGORIES: { key: Category; label: string; short: string }[] = [
  { key: 'lunch', label: '午餐', short: '午餐' },
  { key: 'drinks', label: '飲料 / 下午茶', short: '飲料點心' },
  { key: 'celebration', label: '慶祝活動', short: '慶祝活動' },
]

// 只有「午餐 / 飲料點心」需要分今日、明日；慶祝活動是期間制，不分天
export const DAILY_CATEGORIES: { key: DailyCategory; label: string; short: string }[] = [
  { key: 'lunch', label: '午餐', short: '午餐' },
  { key: 'drinks', label: '飲料 / 下午茶', short: '飲料點心' },
]

export const categoryLabel = (c: string) =>
  CATEGORIES.find(x => x.key === c)?.short ?? '午餐'

export type Employee = { id: string; name: string }
export type Restaurant = { id: string; name: string; phone: string | null; note: string | null; sort_order: number }
export type MenuItem = { id: string; restaurant_id: string; name: string; price: number }
export type DailySchedule = { id: string; date: string; category: Category; restaurant_name: string | null; menu_image: string | null }

// 慶祝活動：一個活動 = 一段收單期間 = 一張彙總表單
export type CelebrationEvent = {
  id: string
  name: string
  restaurant_name: string | null
  menu_image: string | null
  start_date: string
  end_date: string
  note: string | null
  created_at?: string
}

export type EventStatus = 'upcoming' | 'open' | 'closed'

export const eventStatus = (ev: CelebrationEvent, today: string): EventStatus =>
  today < ev.start_date ? 'upcoming' : today > ev.end_date ? 'closed' : 'open'

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  upcoming: '尚未開放',
  open: '開放訂購中',
  closed: '已截止',
}

export type Order = {
  id: string; date: string; category: Category; employee_id: string
  menu_item_id: string | null; item_name: string | null; note: string | null
  qty: number; subtotal: number; rating: number | null; event_id: string | null
}

export type OrderWithDetails = Order & {
  employees: { name: string }
  menu_items: { name: string; price: number; restaurants: { name: string } }
}
