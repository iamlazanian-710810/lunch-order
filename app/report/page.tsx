'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type EmployeeSummary = {
  name: string
  total: number
  days: { date: string; items: string; subtotal: number }[]
}

export default function ReportPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [summaries, setSummaries] = useState<EmployeeSummary[]>([])
  const [grandTotal, setGrandTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

    const { data } = await supabase
      .from('orders')
      .select('date, qty, subtotal, item_name, note, employees(name)')
      .gte('date', from)
      .lt('date', to)
      .order('date')

    setLoading(false)
    if (!data) return

    const empMap: Record<string, EmployeeSummary> = {}
    for (const o of data as any[]) {
      const name = o.employees?.name ?? '未知'
      if (!empMap[name]) empMap[name] = { name, total: 0, days: [] }
      // find or create day entry
      let day = empMap[name].days.find(d => d.date === o.date)
      if (!day) {
        day = { date: o.date, items: '', subtotal: 0 }
        empMap[name].days.push(day)
      }
      const label = o.item_name ?? o.menu_items?.name ?? '未知'
      day.items += (day.items ? '、' : '') + `${label}${o.note ? `（${o.note}）` : ''}×${o.qty}`
      day.subtotal += o.subtotal
      empMap[name].total += o.subtotal
    }

    const result = Object.values(empMap).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
    setSummaries(result)
    setGrandTotal(result.reduce((s, e) => s + e.total, 0))
  }, [year, month])

  useEffect(() => { load() }, [load])

  const exportCSV = () => {
    const rows = [['員工', '日期', '品項', '金額']]
    for (const emp of summaries) {
      for (const d of emp.days) {
        rows.push([emp.name, d.date, d.items, String(d.subtotal)])
      }
      rows.push([emp.name, '月合計', '', String(emp.total)])
      rows.push([])
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `午餐費用_${year}${String(month).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const years = [now.getFullYear() - 1, now.getFullYear()]

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
          {summaries.length > 0 && (
            <button onClick={exportCSV}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium">
              匯出 CSV
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-gray-400 text-center py-8">載入中…</p>}

      {!loading && summaries.length === 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-400 italic">
          {year} 年 {month} 月沒有訂餐記錄
        </div>
      )}

      {!loading && summaries.length > 0 && (
        <>
          {/* 月結總表 */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">{year} 年 {month} 月 — 費用總表</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left py-1.5">員工</th>
                  <th className="text-right py-1.5">訂餐天數</th>
                  <th className="text-right py-1.5">應付金額</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(emp => (
                  <tr key={emp.name} className="border-b last:border-0">
                    <td className="py-2 text-gray-800">{emp.name}</td>
                    <td className="py-2 text-right text-gray-600">{emp.days.length} 天</td>
                    <td className="py-2 text-right font-semibold text-orange-500">${emp.total}</td>
                  </tr>
                ))}
                <tr className="font-bold text-gray-800">
                  <td className="pt-3">合計</td>
                  <td></td>
                  <td className="pt-3 text-right text-orange-600">${grandTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 個人明細（可展開） */}
          <div className="space-y-2">
            <h2 className="font-semibold text-gray-700">個人消費明細</h2>
            {summaries.map(emp => (
              <div key={emp.name} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(expanded === emp.name ? null : emp.name)}
                >
                  <span className="font-medium text-gray-800">{emp.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-orange-500 font-semibold">${emp.total}</span>
                    <span className="text-gray-400 text-sm">{expanded === emp.name ? '▲' : '▼'}</span>
                  </div>
                </button>
                {expanded === emp.name && (
                  <div className="border-t px-5 pb-3">
                    <table className="w-full text-sm mt-2">
                      <thead>
                        <tr className="text-gray-400">
                          <th className="text-left py-1">日期</th>
                          <th className="text-left py-1">品項</th>
                          <th className="text-right py-1">金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emp.days.map(d => (
                          <tr key={d.date} className="border-b last:border-0">
                            <td className="py-1.5 text-gray-600 whitespace-nowrap">{d.date}</td>
                            <td className="py-1.5 text-gray-700">{d.items}</td>
                            <td className="py-1.5 text-right text-gray-700">${d.subtotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
