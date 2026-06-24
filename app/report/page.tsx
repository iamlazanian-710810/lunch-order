'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Employee, type Category, CATEGORIES, categoryLabel } from '@/lib/supabase'
import { StarRate } from '../components/Stars'

type OrderRec = {
  id: string; date: string; category: Category; employee_id: string
  item_name: string | null; note: string | null; qty: number; subtotal: number; rating: number | null
  employees: { name: string } | null
}

export default function ReportPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [orders, setOrders] = useState<OrderRec[]>([])
  const [storeMap, setStoreMap] = useState<Record<string, string>>({})
  const [employees, setEmployees] = useState<Employee[]>([])
  const [me, setMe] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

    const [{ data: ord }, { data: sched }, { data: emps }] = await Promise.all([
      supabase.from('orders')
        .select('id, date, category, employee_id, item_name, note, qty, subtotal, rating, employees(name)')
        .gte('date', from).lt('date', to).order('date'),
      supabase.from('daily_schedule').select('date, category, restaurant_name').gte('date', from).lt('date', to),
      supabase.from('employees').select('*').order('name'),
    ])
    const sm: Record<string, string> = {}
    for (const s of (sched ?? []) as any[]) {
      if (s.restaurant_name) sm[`${s.date}__${s.category}`] = s.restaurant_name
    }
    setStoreMap(sm)
    setOrders((ord ?? []) as any[])
    setEmployees(emps ?? [])
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const rate = async (orderId: string, n: number) => {
    const cur = orders.find(o => o.id === orderId)?.rating
    const newVal = cur === n ? null : n // 再點同一顆星 = 取消評分
    await supabase.from('orders').update({ rating: newVal }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, rating: newVal } : o))
  }

  const storeOf = (date: string, cat: Category) => storeMap[`${date}__${cat}`] ?? ''

  // 費用總表（每位員工 × 三分類）
  const empNames = Array.from(new Set(orders.map(o => o.employees?.name ?? '未知')))
    .sort((a, b) => a.localeCompare(b, 'zh-TW'))
  const empTotal = (name: string, cat?: Category) =>
    orders.filter(o => (o.employees?.name ?? '未知') === name && (!cat || o.category === cat))
      .reduce((s, o) => s + o.subtotal, 0)
  const grandTotal = orders.reduce((s, o) => s + o.subtotal, 0)

  // Excel 匯出（總表 + 三分類各一分頁）
  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // 總表
    const summary: any[][] = [['員工', '午餐', '飲料點心', '慶祝活動', '合計']]
    for (const name of empNames) {
      summary.push([name, empTotal(name, 'lunch'), empTotal(name, 'drinks'), empTotal(name, 'celebration'), empTotal(name)])
    }
    summary.push(['合計',
      orders.filter(o => o.category === 'lunch').reduce((s, o) => s + o.subtotal, 0),
      orders.filter(o => o.category === 'drinks').reduce((s, o) => s + o.subtotal, 0),
      orders.filter(o => o.category === 'celebration').reduce((s, o) => s + o.subtotal, 0),
      grandTotal])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), '費用總表')

    // 各分類明細
    for (const { key, short } of CATEGORIES) {
      const rows: any[][] = [['日期', '店家', '員工', '餐點', '備註', '金額', '評分(星)']]
      for (const o of orders.filter(o => o.category === key)) {
        rows.push([o.date, storeOf(o.date, key), o.employees?.name ?? '未知',
          o.item_name ?? '', o.note ?? '', o.subtotal, o.rating ?? ''])
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), short)
    }

    XLSX.writeFile(wb, `公司點餐報表_${year}${String(month).padStart(2, '0')}.xlsx`)
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const years = [now.getFullYear() - 1, now.getFullYear()]
  const meName = employees.find(e => e.id === me)?.name

  // 把某分類的訂單依日期分組
  const groupByDate = (cat: Category) => {
    const byDate: Record<string, OrderRec[]> = {}
    for (const o of orders.filter(o => o.category === cat)) {
      if (!byDate[o.date]) byDate[o.date] = []
      byDate[o.date].push(o)
    }
    return Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map(date => ({ date, items: byDate[date] }))
  }

  const accentText: Record<Category, string> = { lunch: 'text-orange-500', drinks: 'text-sky-500', celebration: 'text-rose-500' }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">月結報表</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            {years.map(y => <option key={y} value={y}>{y} 年</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            {months.map(m => <option key={m} value={m}>{m} 月</option>)}
          </select>
          {orders.length > 0 && (
            <button onClick={exportExcel}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium">
              匯出 Excel
            </button>
          )}
        </div>
      </div>

      {/* 我是（評分用） */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-amber-700 font-medium">幫餐點評分：我是</span>
        <select value={me} onChange={e => setMe(e.target.value)}
          className="border border-amber-300 rounded-lg px-3 py-1.5 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
          <option value="">-- 請選擇你的姓名 --</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span className="text-xs text-amber-600">
          {me ? '在下方找到自己點的餐，點星星即可評分（1～5 星，再點同一顆可取消）' : '選擇姓名後，就能幫自己點過的餐點打星星'}
        </span>
      </div>

      {loading && <p className="text-gray-400 text-center py-8">載入中…</p>}

      {!loading && orders.length === 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-400 italic">
          {year} 年 {month} 月沒有訂餐記錄
        </div>
      )}

      {!loading && orders.length > 0 && (
        <>
          {/* 費用總表 */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">{year} 年 {month} 月 — 費用總表</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left py-1.5">員工</th>
                    <th className="text-right py-1.5">午餐</th>
                    <th className="text-right py-1.5">飲料點心</th>
                    <th className="text-right py-1.5">慶祝活動</th>
                    <th className="text-right py-1.5">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {empNames.map(name => (
                    <tr key={name} className="border-b last:border-0">
                      <td className="py-2 text-gray-800">{name}</td>
                      <td className="py-2 text-right text-gray-600">${empTotal(name, 'lunch')}</td>
                      <td className="py-2 text-right text-gray-600">${empTotal(name, 'drinks')}</td>
                      <td className="py-2 text-right text-gray-600">${empTotal(name, 'celebration')}</td>
                      <td className="py-2 text-right font-semibold text-orange-500">${empTotal(name)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold text-gray-800">
                    <td className="pt-3">合計</td>
                    <td className="pt-3 text-right">${orders.filter(o => o.category === 'lunch').reduce((s, o) => s + o.subtotal, 0)}</td>
                    <td className="pt-3 text-right">${orders.filter(o => o.category === 'drinks').reduce((s, o) => s + o.subtotal, 0)}</td>
                    <td className="pt-3 text-right">${orders.filter(o => o.category === 'celebration').reduce((s, o) => s + o.subtotal, 0)}</td>
                    <td className="pt-3 text-right text-orange-600">${grandTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 三分類明細 */}
          {CATEGORIES.map(({ key, label }) => {
            const groups = groupByDate(key)
            const catTotal = orders.filter(o => o.category === key).reduce((s, o) => s + o.subtotal, 0)
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className={`font-semibold ${accentText[key]}`}>{label} 明細</h2>
                  <span className="text-sm text-gray-500">小計 ${catTotal}</span>
                </div>
                {groups.length === 0 ? (
                  <div className="bg-white rounded-xl border shadow-sm p-5 text-center text-gray-400 italic text-sm">本月無紀錄</div>
                ) : groups.map(({ date, items }) => {
                  const store = storeOf(date, key)
                  const dayTotal = items.reduce((s, o) => s + o.subtotal, 0)
                  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })
                  return (
                    <div key={date} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-700">{dateLabel}</span>
                          {store && <span className="text-xs bg-white border rounded-full px-2 py-0.5 text-gray-500">店家：{store}</span>}
                        </div>
                        <span className="text-orange-500 font-semibold">${dayTotal}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[520px]">
                          <thead>
                            <tr className="text-gray-400 border-b">
                              <th className="text-left px-5 py-2">員工</th>
                              <th className="text-left px-2 py-2">餐點</th>
                              <th className="text-left px-2 py-2">備註</th>
                              <th className="text-right px-2 py-2">金額</th>
                              <th className="text-center px-3 py-2">評分</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(o => {
                              const mine = !!me && o.employee_id === me
                              return (
                                <tr key={o.id} className="border-b last:border-0">
                                  <td className="px-5 py-2 text-gray-700 whitespace-nowrap">{o.employees?.name}</td>
                                  <td className="px-2 py-2 text-gray-700">{o.item_name}</td>
                                  <td className="px-2 py-2 text-blue-500 text-xs">{o.note ?? ''}</td>
                                  <td className="px-2 py-2 text-right text-orange-500">${o.subtotal}</td>
                                  <td className="px-3 py-2 text-center">
                                    {mine ? (
                                      <StarRate value={o.rating} onRate={n => rate(o.id, n)} />
                                    ) : o.rating ? (
                                      <StarRate value={o.rating} disabled />
                                    ) : (
                                      <span className="text-gray-300 text-xs">—</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
