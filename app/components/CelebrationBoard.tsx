'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  supabase, eventStatus, EVENT_STATUS_LABEL,
  type Employee, type CelebrationEvent, type EventStatus,
} from '@/lib/supabase'
import { todayStr, dateLabel } from '@/lib/date'
import Planet from './Planet'
import OrderDoneOverlay from './OrderDoneOverlay'

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
  // 完成動畫（純 UI）：送出成功才設值，按「好的」清空
  const [doneInfo, setDoneInfo] = useState<{ item: string; price: number } | null>(null)

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
    setDoneInfo({
      item: valid.map(r => r.item_name.trim()).join('、'),
      price: valid.reduce((sum, r) => sum + parseInt(r.price), 0),
    })
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
    const cls = st === 'open' ? 'cosmic-chip--on' : st === 'upcoming' ? 'cosmic-chip--wait' : ''
    return <span className={`cosmic-chip font-semibold ${cls}`}>{EVENT_STATUS_LABEL[st]}</span>
  }

  if (loading) return <p className="text-gray-400 text-center py-12">載入中…</p>

  if (events.length === 0) {
    return (
      <div className="space-y-5" data-theme="celebration">
        <div className="glass-card glass-card--accent p-5 flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="cosmic-eyebrow">CELEBRATION DECK</span>
            <h1 className="cosmic-title text-2xl sm:text-3xl">慶祝活動</h1>
          </div>
          <Planet className="shrink-0" />
        </div>
        <div className="glass-card p-8 text-center space-y-2">
          <p className="text-gray-500">目前沒有任何慶祝活動</p>
          <p className="text-sm text-gray-400">
            請管理員到「管理後台 → 慶祝活動」新增活動，填好活動名稱與開放訂購的起訖日期。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5" data-theme="celebration">
      {/* 活動標題卡 */}
      <div className="glass-card glass-card--accent p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="cosmic-eyebrow">CELEBRATION DECK</span>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="cosmic-title text-2xl sm:text-3xl">慶祝活動</h1>
              {status && statusBadge(status)}
            </div>
          </div>
          <Planet className="shrink-0" />
        </div>

        {events.length > 1 && (
          <select
            value={eventId}
            onChange={e => { setEventId(e.target.value); setMessage('') }}
            className="cosmic-field"
          >
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name}（{EVENT_STATUS_LABEL[eventStatus(ev, today)]}）
              </option>
            ))}
          </select>
        )}

        {event && (
          <div className="cosmic-soft p-4 space-y-1">
            <p className="text-lg font-bold text-white">{event.name}</p>
            <p className="text-sm text-gray-600">
              訂購期間：<span className="cosmic-num">{dateLabel(event.start_date)} ～ {dateLabel(event.end_date)}</span>
            </p>
            {event.restaurant_name && (
              <p className="text-sm text-gray-600">店家：<span className="font-semibold cosmic-accent">{event.restaurant_name}</span></p>
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
            <div className="glass-card glass-card--accent p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-base font-bold text-white">活動菜單</p>
                <span className="text-xs text-gray-400">點圖放大</span>
              </div>
              <img src={event.menu_image} alt="活動菜單"
                className="w-full rounded-2xl object-contain max-h-80 cursor-zoom-in border"
                onClick={() => setLightbox(true)} />
            </div>
          ) : (
            <div className="glass-card p-5 text-center text-gray-400 italic text-sm">
              管理員尚未上傳活動菜單
            </div>
          )}

          {/* 點餐表單 */}
          <div className="glass-card p-5 space-y-4">
            <h2 className="text-lg font-bold text-white">我要訂購</h2>
            {!canOrder && (
              <div className="cosmic-inset px-3 py-2 text-sm text-gray-600">
                {status === 'closed'
                  ? '此活動已截止，以下為唯讀，不能修改。'
                  : '此活動尚未開放訂購，以下為唯讀。'}
              </div>
            )}
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
              <p className="cosmic-label mb-2">我的訂購內容（整個活動共一份）</p>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-1.5 text-xs text-gray-400 px-1">
                  <span className="col-span-5">品項名稱</span>
                  <span className="col-span-3">價格</span>
                  <span className="col-span-3">備註</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                    <input
                      className="cosmic-field cosmic-field--sm col-span-5"
                      placeholder="例：巧克力蛋糕"
                      disabled={!canOrder}
                      value={row.item_name}
                      onChange={e => updateRow(i, 'item_name', e.target.value)}
                    />
                    <input
                      className="cosmic-field cosmic-field--sm cosmic-num col-span-3"
                      placeholder="150" type="number"
                      disabled={!canOrder}
                      value={row.price}
                      onChange={e => updateRow(i, 'price', e.target.value)}
                    />
                    <input
                      className="cosmic-field cosmic-field--sm col-span-3"
                      placeholder="不要奶油"
                      disabled={!canOrder}
                      value={row.note}
                      onChange={e => updateRow(i, 'note', e.target.value)}
                    />
                    {canOrder && (
                      <button onClick={() => removeRow(i)} aria-label="刪除這一筆"
                        className="cosmic-del col-span-1">×</button>
                    )}
                  </div>
                ))}
              </div>
              {canOrder && (
                <button onClick={addRow} className="cosmic-link mt-2 text-sm min-h-11">
                  ＋ 新增一筆
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
              <span className="font-semibold text-gray-600">
                小計：<span className="cosmic-num text-xl font-bold text-white">${total}</span>
              </span>
              <button onClick={handleSave} disabled={saving || !canOrder}
                className="cosmic-btn-primary text-base">
                {saving ? '儲存中…' : '確認送出'}
              </button>
            </div>
            {message && (
              <p className="text-sm text-center cosmic-err">
                {message}
              </p>
            )}
          </div>
        </div>

        {/* 活動彙總 */}
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h2 className="text-lg font-bold text-white">活動訂單彙總（依同事）</h2>
              {peerOrders.length > 0 && <span className="cosmic-num cosmic-accent text-sm shrink-0">{peerOrders.length} 人</span>}
            </div>
            {peerOrders.length === 0 ? (
              <p className="text-gray-400 text-sm italic py-2">還沒有人訂購</p>
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
                              {canOrder && myName && p.employee_name === myName && (
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
                  <span>活動總計</span>
                  <span className="cosmic-num text-xl cosmic-accent">${grandTotal}</span>
                </div>
              </div>
            )}
          </div>

          {itemSummary.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="text-lg font-bold text-white mb-2">叫餐彙整（依品項）</h2>
              <table className="w-full text-sm cosmic-table">
                <tbody>
                  {itemSummary.map((it, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 text-white">
                        <div>{it.name}</div>
                        {it.note && <div className="text-xs cosmic-memo">備註：{it.note}</div>}
                      </td>
                      <td className="py-2 text-right font-semibold text-gray-700 w-14 cosmic-num">× {it.count}</td>
                      <td className="py-2 text-right text-white w-20 cosmic-num">${it.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {lightbox && event?.menu_image && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}>
          <img src={event.menu_image} alt="活動菜單" className="max-w-full max-h-full rounded-lg object-contain" />
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
