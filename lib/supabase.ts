import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 點餐分類：lunch=午餐, drinks=飲料點心, celebration=慶祝活動
export type Category = 'lunch' | 'drinks' | 'celebration'

export const CATEGORIES: { key: Category; label: string; short: string }[] = [
  { key: 'lunch', label: '午餐', short: '午餐' },
  { key: 'drinks', label: '飲料 / 下午茶', short: '飲料點心' },
  { key: 'celebration', label: '慶祝活動', short: '慶祝活動' },
]

export const categoryLabel = (c: string) =>
  CATEGORIES.find(x => x.key === c)?.short ?? '午餐'

export type Employee = { id: string; name: string }
export type Restaurant = { id: string; name: string; phone: string | null; note: string | null; sort_order: number }
export type MenuItem = { id: string; restaurant_id: string; name: string; price: number }
export type DailySchedule = { id: string; date: string; category: Category; restaurant_name: string | null; menu_image: string | null }
export type Order = { id: string; date: string; category: Category; employee_id: string; menu_item_id: string | null; item_name: string | null; note: string | null; qty: number; subtotal: number; rating: number | null }

export type OrderWithDetails = Order & {
  employees: { name: string }
  menu_items: { name: string; price: number; restaurants: { name: string } }
}
