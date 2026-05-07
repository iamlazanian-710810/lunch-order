'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Employee, type MenuItem, type Restaurant } from '@/lib/supabase'

type OrderMap = Record<string, number>

type PeerOrder = {
  employee_name: string
  items: { name: string; qty: number; subtotal: number }[]
  total: number
}

const today = new Date().toISOString().slice(0, 10)

export default function HomePage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [orderMap, setOrderMap] = useState<OrderMap>({})
  const [peerOrders, setPeerOrders] = useState<PeerOrder[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadBase = useCallback(async () => {
    const [{ data: emps }, { data: sched }] = await Promise.all([
      supabase.from('employees').select('*').order('name'),
      supabase.from('daily_schedule').select('*, restaurants(*)').eq('date', today).maybeSingle(),
    ])
    setEmployees(emps ?? [])
    if (sched?.restaurants) {
      const rest = sched.restaurants as unknown as Restaurant
      setRestaurant(rest)
      const { data: menu } = await supabase
        .from('menu_items').select('*').eq('restaurant_id', rest.id).order('price')
      setMenuItems(menu ?? [])
    }
  }, [])

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('menu_item_id, qty, subtotal, employees(name), menu_items(name)')
      .eq('date', today)
    if (!data) return

    const map: Record<string, PeerOrder> = {}
    for (const o of data as any[]) {
      const empName = o.employees?.name ?? '未知'
      if (!map[empName]) map[empName] = { employee_name: empName, items: [], total: 0 }
      map[empName].items.push({ name: o.menu_items?.name, qty: o.qty, subtotal: o.subtotal })
      map[empName].total += o.subtotal
    }
    setPeerOrders(Object.values(map).sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'zh-TW')))

    if (selectedEmployee) {
      const empName = employees.find(e => e.id === selectedEmployee)?.name
      const mine = (data as any[]).filter(o => o.employees?.name === empName)
      const map2: OrderMap = {}
      mine.forEach((o: any) => { map2[o.menu_item_id] = o.qty })
      setOrderMap(map2)
    }
  }, [selectedEmployee, employees])

  useEffect(() => { loadBase() }, [loadBase])
  useEffect(() => { if (employees.length) loadOrders() }, [loadOrders, employees])

  const changeQty = (itemId: string, delta: number) => {
    setOrderMap(prev => {
      const next = { ...prev }
      const val = (next[itemId] ?? 0) + delta
      if (val <= 0) delete next[itemId]
      else next[itemId] = val
      return next
    })
  }

  const total = menuItems.reduce((sum, item) => sum + (orderMap[item.id] ?? 0) * item.price, 0)

  const handleSave = async () => {
    if (!selectedEmployee) return setMessage('請先選擇姓名')
    if (Object.keys(orderMap).length === 0) return setMessage('請至少選一個品項')
    setSaving(true)
    setMessage('')

    await supabase.from('orders').delete().eq('date', today).eq('employee_id', selectedEmployee)

    const rows = Object.entries(orderMap).map(([menu_item_id, qty]) => {
      const item = menuItems.find(m => m.id === menu_item_id)!
      return { date: today, employee_id: selectedEmployee, menu_item_id, qty, subtotal: item.price * qty }
    })
    const { error } = await supabase.from('orders').insert(rows)
    setSaving(false)
    if (error) { setMessage('儲存失敗：' + error.message); return }
    setMessage('已儲存！')
    loadOrders()
  }

  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('zh-TW', {
    month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-5 border">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-800">今日點餐</h1>
          <span className="text-gray-500 text-sm">{dateLabel}</span>
        </div>
        {restaurant ? (
          <p className="text-orange-600 font-semibold text-lg">
            {restaurant.name}
            {restaurant.phone && (
              <span className="text-gray-400 text-sm font-normal ml-2">☎ {restaurant.phone}</span>
            )}
          </p>
        ) : (
          <p className="text-gray-400 italic">今日尚未選定餐廳，請管理員至後台設定</p>
        )}
      </div>

      {restaurant && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-5 border space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">我是</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={selectedEmployee}
                onChange={e => { setSelectedEmployee(e.target.value); setOrderMap({}) }}
              >
                <option value="">-- 請選擇姓名 --</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700 mb-2">菜單</p>
              {menuItems.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <span className="text-gray-800">{item.name}</span>
                    <span className="text-gray-400 text-sm ml-2">${item.price}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(item.id, -1)}
                      className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 leading-none">−</button>
                    <span className="w-5 text-center font-medium text-gray-800">{orderMap[item.id] ?? 0}</span>
                    <button onClick={() => changeQty(item.id, 1)}
                      className="w-7 h-7 rounded-full bg-orange-100 hover:bg-orange-200 font-bold text-orange-600 leading-none">＋</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="font-semibold text-gray-700">
                小計：<span className="text-orange-500">${total}</span>
              </span>
              <button onClick={handleSave} disabled={saving}
                className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors">
                {saving ? '儲存中…' : '確認送出'}
              </button>
            </div>
            {message && (
              <p className={`text-sm text-center ${message.startsWith('儲存失敗') ? 'text-red-500' : 'text-green-600'}`}>
                {message}
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5 border">
            <h2 className="font-semibold text-gray-700 mb-3">今日訂單統計</h2>
            {peerOrders.length === 0 ? (
              <p className="text-gray-400 text-sm italic">還沒有人點餐</p>
            ) : (
              <div className="space-y-3">
                {peerOrders.map(p => (
                  <div key={p.employee_name} className="border-b pb-2 last:border-0">
                    <div className="flex justify-between text-sm font-medium text-gray-800">
                      <span>{p.employee_name}</span>
                      <span className="text-orange-500">${p.total}</span>
                    </div>
                    {p.items.map((i, idx) => (
                      <div key={idx} className="text-xs text-gray-500 flex justify-between ml-2 mt-0.5">
                        <span>{i.name} ×{i.qty}</span>
                        <span>${i.subtotal}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex justify-between font-bold text-gray-800 pt-1">
                  <span>今日總計</span>
                  <span className="text-orange-600">${peerOrders.reduce((s, p) => s + p.total, 0)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
