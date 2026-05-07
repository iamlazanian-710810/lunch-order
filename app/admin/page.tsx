'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Restaurant, type MenuItem, type Employee } from '@/lib/supabase'

const today = new Date().toISOString().slice(0, 10)

type RestaurantWithMenu = Restaurant & { menu_items: MenuItem[] }

export default function AdminPage() {
  const [restaurants, setRestaurants] = useState<RestaurantWithMenu[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [todayRestaurantId, setTodayRestaurantId] = useState('')
  const [todayOrders, setTodayOrders] = useState<any[]>([])
  const [tab, setTab] = useState<'today' | 'restaurants' | 'employees'>('today')

  // New restaurant form
  const [newRestName, setNewRestName] = useState('')
  const [newRestPhone, setNewRestPhone] = useState('')
  const [newRestNote, setNewRestNote] = useState('')

  // New menu item form
  const [selectedRestId, setSelectedRestId] = useState('')
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')

  // New employee form
  const [newEmpName, setNewEmpName] = useState('')

  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const [{ data: rests }, { data: emps }, { data: sched }, { data: orders }] = await Promise.all([
      supabase.from('restaurants').select('*, menu_items(*)').order('sort_order'),
      supabase.from('employees').select('*').order('name'),
      supabase.from('daily_schedule').select('restaurant_id').eq('date', today).maybeSingle(),
      supabase.from('orders')
        .select('qty, subtotal, employees(name), menu_items(name, price, restaurants(name))')
        .eq('date', today),
    ])
    setRestaurants((rests ?? []) as RestaurantWithMenu[])
    setEmployees(emps ?? [])
    setTodayRestaurantId(sched?.restaurant_id ?? '')
    setTodayOrders(orders ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const setTodayRestaurant = async (restId: string) => {
    if (!restId) return
    await supabase.from('daily_schedule').upsert({ date: today, restaurant_id: restId }, { onConflict: 'date' })
    setTodayRestaurantId(restId)
    flash('已設定今日餐廳')
  }

  const autoRotate = async () => {
    if (restaurants.length === 0) return flash('尚無餐廳資料')
    const lastUsed = await supabase
      .from('daily_schedule')
      .select('restaurant_id, date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastId = lastUsed.data?.restaurant_id
    const idx = restaurants.findIndex(r => r.id === lastId)
    const next = restaurants[(idx + 1) % restaurants.length]
    await setTodayRestaurant(next.id)
  }

  const addRestaurant = async () => {
    if (!newRestName.trim()) return flash('請輸入餐廳名稱')
    const { error } = await supabase.from('restaurants').insert({
      name: newRestName.trim(),
      phone: newRestPhone.trim() || null,
      note: newRestNote.trim() || null,
      sort_order: restaurants.length,
    })
    if (error) return flash('新增失敗：' + error.message)
    setNewRestName(''); setNewRestPhone(''); setNewRestNote('')
    flash('餐廳已新增')
    load()
  }

  const deleteRestaurant = async (id: string, name: string) => {
    if (!confirm(`確定刪除「${name}」及其菜單？`)) return
    await supabase.from('restaurants').delete().eq('id', id)
    load()
  }

  const addMenuItem = async () => {
    if (!selectedRestId) return flash('請選擇餐廳')
    if (!newItemName.trim()) return flash('請輸入品項名稱')
    const price = parseInt(newItemPrice)
    if (isNaN(price) || price <= 0) return flash('請輸入有效價格')
    const { error } = await supabase.from('menu_items').insert({
      restaurant_id: selectedRestId, name: newItemName.trim(), price,
    })
    if (error) return flash('新增失敗：' + error.message)
    setNewItemName(''); setNewItemPrice('')
    flash('菜單品項已新增')
    load()
  }

  const deleteMenuItem = async (id: string) => {
    await supabase.from('menu_items').delete().eq('id', id)
    load()
  }

  const addEmployee = async () => {
    if (!newEmpName.trim()) return flash('請輸入員工姓名')
    const { error } = await supabase.from('employees').insert({ name: newEmpName.trim() })
    if (error) return flash('新增失敗：' + error.message)
    setNewEmpName('')
    flash('員工已新增')
    load()
  }

  const deleteEmployee = async (id: string, name: string) => {
    if (!confirm(`確定刪除員工「${name}」？`)) return
    await supabase.from('employees').delete().eq('id', id)
    load()
  }

  const copyOrderList = () => {
    const rest = restaurants.find(r => r.id === todayRestaurantId)
    const lines = [`【今日午餐訂單】${rest?.name ?? ''} ${today}`, '']
    // group by menu item
    const itemMap: Record<string, { name: string; qty: number; total: number }> = {}
    for (const o of todayOrders as any[]) {
      const key = o.menu_items?.name
      if (!itemMap[key]) itemMap[key] = { name: key, qty: 0, total: 0 }
      itemMap[key].qty += o.qty
      itemMap[key].total += o.subtotal
    }
    Object.values(itemMap).forEach(i => lines.push(`${i.name} × ${i.qty}`))
    lines.push('')
    lines.push(`合計：$${todayOrders.reduce((s: number, o: any) => s + o.subtotal, 0)}`)
    navigator.clipboard.writeText(lines.join('\n'))
    flash('已複製到剪貼簿！')
  }

  const tabClass = (t: string) =>
    `px-4 py-2 rounded-lg font-medium text-sm transition-colors ${tab === t ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">管理後台</h1>
        {msg && <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">{msg}</span>}
      </div>

      <div className="flex gap-2">
        <button className={tabClass('today')} onClick={() => setTab('today')}>今日設定</button>
        <button className={tabClass('restaurants')} onClick={() => setTab('restaurants')}>餐廳管理</button>
        <button className={tabClass('employees')} onClick={() => setTab('employees')}>員工管理</button>
      </div>

      {tab === 'today' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
            <h2 className="font-semibold text-gray-700">今日餐廳設定 ({today})</h2>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-48">
                <label className="text-sm text-gray-600 mb-1 block">選擇餐廳</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  value={todayRestaurantId}
                  onChange={e => setTodayRestaurant(e.target.value)}
                >
                  <option value="">-- 請選擇 --</option>
                  {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <button onClick={autoRotate}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
                自動輪流
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700">
                今日訂單 ({todayOrders.length > 0 ? `${todayOrders.reduce((s: number, o: any) => s + o.qty, 0)} 份` : '尚無訂單'})
              </h2>
              {todayOrders.length > 0 && (
                <button onClick={copyOrderList}
                  className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium">
                  複製叫餐清單
                </button>
              )}
            </div>
            {todayOrders.length === 0 ? (
              <p className="text-gray-400 text-sm italic">還沒有人點餐</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left py-1">員工</th>
                    <th className="text-left py-1">品項</th>
                    <th className="text-right py-1">數量</th>
                    <th className="text-right py-1">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {(todayOrders as any[]).map((o, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 text-gray-700">{o.employees?.name}</td>
                      <td className="py-1.5 text-gray-700">{o.menu_items?.name}</td>
                      <td className="py-1.5 text-right text-gray-600">×{o.qty}</td>
                      <td className="py-1.5 text-right text-orange-500">${o.subtotal}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td colSpan={3} className="pt-2 text-gray-700">合計</td>
                    <td className="pt-2 text-right text-orange-600">
                      ${(todayOrders as any[]).reduce((s, o) => s + o.subtotal, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'restaurants' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">新增餐廳</h2>
            <div className="grid sm:grid-cols-3 gap-3 mb-3">
              <input placeholder="餐廳名稱 *" value={newRestName} onChange={e => setNewRestName(e.target.value)}
                className="border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <input placeholder="電話" value={newRestPhone} onChange={e => setNewRestPhone(e.target.value)}
                className="border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <input placeholder="備註" value={newRestNote} onChange={e => setNewRestNote(e.target.value)}
                className="border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <button onClick={addRestaurant}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              新增餐廳
            </button>
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">新增菜單品項</h2>
            <div className="grid sm:grid-cols-3 gap-3 mb-3">
              <select value={selectedRestId} onChange={e => setSelectedRestId(e.target.value)}
                className="border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">選擇餐廳 *</option>
                {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <input placeholder="品項名稱 *" value={newItemName} onChange={e => setNewItemName(e.target.value)}
                className="border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <input placeholder="價格 *" type="number" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)}
                className="border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <button onClick={addMenuItem}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              新增品項
            </button>
          </div>

          <div className="space-y-3">
            {restaurants.map(r => (
              <div key={r.id} className="bg-white rounded-xl border shadow-sm p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-semibold text-gray-800">{r.name}</span>
                    {r.phone && <span className="text-gray-400 text-sm ml-2">☎ {r.phone}</span>}
                    {r.note && <span className="text-gray-400 text-sm ml-2">({r.note})</span>}
                  </div>
                  <button onClick={() => deleteRestaurant(r.id, r.name)}
                    className="text-red-400 hover:text-red-600 text-sm">刪除</button>
                </div>
                <div className="space-y-1">
                  {r.menu_items?.length === 0 && <p className="text-gray-400 text-sm italic">尚無菜單品項</p>}
                  {r.menu_items?.map(item => (
                    <div key={item.id} className="flex justify-between items-center text-sm text-gray-700 border-b last:border-0 py-1">
                      <span>{item.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-orange-500">${item.price}</span>
                        <button onClick={() => deleteMenuItem(item.id)} className="text-red-300 hover:text-red-500">×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {restaurants.length === 0 && (
              <p className="text-gray-400 text-sm italic text-center py-4">尚無餐廳，請先新增</p>
            )}
          </div>
        </div>
      )}

      {tab === 'employees' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">新增員工</h2>
            <div className="flex gap-3">
              <input placeholder="員工姓名" value={newEmpName} onChange={e => setNewEmpName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEmployee()}
                className="flex-1 border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <button onClick={addEmployee}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                新增
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">員工名單（{employees.length} 人）</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {employees.map(e => (
                <div key={e.id} className="flex justify-between items-center border rounded-lg px-3 py-2">
                  <span className="text-gray-800">{e.name}</span>
                  <button onClick={() => deleteEmployee(e.id, e.name)} className="text-red-300 hover:text-red-500 text-sm">刪除</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
