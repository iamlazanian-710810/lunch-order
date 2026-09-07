'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase, type Employee, type DailyCategory } from '@/lib/supabase'
import { todayStr, tomorrowStr, dateLabel, type DayKey } from '@/lib/date'

type OrderRow = { item_name: string; price: string; note: string }
type PeerOrder = { employee_name: string; items: { id: string; name: string; price: number; note: string }[]; total: number }

export default function OrderBoard({
  category,
  title,
  accent = 'orange',
}: {
  category: DailyCategory
  title: string
  accent?: 'orange' | 'sky'
}) {
  // 今日/明日的日期在元件掛載時算一次（用本機時區，不是 UTC）
  const dates = useMemo(() => ({ today: todayStr(), tomorrow: tomorrowStr() }), [])
  const [day, setDay] = useState<DayKey>('today')
  const date = dates[day]

  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [menuImage, setMenuImage] = useState<string | null>(null)
  const [storeName, setStoreName] = useState<string | null>(null)
  const [rows, setRows] = useState<OrderRow[]>([{ item_name: '', price: '', note: '' }])
  const [peerOrders, setPeerOrders] = useState<PeerOrder[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [lightbox, setLightbox] = useState(false)

  // 主題色（午餐橘、飲料天藍）
  const c = {
    orange: { ring: 'focus:ring-orange-400', text: 'text-orange-500', text2: 'text-orange-400', text3: 'text-orange-600', btn: 'bg-orange-500 hover:bg-orange-600', link: 'text-orange-500 hover:text-orange-700', tab: 'bg-orange-500', border: 'border-orange-200', soft: 'bg-orange-50' },
    sky: { ring: 'focus:ring-sky-400', text: 'text-sky-500', text2: 'text-sky-400', text3: 'text-sky-600', btn: 'bg-sky-500 hover:bg-sky-600', link: 'text-sky-500 hover:text-sky-700', tab: 'bg-sky-500', border: 'border-sky-200', soft: 'bg-sky-50' },
  }[accent]

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('*').order('name')
    setEmployees(data ?? [])
  }, [])

  const loadDay = useCallback(async () => {
    const { data } = await supabase
      .from('daily_schedule')
      .select('menu_image, restaurant_name')
      .eq('date', date).eq('category', category).maybeSingle()
    setMenuImage((data as any)?.menu_image ?? null)
    setStoreName((data as any)?.restaurant_name ?? null)
  }, [date, category])

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, item_name, subtotal, note, employee_id, employees(name)')
      .eq('date', date)
      .eq('category', category)
    if (!data) return setPeerOrders([])

    const map: Record<string, PeerOrder> = {}
    for (const o of data as any[]) {
      const empName = o.employees?.name ?? '未知'
      if (!map[empName]) map[empName] = { employee_name: empName, items: [], total: 0 }
      map[empName].items.push({ id: o.id, name: o.item_name ?? '', price: o.subtotal, note: o.note ?? '' })
      map[empName].total += o.subtotal
    }
    setPeerOrders(Object.values(map).sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'zh-TW')))
  }, [date, category])

  const loadMyOrders = useCallback(async (empId: string) => {
    if (!empId) return setRows([{ item_name: '', price: '', note: '' }])
    const { data } = await supabase
      .from('orders')
      .select('item_name, subtotal, note')
      .eq('date', date)
      .eq('category', category)
      .eq('employee_id', empId)
    if (data && data.length > 0) {
      setRows(data.map((o: any) => ({ item_name: o.item_name ?? '', price: String(o.subtotal), note: o.note ?? '' })))
    } else {
      setRows([{ item_name: '', price: '', note: '' }])
    }
  }, [date, category])

  useEffect(() => { loadEmployees() }, [loadEmployees])
  useEffect(() => { loadDay() }, [loadDay])
  useEffect(() => { loadOrders() }, [loadOrders])
  // 切換今日/明日時，重新載入自己在那一天的訂單
  useEffect(() => {
    loadMyOrders(selectedEmployee)
    setMessage('')
  }, [loadMyOrders]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEmployeeChange = (id: string) => {
    setSelectedEmployee(id)
    setMessage('')
    loadMyOrders(id)
  }

  const updateRow = (i: number, field: keyof OrderRow, val: string) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  const addRow = () => setRows(prev => [...prev, { item_name: '', price: '', note: '' }])
  const removeRow = (i: number) => setRows(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i))

  const total = rows.reduce((s, r) => s + (parseInt(r.price) || 0), 0)

  const dayWord = day === 'today' ? '今日' : '明日'

  const handleSave = async () => {
    if (!selectedEmployee) return setMessage('請先選擇姓名')
    const valid = rows.filter(r => r.item_name.trim() && parseInt(r.price) > 0)
    if (valid.length === 0) return setMessage('請至少填一筆餐點名稱與價格')
    setSaving(true)
    setMessage('')
    // 只刪除「這一天 + 這個分類」的紀錄，不會影響另一天或其他分類
    await supabase.from('orders').delete()
      .eq('date', date).eq('category', category).eq('employee_id', selectedEmployee)
    const insertRows = valid.map(r => ({
      date,
      category,
      employee_id: selectedEmployee,
      item_name: r.item_name.trim(),
      note: r.note.trim() || null,
      qty: 1,
      subtotal: parseInt(r.price),
      menu_item_id: null,
    }))
    const { error } = await supabase.from('orders').insert(insertRows)
    setSaving(false)
    if (error) return setMessage('儲存失敗：' + error.message)
    setMessage('已送出！（' + dayWord + '）')
    loadOrders()
  }

  const deleteMyOrder = async (orderId: string) => {
    await supabase.from('orders').delete().eq('id', orderId)
    loadOrders()
    loadMyOrders(selectedEmployee)
  }

  const dayTabClass = (k: DayKey) =>
    `flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
      day === k ? `${c.tab} text-white shadow-sm` : 'bg-white text-gray-500 hover:bg-gray-50 border'
    }`

  const myName = employees.find(e => e.id === selectedEmployee)?.name

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm p-5 border">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h1 className="text-xl font-bold text-gray-800">{title}</h1>
          <span className={`text-sm font-medium ${c.text}`}>{dateLabel(date)}</span>
        </div>
        {/* 今日 / 明日 切換 */}
        <div className="flex gap-2">
          <button className={dayTabClass('today')} onClick={() => setDay('today')}>
            今日 · {dateLabel(dates.today)}
          </button>
          <button className={dayTabClass('tomorrow')} onClick={() => setDay('tomorrow')}>
            明日預訂 · {dateLabel(dates.tomorrow)}
          </button>
        </div>
        {day === 'tomorrow' && (
          <p className={`mt-3 text-xs text-gray-500 ${c.soft} border ${c.border} rounded-lg px-3 py-2`}>
            這是<span className="font-semibold">明天（{dateLabel(dates.tomorrow)}）</span>的預訂，和今天的訂單完全分開計算。到了明天，這筆會自動變成「今日」的訂單。
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* 本日店家 + 菜單圖片 */}
          {(menuImage || storeName) ? (
            <div className="bg-white rounded-xl shadow-sm border p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">
                  {dayWord}店家：
                  {storeName ? <span className={`font-semibold ${c.text}`}>{storeName}</span> : <span className="text-gray-400">未填寫</span>}
                </p>
                {menuImage && <span className="text-xs text-gray-400">點圖放大</span>}
              </div>
              {menuImage && (
                <img
                  src={menuImage}
                  alt="菜單"
                  className="w-full rounded-lg object-contain max-h-80 cursor-zoom-in"
                  onClick={() => setLightbox(true)}
                />
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border p-5 text-center text-gray-400 italic text-sm">
              管理員尚未設定{dayWord}的店家與菜單
            </div>
          )}

          {/* 點餐表單 */}
          <div className="bg-white rounded-xl shadow-sm p-5 border space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">我是</label>
              <select
                className={`w-full border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 ${c.ring}`}
                value={selectedEmployee}
                onChange={e => handleEmployeeChange(e.target.value)}
              >
                <option value="">-- 請選擇姓名 --</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                點餐內容
                <span className="ml-2 text-xs font-normal text-gray-400">
                  （{dayWord} {dateLabel(date)}）
                </span>
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-1 text-xs text-gray-400 px-1">
                  <span className="col-span-5">餐點名稱</span>
                  <span className="col-span-3">價格</span>
                  <span className="col-span-3">備註</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 items-center">
                    <input
                      className={`col-span-5 border rounded-lg px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 ${c.ring}`}
                      placeholder="例：排骨飯"
                      value={row.item_name}
                      onChange={e => updateRow(i, 'item_name', e.target.value)}
                    />
                    <input
                      className={`col-span-3 border rounded-lg px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 ${c.ring}`}
                      placeholder="120"
                      type="number"
                      value={row.price}
                      onChange={e => updateRow(i, 'price', e.target.value)}
                    />
                    <input
                      className={`col-span-3 border rounded-lg px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 ${c.ring}`}
                      placeholder="不辣"
                      value={row.note}
                      onChange={e => updateRow(i, 'note', e.target.value)}
                    />
                    <button onClick={() => removeRow(i)}
                      className="col-span-1 text-red-300 hover:text-red-500 text-lg leading-none text-center">×</button>
                  </div>
                ))}
              </div>
              <button onClick={addRow} className={`mt-2 text-sm font-medium ${c.link}`}>＋ 新增一筆</button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="font-semibold text-gray-700">
                小計：<span className={c.text}>${total}</span>
              </span>
              <button onClick={handleSave} disabled={saving}
                className={`${c.btn} text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50`}>
                {saving ? '儲存中…' : `確認送出（${dayWord}）`}
              </button>
            </div>
            {message && (
              <p className={`text-sm text-center ${message.startsWith('儲存失敗') ? 'text-red-500' : 'text-green-600'}`}>
                {message}
              </p>
            )}
          </div>
        </div>

        {/* 訂單統計 */}
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <h2 className="font-semibold text-gray-700 mb-3">
            {dayWord}訂單統計
            <span className="ml-2 text-xs font-normal text-gray-400">{dateLabel(date)}</span>
          </h2>
          {peerOrders.length === 0 ? (
            <p className="text-gray-400 text-sm italic">
              {day === 'today' ? '還沒有人點餐' : '還沒有人預訂明天'}
            </p>
          ) : (
            <div className="space-y-3">
              {peerOrders.map(p => (
                <div key={p.employee_name} className="border-b pb-2 last:border-0">
                  <div className="flex justify-between text-sm font-medium text-gray-800 mb-0.5">
                    <span>{p.employee_name}</span>
                    <span className={c.text}>${p.total}</span>
                  </div>
                  {p.items.map((item, idx) => (
                    <div key={idx} className="ml-2 mt-1">
                      <div className="text-xs text-gray-600 flex justify-between items-start gap-1">
                        <span className="flex-1">{item.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={c.text2}>${item.price}</span>
                          {myName && p.employee_name === myName && (
                            <button onClick={() => deleteMyOrder(item.id)}
                              className="text-red-300 hover:text-red-500 text-base leading-none">×</button>
                          )}
                        </div>
                      </div>
                      {item.note && <div className="text-xs text-blue-500 mt-0.5">備註：{item.note}</div>}
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex justify-between font-bold text-gray-800 pt-1">
                <span>{dayWord}總計</span>
                <span className={c.text3}>${peerOrders.reduce((s, p) => s + p.total, 0)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && menuImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}>
          <img src={menuImage} alt="菜單" className="max-w-full max-h-full rounded-lg object-contain" />
          <button className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-300"
            onClick={() => setLightbox(false)}>×</button>
        </div>
      )}
    </div>
  )
}
