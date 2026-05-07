'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, type Restaurant, type MenuItem, type Employee } from '@/lib/supabase'

type ParsedMenuItem = { name: string; price: number }
type ParsedMenu = { restaurant_name: string; items: ParsedMenuItem[] }

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

  // Photo upload states
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [parsedMenu, setParsedMenu] = useState<ParsedMenu | null>(null)
  const [parseLoading, setParseLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)

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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewUrl(URL.createObjectURL(file))
    setParsedMenu(null)
  }

  const parseMenu = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) return
    setParseLoading(true)
    setParsedMenu(null)
    const form = new FormData()
    form.append('image', file)
    const res = await fetch('/api/parse-menu', { method: 'POST', body: form })
    const data = await res.json()
    setParseLoading(false)
    if (data.error) return flash('辨識失敗：' + data.error)
    setParsedMenu(data)
  }

  const saveMenuFromPhoto = async () => {
    if (!parsedMenu) return
    setSaveLoading(true)
    const restName = parsedMenu.restaurant_name || '新餐廳'
    const { data: rest, error: restErr } = await supabase
      .from('restaurants')
      .insert({ name: restName, sort_order: restaurants.length })
      .select()
      .single()
    if (restErr) { setSaveLoading(false); return flash('建立餐廳失敗：' + restErr.message) }
    if (parsedMenu.items.length > 0) {
      await supabase.from('menu_items').insert(
        parsedMenu.items.map(item => ({ restaurant_id: rest.id, name: item.name, price: item.price }))
      )
    }
    setSaveLoading(false)
    setPreviewUrl(null)
    setParsedMenu(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    flash(`已建立「${restName}」及 ${parsedMenu.items.length} 項菜單`)
    load()
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
          {/* Photo upload card */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-1">📷 拍照上傳菜單</h2>
            <p className="text-xs text-gray-500 mb-3">拍菜單照片，AI 自動辨識品項與價格，一鍵建立餐廳</p>
            <div className="flex gap-3 items-start flex-wrap">
              <div className="flex-1 min-w-48">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageSelect}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-orange-500 file:text-white file:font-medium hover:file:bg-orange-600 cursor-pointer"
                />
              </div>
              {previewUrl && !parsedMenu && (
                <button
                  onClick={parseMenu}
                  disabled={parseLoading}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
                >
                  {parseLoading ? '辨識中…' : 'AI 辨識菜單'}
                </button>
              )}
            </div>

            {previewUrl && (
              <div className="mt-3">
                <img src={previewUrl} alt="菜單預覽" className="max-h-48 rounded-lg border object-contain" />
              </div>
            )}

            {parsedMenu && (
              <div className="mt-4 bg-white rounded-lg border p-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">餐廳名稱</label>
                  <input
                    value={parsedMenu.restaurant_name}
                    onChange={e => setParsedMenu({ ...parsedMenu, restaurant_name: e.target.value })}
                    className="border rounded-lg px-3 py-1.5 text-sm text-gray-800 w-full focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="輸入餐廳名稱"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">辨識到的品項（可修改）</label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {parsedMenu.items.map((item, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          value={item.name}
                          onChange={e => {
                            const items = [...parsedMenu.items]
                            items[i] = { ...items[i], name: e.target.value }
                            setParsedMenu({ ...parsedMenu, items })
                          }}
                          className="flex-1 border rounded-lg px-3 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        <input
                          type="number"
                          value={item.price}
                          onChange={e => {
                            const items = [...parsedMenu.items]
                            items[i] = { ...items[i], price: Number(e.target.value) }
                            setParsedMenu({ ...parsedMenu, items })
                          }}
                          className="w-20 border rounded-lg px-3 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        <button
                          onClick={() => setParsedMenu({ ...parsedMenu, items: parsedMenu.items.filter((_, j) => j !== i) })}
                          className="text-red-300 hover:text-red-500 text-lg leading-none"
                        >×</button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setParsedMenu({ ...parsedMenu, items: [...parsedMenu.items, { name: '', price: 0 }] })}
                    className="mt-2 text-xs text-orange-500 hover:text-orange-700"
                  >+ 新增品項</button>
                </div>
                <button
                  onClick={saveMenuFromPhoto}
                  disabled={saveLoading}
                  className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium"
                >
                  {saveLoading ? '儲存中…' : `✓ 建立餐廳與 ${parsedMenu.items.length} 項菜單`}
                </button>
              </div>
            )}
          </div>

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
