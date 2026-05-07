import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Employee = { id: string; name: string }
export type Restaurant = { id: string; name: string; phone: string | null; note: string | null; sort_order: number }
export type MenuItem = { id: string; restaurant_id: string; name: string; price: number }
export type DailySchedule = { id: string; date: string; restaurant_id: string }
export type Order = { id: string; date: string; employee_id: string; menu_item_id: string; qty: number; subtotal: number }

export type OrderWithDetails = Order & {
  employees: { name: string }
  menu_items: { name: string; price: number; restaurants: { name: string } }
}
