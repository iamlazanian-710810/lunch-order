'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  supabase, DAILY_CATEGORIES, type Employee, type Category, type CelebrationEvent,
} from '@/lib/supabase'
import { dateLabel } from '@/lib/date'
import { StarRate } from '../components/Stars'
import Planet from '../components/Planet'

type OrderRec = {
  id: string; date: string; category: Category; employee_id: string
  item_name: string | null; note: string | null; qty: number; subtotal: number
  rating: number | null; event_id: string | null
  employees: { name: string } | null
}

export default function ReportPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [orders, setOrders] = useState<OrderRec[]>([])
  const [storeMap, setStoreMap] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<CelebrationEvent[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [me, setMe] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

    const [{ data: ord }, { data: sched }, { data: emps }, { data: evs }] = await Promise.all([
      supabase.from('orders')
        .select('id, date, category, employee_id, item_name, note, qty, subtotal, rating, event_id, employees(name)')
        .gte('date', from).lt('date', to).order('date'),
      supabase.from('daily_schedule').select('date, category, restaurant_name').gte('date', from).lt('date', to),
      supabase.from('employees').select('*').order('name'),
      supabase.from('celebration_events').select('*').order('start_date', { ascending: false }),
    ])
    const sm: Record<string, string> = {}
    for (const s of (sched ?? []) as any[]) {
      if (s.restaurant_name) sm[`${s.date}__${s.category}`] = s.restaurant_name
    }
    setStoreMap(sm)
    setOrders((ord ?? []) as any[])
    setEmployees(emps ?? [])
    setEvents((evs ?? []) as CelebrationEvent[])
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
  const eventOf = (id: string | null) => (id ? events.find(e => e.id === id) ?? null : null)
  const eventName = (id: string | null) => eventOf(id)?.name ?? '（未指定活動）'

  // 費用總表（每位員工 × 三分類）
  const empNames = Array.from(new Set(orders.map(o => o.employees?.name ?? '未知')))
    .sort((a, b) => a.localeCompare(b, 'zh-TW'))
  const empTotal = (name: string, cat?: Category) =>
    orders.filter(o => (o.employees?.name ?? '未知') === name && (!cat || o.category === cat))
      .reduce((s, o) => s + o.subtotal, 0)
  const catTotal = (cat: Category) =>
    orders.filter(o => o.category === cat).reduce((s, o) => s + o.subtotal, 0)
  const grandTotal = orders.reduce((s, o) => s + o.subtotal, 0)

  // Excel 匯出（總表 + 午餐 + 飲料點心 + 慶祝活動）
  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    const summary: any[][] = [['員工', '午餐', '飲料點心', '慶祝活動', '合計']]
    for (const name of empNames) {
      summary.push([name, empTotal(name, 'lunch'), empTotal(name, 'drinks'), empTotal(name, 'celebration'), empTotal(name)])
    }
    summary.push(['合計', catTotal('lunch'), catTotal('drinks'), catTotal('celebration'), grandTotal])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), '費用總表')

    // 午餐 / 飲料點心：依日期
    for (const { key, short } of DAILY_CATEGORIES) {
      const rows: any[][] = [['日期', '星期', '店家', '員工', '餐點', '備註', '金額', '評分(星)']]
      for (const o of orders.filter(o => o.category === key)) {
        const wd = new Date(o.date + 'T12:00:00').toLocaleDateString('zh-TW', { weekday: 'short' })
        rows.push([o.date, wd, storeOf(o.date, key), o.employees?.name ?? '未知',
          o.item_name ?? '', o.note ?? '', o.subtotal, o.rating ?? ''])
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), short)
    }

    // 慶祝活動：依活動
    const celRows: any[][] = [['活動名稱', '活動期間', '店家', '員工', '品項', '備註', '金額', '評分(星)', '送出日期']]
    for (const o of orders.filter(o => o.category === 'celebration')) {
      const ev = eventOf(o.event_id)
      celRows.push([
        ev?.name ?? '（未指定活動）',
        ev ? `${ev.start_date} ~ ${ev.end_date}` : '',
        ev?.restaurant_name ?? '',
        o.employees?.name ?? '未知',
        o.item_name ?? '', o.note ?? '', o.subtotal, o.rating ?? '', o.date,
      ])
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(celRows), '慶祝活動')

    XLSX.writeFile(wb, `公司點餐報表_${year}${String(month).padStart(2, '0')}.xlsx`)
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const years = [now.getFullYear() - 1, now.getFullYear()]

  // 午餐/飲料：依日期分組
  const groupByDate = (cat: Category) => {
    const byDate: Record<string, OrderRec[]> = {}
    for (const o of orders.filter(o => o.category === cat)) {
      if (!byDate[o.date]) byDate[o.date] = []
      byDate[o.date].push(o)
    }
    return Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map(date => ({ date, items: byDate[date] }))
  }

  // 慶祝活動：依「活動」分組（不分天，整段期間就是一張表）
  const groupByEvent = () => {
    const byEvent: Record<string, OrderRec[]> = {}
    for (const o of orders.filter(o => o.category === 'celebration')) {
      const k = o.event_id ?? '__none__'
      if (!byEvent[k]) byEvent[k] = []
      byEvent[k].push(o)
    }
    return Object.keys(byEvent)
      .map(id => ({ id, ev: id === '__none__' ? null : eventOf(id), items: byEvent[id] }))
      .sort((a, b) => (b.ev?.start_date ?? '').localeCompare(a.ev?.start_date ?? ''))
  }

  const OrderTable = ({ items }: { items: OrderRec[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[520px] cosmic-table">
        <thead>
          <tr className="border-b">
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
                <td className="px-5 py-2.5 text-white whitespace-nowrap">{o.employees?.name}</td>
                <td className="px-2 py-2.5 text-gray-700">{o.item_name}</td>
                <td className="px-2 py-2.5 cosmic-memo text-xs">{o.note ?? ''}</td>
                <td className="px-2 py-2.5 text-right text-white cosmic-num">${o.subtotal}</td>
                <td className="px-3 py-2.5 text-center">
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
  )

  const accentText: Record<Category, string> = {
    lunch: 'cat-lunch', drinks: 'cat-drinks', celebration: 'cat-celebration',
  }

  return (
    <div className="space-y-5" data-theme="admin">
      <div className="glass-card glass-card--accent p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="cosmic-eyebrow">MONTHLY LEDGER</span>
            <h1 className="cosmic-title text-2xl sm:text-3xl">月結報表</h1>
          </div>
          <Planet className="shrink-0" />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="cosmic-field cosmic-field--sm cosmic-num" style={{ width: 'auto' }}>
            {years.map(y => <option key={y} value={y}>{y} 年</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="cosmic-field cosmic-field--sm cosmic-num" style={{ width: 'auto' }}>
            {months.map(m => <option key={m} value={m}>{m} 月</option>)}
          </select>
          {orders.length > 0 && (
            <button onClick={exportExcel} className="cosmic-btn-ok text-sm">
              匯出 Excel
            </button>
          )}
        </div>
      </div>

      {/* 我是（評分用） */}
      <div className="cosmic-soft p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-white font-medium">幫餐點評分：我是</span>
        <select value={me} onChange={e => setMe(e.target.value)}
          className="cosmic-field cosmic-field--sm" style={{ width: 'auto' }}>
          <option value="">-- 請選擇你的姓名 --</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span className="text-xs text-gray-600">
          {me ? '在下方找到自己點的餐，點星星即可評分（1～5 星，再點同一顆可取消）' : '選擇姓名後，就能幫自己點過的餐點打星星'}
        </span>
      </div>

      {loading && <p className="text-gray-400 text-center py-8">載入中…</p>}

      {!loading && orders.length === 0 && (
        <div className="glass-card p-8 text-center text-gray-400 italic">
          {year} 年 {month} 月沒有訂餐記錄
        </div>
      )}

      {!loading && orders.length > 0 && (
        <>
          {/* 費用總表 */}
          <div className="glass-card p-5">
            <h2 className="text-lg font-bold text-white mb-3"><span className="cosmic-num">{year}</span> 年 <span className="cosmic-num">{month}</span> 月　費用總表</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px] cosmic-table">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5">員工</th>
                    <th className="text-right py-1.5 cat-lunch">午餐</th>
                    <th className="text-right py-1.5 cat-drinks">飲料點心</th>
                    <th className="text-right py-1.5 cat-celebration">慶祝活動</th>
                    <th className="text-right py-1.5">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {empNames.map(name => (
                    <tr key={name} className="border-b last:border-0">
                      <td className="py-2.5 text-white">{name}</td>
                      <td className="py-2.5 text-right text-gray-700 cosmic-num">${empTotal(name, 'lunch')}</td>
                      <td className="py-2.5 text-right text-gray-700 cosmic-num">${empTotal(name, 'drinks')}</td>
                      <td className="py-2.5 text-right text-gray-700 cosmic-num">${empTotal(name, 'celebration')}</td>
                      <td className="py-2.5 text-right font-semibold text-white cosmic-num">${empTotal(name)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold text-white">
                    <td className="pt-3">合計</td>
                    <td className="pt-3 text-right cosmic-num">${catTotal('lunch')}</td>
                    <td className="pt-3 text-right cosmic-num">${catTotal('drinks')}</td>
                    <td className="pt-3 text-right cosmic-num">${catTotal('celebration')}</td>
                    <td className="pt-3 text-right cosmic-num cosmic-accent text-base">${grandTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              ＊午餐與飲料點心以「實際用餐日」計算，所以昨天預訂的明日餐點，會算在它真正吃的那一天。
            </p>
          </div>

          {/* 午餐 / 飲料點心：依日期 */}
          {DAILY_CATEGORIES.map(({ key, label }) => {
            const groups = groupByDate(key)
            const total = catTotal(key)
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className={`text-lg font-bold ${accentText[key]}`}>{label} 明細</h2>
                  <span className="text-sm text-gray-600">小計 <span className="cosmic-num text-white font-semibold">${total}</span></span>
                </div>
                {groups.length === 0 ? (
                  <div className="glass-card p-5 text-center text-gray-400 italic text-sm">本月無紀錄</div>
                ) : groups.map(({ date, items }) => {
                  const store = storeOf(date, key)
                  const dayTotal = items.reduce((s, o) => s + o.subtotal, 0)
                  return (
                    <div key={date} className="glass-card overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 cosmic-table-head gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white cosmic-num">{dateLabel(date)}</span>
                          {store && <span className="cosmic-chip">店家：{store}</span>}
                        </div>
                        <span className="text-white font-semibold cosmic-num">${dayTotal}</span>
                      </div>
                      <OrderTable items={items} />
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* 慶祝活動：依活動彙整（不分天） */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold cat-celebration">慶祝活動 明細（依活動彙整）</h2>
              <span className="text-sm text-gray-600">小計 <span className="cosmic-num text-white font-semibold">${catTotal('celebration')}</span></span>
            </div>
            {groupByEvent().length === 0 ? (
              <div className="glass-card p-5 text-center text-gray-400 italic text-sm">本月無紀錄</div>
            ) : groupByEvent().map(({ id, ev, items }) => {
              const evTotal = items.reduce((s, o) => s + o.subtotal, 0)
              return (
                <div key={id} className="glass-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 cosmic-table-head gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{ev?.name ?? eventName(null)}</span>
                      {ev && (
                        <span className="cosmic-chip cosmic-num">
                          {ev.start_date} ～ {ev.end_date}
                        </span>
                      )}
                      {ev?.restaurant_name && (
                        <span className="cosmic-chip">店家：{ev.restaurant_name}</span>
                      )}
                    </div>
                    <span className="text-white font-semibold cosmic-num">${evTotal}</span>
                  </div>
                  <OrderTable items={items} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
