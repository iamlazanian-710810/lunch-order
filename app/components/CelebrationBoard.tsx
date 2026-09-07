'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  supabase, eventStatus, EVENT_STATUS_LABEL,
  type Employee, type CelebrationEvent, type EventStatus,
} from '@/lib/supabase'
import { todayStr, dateLabel } from '@/lib/date'

type OrderRow = { item_name: string; price: string; note: string }
type PeerOrder = { employee_name: string; items: { id: string; name: string; price: number; note: string }[]; total: number }

export default function CelebrationBoard() {
  const today = useMemo(() => todayStr(), [])

  const [events, setEvents] = useState<CelebrationEvent[]>([])
  const [eventId, setEventId] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [rows, setRows] = useState<OrderRow[]>([{ item_name: '', price: '', note: '' }])
  const [peerOrders, setPeerOrders] = useState<PeerOrder[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [lightbox, setLightbox] = useState(false)
  const [loading, setLoading] = useState(true)

  const event = events.find(e => e.id === eventId) ?? null
  const status: EventStatus | null = event ? eventStatus(event, today) : null
  const canOrder = status === 'open'

  // 載入活動清單：優先選「開放中」的，沒有就選最近一次的活動（唯讀回顧）
  const loadEvents = useCallback(async () => {
    const [{ data: evs }, { data: emps }] = await Promise.all([
      supabase.from('celebration_events').select('*').order('start_date', { ascending: false }),
      supabase.from('employees').select('*').order('name'),
    ])
    const list = (evs ?? []) as CelebrationEvent[]
    setEvents(list)
    setEmployees(emps ?? [])
    const open = list.find(e => eventStatus(e, todayStr()) === 'open')
    setEventId(prev => prev || (open ?? list[0])?.id || '')
    setLoading(false)
  }, [])

  // 切換活動時，前一個活動還沒回來的查詢不可以覆蓋新活動的結果
  const stale = () => false

  const loadOrders = useCallback(async (isStale: () => boolean = stale) => {
    if (!eventId) return setPeerOrders([])
    const { data } = await supabase
      .from('orders')
      .select('id, item_name, subtotal, note, employee_id, employees(name)')
      .eq('category', 'celebration')
      .eq('event_id', eventId)
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
  }, [eventId])

  const loadMyOrders = useCallback(async (empId: string, isStale: () => boolean = stale) => {
    if (!empId || !eventId) return setRows([{ item_name: '', price: '', note: '' }])
    const { data } = await supabase
      .from('orders')
      .select('item_name, subtotal, note')
      .eq('category', 'celebration')
      .eq('event_id', eventId)
      .eq('employee_id', empId)
    if (isStale()) return
    if (data && data.length > 0) {
      setRows(data.map((o: any) => ({ item_name: o.item_name ?? '', price: String(o.subtotal), note: o.note ?? '' })))
    } else {
      setRows([{ item_name: '', price: '', note: '' }])
    }
  }, [eventId])

  useEffect(() => { loadEvents() }, [loadEvents])

  useEffect(() => {
    let cancelled = false
    loadOrders(() => cancelled)
    return () => { cancelled = true }
  }, [loadOrders])

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

  const handleSave = async () => {
    if (!event) return
    if (!canOrder) return setMessage('這個活動目前不開放訂購或修改')
    if (!selectedEmployee) return setMessage('請先選擇姓名')
    const valid = rows.filter(r => r.item_name.trim() && parseInt(r.price) > 0)
    if (valid.length === 0) return setMessage('請至少填一筆餐點名稱與價格')
    setSaving(true)
    setMessage('')
    // 整個活動期間，每個人只有一份訂單：先清掉舊的，再整批寫入
    await supabase.from('orders').delete()
      .eq('category', 'celebration').eq('event_id', event.id).eq('employee_id', selectedEmployee)
    const insertRows = valid.map(r => ({
      date: today,
      category: 'celebration',
      event_id: event.id,
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
    setMessage('已送出！截止前都可以回來修改')
    loadOrders()
  }

  const deleteMyOrder = async (orderId: string) => {
    if (!canOrder) return
    await supabase.from('orders').delete().eq('id', orderId)
    loadOrders()
    loadMyOrders(selectedEmployee)
  }

  const myName = employees.find(e => e.id === selectedEmployee)?.name

  // 全員彙整（依品項），給負責叫餐的人用
  const itemSummary = (() => {
    const map: Record<string, { name: string; note: string; count: number; total: number }> = {}
    for (const p of peerOrders) {
      for (const it of p.items) {
        const key = `${it.name}__${it.note}`
        if (!map[key]) map[key] = { name: it.name, note: it.note, count: 0, total: 0 }
        map[key].count += 1
        map[key].total += it.price
      }
    }
    return Object.values(map).sort((a, b) => b.count - a.count)
  })()

  const grandTotal = peerOrders.reduce((s, p) => s + p.total, 0)

  const statusBadge = (st: EventStatus) => {
    const cls = st === 'open'
      ? 'bg-rose-500 text-white'
      : st === 'upcoming' ? 'bg-amber-100 text-amber-700 border border-amber-200'
      : 'bg-gray-200 text-gray-600'
    return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{EVENT_STATUS_LABEL[st]}</span>
  }

  if (loading) return <p className="text-gray-400 text-center py-12">載入中…</p>

  if (events.length === 0) {
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <h1 className="text-xl font-bold text-gray-800">慶祝活動</h1>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center space-y-2">
          <p className="text-gray-500">目前沒有任何慶祝活動</p>
          <p className="text-sm text-gray-400">
            請管理員到「管理後台 → 慶祝活動」新增活動，填好活動名稱與開放訂購的起訖日期。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 活動標題卡 */}
      <div className="bg-white rounded-xl shadow-sm p-5 border space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold text-gray-800">慶祝活動</h1>
          {status && statusBadge(status)}
        </div>

        {events.length > 1 && (
          <select
            value={eventId}
            onChange={e => { setEventId(e.target.value); setMessage('') }}
            className="w-full border rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name}（{EVENT_STATUS_LABEL[eventStatus(ev, today)]}）
              </option>
            ))}
          </select>
        )}

        {event && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 space-y-1">
            <p className="text-lg font-bold text-rose-600">{event.name}</p>
            <p className="text-sm text-gray-600">
              訂購期間：{dateLabel(event.start_date)} ～ {dateLabel(event.end_date)}
            </p>
            {event.restaurant_name && (
              <p className="text-sm text-gray-600">店家：<span className="font-semibold text-rose-500">{event.restaurant_name}</span></p>
            )}
            {event.note && <p className="text-sm text-gray-500">說明：{event.note}</p>}
            <p className="text-xs text-gray-500 pt-1">
              {status === 'open' && '整段期間只算一張訂單，截止前隨時可以回來修改。'}
              {status === 'upcoming' && `尚未開放，${dateLabel(event.start_date)} 才開始收單。`}
              {status === 'closed' && '已截止，訂單已鎖定。如需修改請找管理員。'}
            </p>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* 菜單圖 */}
          {event?.menu_image ? (
            <div className="bg-white rounded-xl shadow-sm border p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">活動菜單</p>
                <span className="text-xs text-gray-400">點圖放大</span>
              </div>
              <img src={event.menu_image} alt="活動菜單"
                className="w-full rounded-lg object-contain max-h-80 cursor-zoom-in"
                onClick={() => setLightbox(true)} />
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border p-5 text-center text-gray-400 italic text-sm">
              管理員尚未上傳活動菜單
            </div>
          )}

          {/* 點餐表單 */}
          <div className="bg-white rounded-xl shadow-sm p-5 border space-y-4">
            {!canOrder && (
              <div className="bg-gray-100 border rounded-lg px-3 py-2 text-sm text-gray-600">
                {status === 'closed'
                  ? '此活動已截止，以下為唯讀，不能修改。'
                  : '此活動尚未開放訂購，以下為唯讀。'}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">我是</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                value={selectedEmployee}
                onChange={e => handleEmployeeChange(e.target.value)}
              >
                <option value="">-- 請選擇姓名 --</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">我的訂購內容（整個活動共一份）</p>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-1 text-xs text-gray-400 px-1">
                  <span className="col-span-5">品項名稱</span>
                  <span className="col-span-3">價格</span>
                  <span className="col-span-3">備註</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 items-center">
                    <input
                      className="col-span-5 border rounded-lg px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:bg-gray-50"
                      placeholder="例：巧克力蛋糕"
                      disabled={!canOrder}
                      value={row.item_name}
                      onChange={e => updateRow(i, 'item_name', e.target.value)}
                    />
                    <input
                      className="col-span-3 border rounded-lg px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:bg-gray-50"
                      placeholder="150" type="number"
                      disabled={!canOrder}
                      value={row.price}
                      onChange={e => updateRow(i, 'price', e.target.value)}
                    />
                    <input
                      className="col-span-3 border rounded-lg px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:bg-gray-50"
                      placeholder="不要奶油"
                      disabled={!canOrder}
                      value={row.note}
                      onChange={e => updateRow(i, 'note', e.target.value)}
                    />
                    {canOrder && (
                      <button onClick={() => removeRow(i)}
                        className="col-span-1 text-red-300 hover:text-red-500 text-lg leading-none text-center">×</button>
                    )}
                  </div>
                ))}
              </div>
              {canOrder && (
                <button onClick={addRow} className="mt-2 text-sm font-medium text-rose-500 hover:text-rose-700">
                  ＋ 新增一筆
                </button>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="font-semibold text-gray-700">
                小計：<span className="text-rose-500">${total}</span>
              </span>
              <button onClick={handleSave} disabled={saving || !canOrder}
                className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                {saving ? '儲存中…' : '確認送出'}
              </button>
            </div>
            {message && (
              <p className={`text-sm text-center ${message.startsWith('儲存失敗') || message.startsWith('這個活動') ? 'text-red-500' : 'text-green-600'}`}>
                {message}
              </p>
            )}
          </div>
        </div>

        {/* 活動彙總 */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-5 border">
            <h2 className="font-semibold text-gray-700 mb-3">活動訂單彙總（依同事）</h2>
            {peerOrders.length === 0 ? (
              <p className="text-gray-400 text-sm italic">還沒有人訂購</p>
            ) : (
              <div className="space-y-3">
                {peerOrders.map(p => (
                  <div key={p.employee_name} className="border-b pb-2 last:border-0">
                    <div className="flex justify-between text-sm font-medium text-gray-800 mb-0.5">
                      <span>{p.employee_name}</span>
                      <span className="text-rose-500">${p.total}</span>
                    </div>
                    {p.items.map((item, idx) => (
                      <div key={idx} className="ml-2 mt-1">
                        <div className="text-xs text-gray-600 flex justify-between items-start gap-1">
                          <span className="flex-1">{item.name}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-rose-400">${item.price}</span>
                            {canOrder && myName && p.employee_name === myName && (
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
                  <span>活動總計</span>
                  <span className="text-rose-600">${grandTotal}</span>
                </div>
              </div>
            )}
          </div>

          {itemSummary.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5 border">
              <h2 className="font-semibold text-gray-700 mb-3">叫餐彙整（依品項）</h2>
              <table className="w-full text-sm">
                <tbody>
                  {itemSummary.map((it, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 text-gray-700">
                        <div>{it.name}</div>
                        {it.note && <div className="text-xs text-blue-500">備註：{it.note}</div>}
                      </td>
                      <td className="py-1.5 text-right font-semibold text-gray-700 w-14">× {it.count}</td>
                      <td className="py-1.5 text-right text-rose-500 w-20">${it.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {lightbox && event?.menu_image && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}>
          <img src={event.menu_image} alt="活動菜單" className="max-w-full max-h-full rounded-lg object-contain" />
          <button className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-300"
            onClick={() => setLightbox(false)}>×</button>
        </div>
      )}
    </div>
  )
}
