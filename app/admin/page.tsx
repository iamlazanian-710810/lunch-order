'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, type Restaurant, type MenuItem, type Employee } from '@/lib/supabase'

const today = new Date().toISOString().slice(0, 10)
const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || '1234'
type RestaurantWithMenu = Restaurant & { menu_items: MenuItem[] }

export default function AdminPage() {
  const [verified, setVerified] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)

  const [restaurants, setRestaurants] = useState<RestaurantWithMenu[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [todayOrders, setTodayOrders] = useState<any[]>([])
  const [tab, setTab] = useState<'today' | 'monthly' | 'restaurants' | 'employees'>('today')
  const [msg, setMsg] = useState('')
  const [monthlyOrders, setMonthlyOrders] = useState<any[]>([])

  const [menuImage, setMenuImage] = useState<string | null>(null)
  const [menuUploading, setMenuUploading] = useState(false)
  const menuFileRef = useRef<HTMLInputElement>(null)
  const [orderView, setOrderView] = useState<'person' | 'item'>('person')

  const [newRestName, setNewRestName] = useState('')
  const [newRestPhone, setNewRestPhone] = useState('')
  const [newRestNote, setNewRestNote] = useState('')
  const [selectedRestId, setSelectedRestId] = useState('')
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newEmpName, setNewEmpName] = useState('')

  useEffect(() => {
    if (sessionStorage.getItem('admin_verified') === 'true') setVerified(true)
  }, [])

  const submitPin = () => {
    if (pinInput === ADMIN_PIN) {
      sessionStorage.setItem('admin_verified', 'true')
      setVerified(true)
    } else {
      setPinError(true)
      setPinInput('')
      setTimeout(() => setPinError(false), 1500)
    }
  }

  const load = useCallback(async () => {
    const [{ data: rests }, { data: emps }, { data: sched }, { data: orders }] = await Promise.all([
      supabase.from('restaurants').select('*, menu_items(*)').order('sort_order'),
      supabase.from('employees').select('*').order('name'),
      supabase.from('daily_schedule').select('menu_image').eq('date', today).maybeSingle(),
      supabase.from('orders').select('id, item_name, qty, subtotal, note, employees(name)').eq('date', today),
    ])
    setRestaurants((rests ?? []) as RestaurantWithMenu[])
    setEmployees(emps ?? [])
    setMenuImage((sched as any)?.menu_image ?? null)
    setTodayOrders(orders ?? [])
  }, [])

  const loadMonthly = useCallback(async () => {
    const now = new Date()
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`
    const { data } = await supabase
      .from('orders')
      .select('id, date, item_name, note, subtotal, employees(name)')
      .gte('date', from).lte('date', to)
      .order('date', { ascending: false })
    setMonthlyOrders(data ?? [])
  }, [])

  useEffect(() => { if (verified) load() }, [load, verified])
  useEffect(() => { if (tab === 'monthly' && verified) loadMonthly() }, [tab, loadMonthly, verified])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1200
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = URL.createObjectURL(file)
    })

  const handleMenuUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMenuUploading(true)
    const dataUrl = await compressImage(file)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    await Promise.all([
      supabase.from('daily_schedule').upsert({ date: today, menu_image: dataUrl }, { onConflict: 'date' }),
      supabase.from('daily_schedule').update({ menu_image: null }).lt('date', cutoffStr).not('menu_image', 'is', null),
    ])
    setMenuImage(dataUrl)
    setMenuUploading(false)
    flash('菜單圖片已上傳')
  }

  const removeMenuImage = async () => {
    await supabase.from('daily_schedule').upsert({ date: today, menu_image: null }, { onConflict: 'date' })
    setMenuImage(null)
    if (menuFileRef.current) menuFileRef.current.value = ''
    flash('已移除菜單圖片')
  }

  const deleteOrder = async (id: string) => {
    await supabase.from('orders').delete().eq('id', id)
    load(); loadMonthly()
    flash('已刪除')
  }

  const addRestaurant = async () => {
    if (!newRestName.trim()) return flash('請輸入餐廳名稱')
    const { error } = await supabase.from('restaurants').insert({
      name: newRestName.trim(), phone: newRestPhone.trim() || null,
      note: newRestNote.trim() || null, sort_order: restaurants.length,
    })
    if (error) return flash('新增失敗：' + error.message)
    setNewRestName(''); setNewRestPhone(''); setNewRestNote('')
    flash('餐廳已新增'); load()
  }

  const deleteRestaurant = async (id: string, name: string) => {
    if (!confirm(`確定刪除「${name}」及其菜單？`)) return
    const { error } = await supabase.from('restaurants').delete().eq('id', id)
    if (error) return flash('刪除失敗：' + error.message)
    flash('已刪除'); load()
  }

  const addMenuItem = async () => {
    if (!selectedRestId) return flash('請選擇餐廳')
    if (!newItemName.trim()) return flash('請輸入品項名稱')
    const price = parseInt(newItemPrice)
    if (isNaN(price) || price <= 0) return flash('請輸入有效價格')
    const { error } = await supabase.from('menu_items').insert({ restaurant_id: selectedRestId, name: newItemName.trim(), price })
    if (error) return flash('新增失敗：' + error.message)
    setNewItemName(''); setNewItemPrice('')
    flash('品項已新增'); load()
  }

  const deleteMenuItem = async (id: string) => {
    await supabase.from('menu_items').delete().eq('id', id); load()
  }

  const addEmployee = async () => {
    if (!newEmpName.trim()) return flash('請輸入員工姓名')
    const { error } = await supabase.from('employees').insert({ name: newEmpName.trim() })
    if (error) return flash('新增失敗：' + error.message)
    setNewEmpName(''); flash('員工已新增'); load()
  }

  const deleteEmployee = async (id: string, name: string) => {
    if (!confirm(`確定刪除員工「${name}」？`)) return
    await supabase.from('employees').delete().eq('id', id); load()
  }

  const copyOrderList = () => {
    const lines = [`【今日午餐訂單】${today}`, '']
    const itemMap: Record<string, number> = {}
    for (const o of todayOrders as any[]) {
      const key = `${o.item_name ?? ''}${o.note ? `（${o.note}）` : ''}`
      itemMap[key] = (itemMap[key] ?? 0) + (o.qty ?? 1)
    }
    Object.entries(itemMap).forEach(([name, qty]) => lines.push(`${name} × ${qty}`))
    lines.push('')
    lines.push(`合計：$${(todayOrders as any[]).reduce((s, o) => s + o.subtotal, 0)}`)
    navigator.clipboard.writeText(lines.join('\n'))
    flash('已複製到剪貼簿！')
  }

  const tabClass = (t: string) =>
    `px-4 py-2 rounded-lg font-medium text-sm transition-colors ${tab === t ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`

  // PIN 驗證畫面
  if (!verified) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border p-8 w-full max-w-xs space-y-4">
          <h2 className="text-lg font-bold text-gray-800 text-center">管理員驗證</h2>
          <p className="text-sm text-gray-500 text-center">請輸入管理員 PIN 碼</p>
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN 碼"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitPin()}
            className={`w-full border rounded-lg px-4 py-3 text-center text-xl tracking-widest focus:outline-none focus:ring-2 ${pinError ? 'border-red-400 ring-red-300' : 'focus:ring-orange-400'}`}
            autoFocus
          />
          {pinError && <p className="text-red-500 text-sm text-center">PIN 碼錯誤，請重試</p>}
          <button onClick={submitPin}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg font-medium">
            確認進入
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">管理後台</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">{msg}</span>}
          <button onClick={() => { sessionStorage.removeItem('admin_verified'); setVerified(false) }}
            className="text-xs text-gray-400 hover:text-gray-600">登出</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button className={tabClass('today')} onClick={() => setTab('today')}>今日設定</button>
        <button className={tabClass('monthly')} onClick={() => setTab('monthly')}>本月記錄</button>
        <button className={tabClass('restaurants')} onClick={() => setTab('restaurants')}>餐廳管理</button>
        <button className={tabClass('employees')} onClick={() => setTab('employees')}>員工管理</button>
      </div>

      {tab === 'today' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">📋 上傳今日菜單圖片</h2>
            <input ref={menuFileRef} type="file" accept="image/*" capture="environment"
              onChange={handleMenuUpload}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-orange-500 file:text-white file:font-medium hover:file:bg-orange-600 cursor-pointer" />
            {menuUploading && <p className="text-sm text-gray-400 mt-2">上傳中…</p>}
            {menuImage && !menuUploading && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-green-600 font-medium">✓ 已上傳，員工可在主頁看到</p>
                  <button onClick={removeMenuImage} className="text-xs text-red-400 hover:text-red-600">移除</button>
                </div>
                <img src={menuImage} alt="今日菜單" className="max-h-64 rounded-lg border object-contain" />
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold text-gray-700">
                今日訂單（{todayOrders.length > 0 ? `${todayOrders.length} 筆` : '尚無訂單'}）
              </h2>
              <div className="flex items-center gap-2">
                {todayOrders.length > 0 && (
                  <>
                    <div className="flex rounded-lg overflow-hidden border text-sm">
                      <button
                        onClick={() => setOrderView('person')}
                        className={`px-3 py-1.5 ${orderView === 'person' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        依員工
                      </button>
                      <button
                        onClick={() => setOrderView('item')}
                        className={`px-3 py-1.5 ${orderView === 'item' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        依品項
                      </button>
                    </div>
                    <button onClick={copyOrderList} className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium">
                      複製叫餐清單
                    </button>
                  </>
                )}
              </div>
            </div>
            {todayOrders.length === 0 ? (
              <p className="text-gray-400 text-sm italic">還沒有人點餐</p>
            ) : orderView === 'person' ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left py-1">員工</th>
                    <th className="text-left py-1">餐點</th>
                    <th className="text-left py-1">備註</th>
                    <th className="text-right py-1">金額</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {(todayOrders as any[]).map((o, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 text-gray-700">{o.employees?.name}</td>
                      <td className="py-1.5 text-gray-700">{o.item_name}</td>
                      <td className="py-1.5 text-blue-500 text-xs">{o.note ?? ''}</td>
                      <td className="py-1.5 text-right text-orange-500">${o.subtotal}</td>
                      <td className="py-1.5 text-right">
                        <button onClick={() => deleteOrder(o.id)} className="text-red-300 hover:text-red-500 text-lg leading-none">×</button>
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td colSpan={3} className="pt-2 text-gray-700">合計</td>
                    <td className="pt-2 text-right text-orange-600">${(todayOrders as any[]).reduce((s, o) => s + o.subtotal, 0)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            ) : (() => {
              // 依品項分組
              const itemMap: Record<string, { count: number; total: number; persons: string[]; note: string }> = {}
              for (const o of todayOrders as any[]) {
                const key = o.item_name ?? ''
                if (!itemMap[key]) itemMap[key] = { count: 0, total: 0, persons: [], note: o.note ?? '' }
                itemMap[key].count += o.qty ?? 1
                itemMap[key].total += o.subtotal
                itemMap[key].persons.push(o.employees?.name ?? '未知')
              }
              const items = Object.entries(itemMap).sort((a, b) => b[1].count - a[1].count)
              return (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="text-left py-1">品項</th>
                      <th className="text-left py-1">誰點的</th>
                      <th className="text-right py-1">份數</th>
                      <th className="text-right py-1">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(([name, info]) => (
                      <tr key={name} className="border-b last:border-0">
                        <td className="py-1.5 text-gray-700">
                          <div>{name}</div>
                          {info.note && <div className="text-xs text-blue-500">備註：{info.note}</div>}
                        </td>
                        <td className="py-1.5 text-gray-500 text-xs">{info.persons.join('、')}</td>
                        <td className="py-1.5 text-right font-semibold text-gray-700">× {info.count}</td>
                        <td className="py-1.5 text-right text-orange-500">${info.total}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td colSpan={2} className="pt-2 text-gray-700">合計</td>
                      <td className="pt-2 text-right text-gray-700">× {(todayOrders as any[]).reduce((s, o) => s + (o.qty ?? 1), 0)}</td>
                      <td className="pt-2 text-right text-orange-600">${(todayOrders as any[]).reduce((s, o) => s + o.subtotal, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              )
            })()}
          </div>
        </div>
      )}

      {tab === 'monthly' && (() => {
        const byDate: Record<string, any[]> = {}
        for (const o of monthlyOrders as any[]) {
          if (!byDate[o.date]) byDate[o.date] = []
          byDate[o.date].push(o)
        }
        const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))
        const now = new Date()
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">{now.getFullYear()} 年 {now.getMonth() + 1} 月 訂餐明細</h2>
              <span className="text-sm text-gray-400">共 {monthlyOrders.length} 筆</span>
            </div>
            {dates.length === 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-400 italic">本月尚無訂餐記錄</div>
            )}
            {dates.map(date => {
              const dayOrders = byDate[date]
              const dayTotal = dayOrders.reduce((s: number, o: any) => s + o.subtotal, 0)
              const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })
              return (
                <div key={date} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b">
                    <span className="font-semibold text-gray-700">{dateLabel}</span>
                    <span className="text-orange-500 font-semibold">${dayTotal}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b">
                        <th className="text-left px-5 py-2">員工</th>
                        <th className="text-left px-2 py-2">餐點</th>
                        <th className="text-left px-2 py-2">備註</th>
                        <th className="text-right px-5 py-2">金額</th>
                        <th className="w-8 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayOrders.map((o: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-5 py-2 text-gray-700 whitespace-nowrap">{o.employees?.name}</td>
                          <td className="px-2 py-2 text-gray-700">{o.item_name}</td>
                          <td className="px-2 py-2 text-blue-500 text-xs">{o.note ?? ''}</td>
                          <td className="px-5 py-2 text-right text-orange-500">${o.subtotal}</td>
                          <td className="px-2 py-2 text-right">
                            <button onClick={() => deleteOrder(o.id)} className="text-red-300 hover:text-red-500 text-lg leading-none">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )
      })()}

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
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">新增餐廳</button>
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">新增菜單品項（供參考用）</h2>
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
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">新增品項</button>
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
                    className="text-sm text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded">刪除餐廳</button>
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
            {restaurants.length === 0 && <p className="text-gray-400 text-sm italic text-center py-4">尚無餐廳</p>}
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
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">新增</button>
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
