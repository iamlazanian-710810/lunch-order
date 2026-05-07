'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Employee } from '@/lib/supabase'

type OrderRow = { item_name: string; price: string; note: string }
type PeerOrder = { employee_name: string; items: { name: string; price: number; note: string }[]; total: number }

const today = new Date().toISOString().slice(0, 10)

export default function HomePage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [menuImage, setMenuImage] = useState<string | null>(null)
  const [rows, setRows] = useState<OrderRow[]>([{ item_name: '', price: '', note: '' }])
  const [peerOrders, setPeerOrders] = useState<PeerOrder[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [scheduleId, setScheduleId] = useState<string | null>(null)

  const loadBase = useCallback(async () => {
    const [{ data: emps }, { data: sched }] = await Promise.all([
      supabase.from('employees').select('*').order('name'),
      supabase.from('daily_schedule').select('id, menu_image').eq('date', today).maybeSingle(),
    ])
    setEmployees(emps ?? [])
    setMenuImage((sched as any)?.menu_image ?? null)
    setScheduleId((sched as any)?.id ?? null)
  }, [])

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('item_name, subtotal, note, employees(name)')
      .eq('date', today)
    if (!data) return

    const map: Record<string, PeerOrder> = {}
    for (const o of data as any[]) {
      const empName = o.employees?.name ?? '未知'
      if (!map[empName]) map[empName] = { employee_name: empName, items: [], total: 0 }
      map[empName].items.push({ name: o.item_name ?? '', price: o.subtotal, note: o.note ?? '' })
      map[empName].total += o.subtotal
    }
    setPeerOrders(Object.values(map).sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'zh-TW')))
  }, [])

  const loadMyOrders = useCallback(async (empId: string) => {
    const { data } = await supabase
      .from('orders')
      .select('item_name, subtotal, note')
      .eq('date', today)
      .eq('employee_id', empId)
    if (data && data.length > 0) {
      setRows(data.map((o: any) => ({ item_name: o.item_name ?? '', price: String(o.subtotal), note: o.note ?? '' })))
    } else {
      setRows([{ item_name: '', price: '', note: '' }])
    }
  }, [])

  useEffect(() => { loadBase() }, [loadBase])
  useEffect(() => { loadOrders() }, [loadOrders])

  const handleEmployeeChange = (id: string) => {
    setSelectedEmployee(id)
    setMessage('')
    if (id) loadMyOrders(id)
    else setRows([{ item_name: '', price: '', note: '' }])
  }

  const updateRow = (i: number, field: keyof OrderRow, val: string) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  const addRow = () => setRows(prev => [...prev, { item_name: '', price: '', note: '' }])
  const removeRow = (i: number) => setRows(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i))

  const total = rows.reduce((s, r) => s + (parseInt(r.price) || 0), 0)

  const handleSave = async () => {
    if (!selectedEmployee) return setMessage('請先選擇姓名')
    const valid = rows.filter(r => r.item_name.trim() && parseInt(r.price) > 0)
    if (valid.length === 0) return setMessage('請至少填一筆餐點名稱與價格')
    setSaving(true)
    setMessage('')
    await supabase.from('orders').delete().eq('date', today).eq('employee_id', selectedEmployee)
    const insertRows = valid.map(r => ({
      date: today,
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
    setMessage('已送出！')
    loadOrders()
  }

  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('zh-TW', {
    month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-5 border flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">今日點餐</h1>
        <span className="text-gray-500 text-sm">{dateLabel}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* 菜單圖片 */}
          {menuImage ? (
            <div className="bg-white rounded-xl shadow-sm border p-3">
              <p className="text-sm font-medium text-gray-600 mb-2">今日菜單</p>
              <img src={menuImage} alt="今日菜單" className="w-full rounded-lg object-contain max-h-80" />
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border p-5 text-center text-gray-400 italic text-sm">
              管理員尚未上傳今日菜單
            </div>
          )}

          {/* 點餐表單 */}
          <div className="bg-white rounded-xl shadow-sm p-5 border space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">我是</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={selectedEmployee}
                onChange={e => handleEmployeeChange(e.target.value)}
              >
                <option value="">-- 請選擇姓名 --</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">點餐內容</p>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-1 text-xs text-gray-400 px-1">
                  <span className="col-span-5">餐點名稱</span>
                  <span className="col-span-3">價格</span>
                  <span className="col-span-3">備註</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 items-center">
                    <input
                      className="col-span-5 border rounded-lg px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="例：排骨飯"
                      value={row.item_name}
                      onChange={e => updateRow(i, 'item_name', e.target.value)}
                    />
                    <input
                      className="col-span-3 border rounded-lg px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="120"
                      type="number"
                      value={row.price}
                      onChange={e => updateRow(i, 'price', e.target.value)}
                    />
                    <input
                      className="col-span-3 border rounded-lg px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="不辣"
                      value={row.note}
                      onChange={e => updateRow(i, 'note', e.target.value)}
                    />
                    <button onClick={() => removeRow(i)}
                      className="col-span-1 text-red-300 hover:text-red-500 text-lg leading-none text-center">×</button>
                  </div>
                ))}
              </div>
              <button onClick={addRow}
                className="mt-2 text-sm text-orange-500 hover:text-orange-700 font-medium">
                ＋ 新增一筆
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="font-semibold text-gray-700">
                小計：<span className="text-orange-500">${total}</span>
              </span>
              <button onClick={handleSave} disabled={saving}
                className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50">
                {saving ? '儲存中…' : '確認送出'}
              </button>
            </div>
            {message && (
              <p className={`text-sm text-center ${message.startsWith('儲存失敗') ? 'text-red-500' : 'text-green-600'}`}>
                {message}
              </p>
            )}
          </div>
        </div>

        {/* 今日訂單統計 */}
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <h2 className="font-semibold text-gray-700 mb-3">今日訂單統計</h2>
          {peerOrders.length === 0 ? (
            <p className="text-gray-400 text-sm italic">還沒有人點餐</p>
          ) : (
            <div className="space-y-3">
              {peerOrders.map(p => (
                <div key={p.employee_name} className="border-b pb-2 last:border-0">
                  <div className="flex justify-between text-sm font-medium text-gray-800 mb-0.5">
                    <span>{p.employee_name}</span>
                    <span className="text-orange-500">${p.total}</span>
                  </div>
                  {p.items.map((item, idx) => (
                    <div key={idx} className="ml-2 mt-1">
                      <div className="text-xs text-gray-600 flex justify-between">
                        <span>{item.name}</span>
                        <span className="text-orange-400">${item.price}</span>
                      </div>
                      {item.note && (
                        <div className="text-xs text-blue-500 mt-0.5">備註：{item.note}</div>
                      )}
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
    </div>
  )
}
