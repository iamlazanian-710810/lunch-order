'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase, type Employee, type DailyCategory } from '@/lib/supabase'
import { todayStr, tomorrowStr, dateLabel, type DayKey } from '@/lib/date'
import Planet from './Planet'
import OrderDoneOverlay from './OrderDoneOverlay'

type OrderRow = { item_name: string; price: string; note: string }
type PeerOrder = { employee_name: string; items: { id: string; name: string; price: number; note: string }[]; total: number }

export default function OrderBoard({
  category,
  title,
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
  // 完成動畫（純 UI）：送出成功才設值，按「好的」清空
  const [doneInfo, setDoneInfo] = useState<{ item: string; price: number } | null>(null)

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('*').order('name')
    setEmployees(data ?? [])
  }, [])

  // 切換今日/明日時，前一次還沒回來的查詢不可以覆蓋新的結果，
  // 否則會出現「切到明日卻顯示今日菜單」——照錯菜單點餐
  const stale = () => false

  const loadDay = useCallback(async (isStale: () => boolean = stale) => {
    const { data } = await supabase
      .from('daily_schedule')
      .select('menu_image, restaurant_name')
      .eq('date', date).eq('category', category).maybeSingle()
    if (isStale()) return
    setMenuImage((data as any)?.menu_image ?? null)
    setStoreName((data as any)?.restaurant_name ?? null)
  }, [date, category])

  const loadOrders = useCallback(async (isStale: () => boolean = stale) => {
    const { data } = await supabase
      .from('orders')
      .select('id, item_name, subtotal, note, employee_id, employees(name)')
      .eq('date', date)
      .eq('category', category)
    if (isStale()) return
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

  const loadMyOrders = useCallback(async (empId: string, isStale: () => boolean = stale) => {
    if (!empId) return setRows([{ item_name: '', price: '', note: '' }])
    const { data } = await supabase
      .from('orders')
      .select('item_name, subtotal, note')
      .eq('date', date)
      .eq('category', category)
      .eq('employee_id', empId)
    if (isStale()) return
    if (data && data.length > 0) {
      setRows(data.map((o: any) => ({ item_name: o.item_name ?? '', price: String(o.subtotal), note: o.note ?? '' })))
    } else {
      setRows([{ item_name: '', price: '', note: '' }])
    }
  }, [date, category])

  useEffect(() => { loadEmployees() }, [loadEmployees])

  useEffect(() => {
    let cancelled = false
    loadDay(() => cancelled)
    return () => { cancelled = true }
  }, [loadDay])

  useEffect(() => {
    let cancelled = false
    loadOrders(() => cancelled)
    return () => { cancelled = true }
  }, [loadOrders])

  // 切換今日/明日時，重新載入自己在那一天的訂單
  useEffect(() => {
    let cancelled = false
    loadMyOrders(selectedEmployee, () => cancelled)
    setMessage('')
    return () => { cancelled = true }
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
    setDoneInfo({
      item: valid.map(r => r.item_name.trim()).join('、'),
      price: valid.reduce((sum, r) => sum + parseInt(r.price), 0),
    })
    loadOrders()
  }

  const deleteMyOrder = async (orderId: string) => {
    await supabase.from('orders').delete().eq('id', orderId)
    loadOrders()
    loadMyOrders(selectedEmployee)
  }

  const dayTabClass = (k: DayKey) => `cosmic-tab flex-1 text-sm flex flex-col sm:flex-row items-center justify-center sm:gap-1.5 py-1.5 leading-snug ${day === k ? 'cosmic-tab--on' : ''}`

  const myName = employees.find(e => e.id === selectedEmployee)?.name

  return (
    <div className="space-y-5" data-theme={category}>
      <div className="glass-card glass-card--accent p-5">
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="cosmic-eyebrow">ORDER DECK · <span className="cosmic-num">{dateLabel(date)}</span></span>
            <h1 className="cosmic-title text-2xl sm:text-3xl">{title}</h1>
          </div>
          <Planet className="shrink-0" />
        </div>
        {/* 今日 / 明日 切換 */}
        <div className="flex gap-2">
          <button className={dayTabClass('today')} onClick={() => setDay('today')}>
            <span>今日</span><span className="hidden sm:inline">·</span><span className="cosmic-num">{dateLabel(dates.today)}</span>
          </button>
          <button className={dayTabClass('tomorrow')} onClick={() => setDay('tomorrow')}>
            <span>明日預訂</span><span className="hidden sm:inline">·</span><span className="cosmic-num">{dateLabel(dates.tomorrow)}</span>
          </button>
        </div>
        {day === 'tomorrow' && (
          <p className="cosmic-soft mt-3 text-xs text-gray-600 px-3 py-2">
            這是<span className="font-semibold text-white">明天（{dateLabel(dates.tomorrow)}）</span>的預訂，和今天的訂單完全分開計算。到了明天，這筆會自動變成「今日」的訂單。
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* 本日店家 + 菜單圖片 */}
          {(menuImage || storeName) ? (
            <div className="glass-card glass-card--accent p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="cosmic-eyebrow cosmic-accent" style={{ fontSize: 11 }}>
                    {day === 'today' ? "TODAY'S STATION" : "TOMORROW'S STATION"}
                  </span>
                  <p className="text-sm text-gray-600">
                    {dayWord}店家：
                    {storeName ? <span className="text-lg font-bold text-white">{storeName}</span> : <span className="text-gray-400">未填寫</span>}
                  </p>
                </div>
                {menuImage && <span className="text-xs text-gray-400 shrink-0">點圖放大</span>}
              </div>
              {menuImage && (
                <img
                  src={menuImage}
                  alt="菜單"
                  className="w-full rounded-2xl object-contain max-h-80 cursor-zoom-in border"
                  onClick={() => setLightbox(true)}
                />
              )}
            </div>
          ) : (
            <div className="glass-card p-5 text-center text-gray-400 italic text-sm">
              管理員尚未設定{dayWord}的店家與菜單
            </div>
          )}

          {/* 點餐表單 */}
          <div className="glass-card p-5 space-y-4">
            <h2 className="text-lg font-bold text-white">我要點餐</h2>
            <div className="flex flex-col gap-1.5">
              <label className="cosmic-label">我是</label>
              <select
                className="cosmic-field"
                value={selectedEmployee}
                onChange={e => handleEmployeeChange(e.target.value)}
              >
                <option value="">-- 請選擇姓名 --</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            <div>
              <p className="cosmic-label mb-2">
                點餐內容
                <span className="ml-2 text-xs text-gray-400">
                  （{dayWord} {dateLabel(date)}）
                </span>
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-1.5 text-xs text-gray-400 px-1">
                  <span className="col-span-5">餐點名稱</span>
                  <span className="col-span-3">價格</span>
                  <span className="col-span-3">備註</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                    <input
                      className="cosmic-field cosmic-field--sm col-span-5"
                      placeholder="例：排骨飯"
                      value={row.item_name}
                      onChange={e => updateRow(i, 'item_name', e.target.value)}
                    />
                    <input
                      className="cosmic-field cosmic-field--sm cosmic-num col-span-3"
                      placeholder="120"
                      type="number"
                      value={row.price}
                      onChange={e => updateRow(i, 'price', e.target.value)}
                    />
                    <input
                      className="cosmic-field cosmic-field--sm col-span-3"
                      placeholder="不辣"
                      value={row.note}
                      onChange={e => updateRow(i, 'note', e.target.value)}
                    />
                    <button onClick={() => removeRow(i)} aria-label="刪除這一筆"
                      className="cosmic-del col-span-1">×</button>
                  </div>
                ))}
              </div>
              <button onClick={addRow} className="cosmic-link mt-2 text-sm min-h-11">＋ 新增一筆</button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
              <span className="font-semibold text-gray-600">
                小計：<span className="cosmic-num text-xl font-bold text-white">${total}</span>
              </span>
              <button onClick={handleSave} disabled={saving}
                className="cosmic-btn-primary text-base">
                {saving ? '儲存中…' : `確認送出（${dayWord}）`}
              </button>
            </div>
            {message && (
              <p className="text-sm text-center cosmic-err">
                {message}
              </p>
            )}
          </div>
        </div>

        {/* 訂單統計 */}
        <div className="glass-card p-5 self-start">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h2 className="text-lg font-bold text-white">
              {dayWord}訂單統計
              <span className="ml-2 text-xs font-normal text-gray-400 cosmic-num">{dateLabel(date)}</span>
            </h2>
            {peerOrders.length > 0 && (
              <span className="cosmic-num cosmic-accent text-sm shrink-0">{peerOrders.length} 人</span>
            )}
          </div>
          {peerOrders.length === 0 ? (
            <p className="text-gray-400 text-sm italic py-2">
              {day === 'today' ? '還沒有人點餐' : '還沒有人預訂明天'}
            </p>
          ) : (
            <div>
              {peerOrders.map(p => (
                <div key={p.employee_name} className="flex gap-3 py-3 border-b">
                  <span className="cosmic-avatar">{(p.employee_name.split('-').pop() || p.employee_name).slice(0, 1)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2 text-[15px] font-medium text-white">
                      <span>{p.employee_name}</span>
                      <span className="cosmic-num font-semibold">${p.total}</span>
                    </div>
                    {p.items.map((item, idx) => (
                      <div key={idx} className="mt-0.5">
                        <div className="text-sm text-gray-600 flex justify-between items-center gap-1">
                          <span className="flex-1">{item.name}</span>
                          <div className="flex items-center gap-1">
                            <span className="cosmic-num text-gray-600">${item.price}</span>
                            {myName && p.employee_name === myName && (
                              <button onClick={() => deleteMyOrder(item.id)} aria-label={`刪除 ${item.name}`}
                                className="cosmic-del">×</button>
                            )}
                          </div>
                        </div>
                        {item.note && <div className="text-xs cosmic-memo">備註：{item.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-baseline font-bold text-white pt-3">
                <span>{dayWord}總計</span>
                <span className="cosmic-num text-xl cosmic-accent">${peerOrders.reduce((s, p) => s + p.total, 0)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && menuImage && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}>
          <img src={menuImage} alt="菜單" className="max-w-full max-h-full rounded-lg object-contain" />
          <button className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-300 min-w-11 min-h-11"
            onClick={() => setLightbox(false)}>×</button>
        </div>
      )}

      {/* 送出成功的完成動畫 */}
      {doneInfo && (
        <OrderDoneOverlay item={doneInfo.item} price={doneInfo.price} onClose={() => setDoneInfo(null)} />
      )}
    </div>
  )
}
