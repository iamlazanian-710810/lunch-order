'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, type Employee, type Category, CATEGORIES, categoryLabel } from '@/lib/supabase'
import { StarDisplay } from '../components/Stars'

const today = new Date().toISOString().slice(0, 10)
const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || '1234'

type DayInfo = { storeInput: string; menuImage: string | null; uploading: boolean }
const emptyDay = (): DayInfo => ({ storeInput: '', menuImage: null, uploading: false })

export default function AdminPage() {
  const [verified, setVerified] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [todayOrders, setTodayOrders] = useState<any[]>([])
  const [tab, setTab] = useState<'today' | 'ratings' | 'employees'>('today')
  const [msg, setMsg] = useState('')

  // 三分類的今日店家／菜單
  const [days, setDays] = useState<Record<Category, DayInfo>>({
    lunch: emptyDay(), drinks: emptyDay(), celebration: emptyDay(),
  })
  const fileRefs = {
    lunch: useRef<HTMLInputElement>(null),
    drinks: useRef<HTMLInputElement>(null),
    celebration: useRef<HTMLInputElement>(null),
  }

  const [orderCat, setOrderCat] = useState<Category>('lunch')
  const [orderView, setOrderView] = useState<'person' | 'item'>('person')

  // 評價統計用
  const now = new Date()
  const [rYear, setRYear] = useState(now.getFullYear())
  const [rMonth, setRMonth] = useState(now.getMonth() + 1)
  const [ratedOrders, setRatedOrders] = useState<any[]>([])
  const [storeMap, setStoreMap] = useState<Record<string, string>>({})

  const [newEmpName, setNewEmpName] = useState('')

  useEffect(() => {
    if (sessionStorage.getItem('admin_verified') === 'true') setVerified(true)
  }, [])

  const submitPin = () => {
    if (pinInput === ADMIN_PIN) {
      sessionStorage.setItem('admin_verified', 'true')
      setVerified(true)
    } else {
      setPinError(true); setPinInput('')
      setTimeout(() => setPinError(false), 1500)
    }
  }

  const load = useCallback(async () => {
    const [{ data: emps }, { data: sched }, { data: orders }] = await Promise.all([
      supabase.from('employees').select('*').order('name'),
      supabase.from('daily_schedule').select('category, menu_image, restaurant_name').eq('date', today),
      supabase.from('orders').select('id, category, item_name, qty, subtotal, note, rating, employees(name)').eq('date', today),
    ])
    setEmployees(emps ?? [])
    setTodayOrders(orders ?? [])
    const next: Record<Category, DayInfo> = { lunch: emptyDay(), drinks: emptyDay(), celebration: emptyDay() }
    for (const s of (sched ?? []) as any[]) {
      const cat = (s.category ?? 'lunch') as Category
      if (next[cat]) next[cat] = { storeInput: s.restaurant_name ?? '', menuImage: s.menu_image ?? null, uploading: false }
    }
    setDays(next)
  }, [])

  const loadRatings = useCallback(async () => {
    const from = `${rYear}-${String(rMonth).padStart(2, '0')}-01`
    const nextMonth = rMonth === 12 ? 1 : rMonth + 1
    const nextYear = rMonth === 12 ? rYear + 1 : rYear
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
    const [{ data: rated }, { data: sched }] = await Promise.all([
      supabase.from('orders').select('date, category, item_name, rating').gte('date', from).lt('date', to).not('rating', 'is', null),
      supabase.from('daily_schedule').select('date, category, restaurant_name').gte('date', from).lt('date', to),
    ])
    const sm: Record<string, string> = {}
    for (const s of (sched ?? []) as any[]) {
      if (s.restaurant_name) sm[`${s.date}__${s.category}`] = s.restaurant_name
    }
    setStoreMap(sm)
    setRatedOrders(rated ?? [])
  }, [rYear, rMonth])

  useEffect(() => { if (verified) load() }, [load, verified])
  useEffect(() => { if (tab === 'ratings' && verified) loadRatings() }, [tab, loadRatings, verified])

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

  const setDay = (cat: Category, patch: Partial<DayInfo>) =>
    setDays(prev => ({ ...prev, [cat]: { ...prev[cat], ...patch } }))

  const saveStoreName = async (cat: Category) => {
    const name = days[cat].storeInput.trim()
    await supabase.from('daily_schedule').upsert(
      { date: today, category: cat, restaurant_name: name || null },
      { onConflict: 'date,category' },
    )
    flash(`已儲存${categoryLabel(cat)}店家名稱`)
  }

  const handleMenuUpload = async (cat: Category, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDay(cat, { uploading: true })
    const dataUrl = await compressImage(file)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    await Promise.all([
      supabase.from('daily_schedule').upsert({ date: today, category: cat, menu_image: dataUrl }, { onConflict: 'date,category' }),
      supabase.from('daily_schedule').update({ menu_image: null }).lt('date', cutoffStr).not('menu_image', 'is', null),
    ])
    setDay(cat, { menuImage: dataUrl, uploading: false })
    flash(`${categoryLabel(cat)}菜單圖片已上傳`)
  }

  const removeMenuImage = async (cat: Category) => {
    await supabase.from('daily_schedule').upsert({ date: today, category: cat, menu_image: null }, { onConflict: 'date,category' })
    setDay(cat, { menuImage: null })
    if (fileRefs[cat].current) fileRefs[cat].current!.value = ''
    flash('已移除菜單圖片')
  }

  const deleteOrder = async (id: string) => {
    await supabase.from('orders').delete().eq('id', id)
    load(); flash('已刪除')
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

  const catOrders = (todayOrders as any[]).filter(o => (o.category ?? 'lunch') === orderCat)

  const copyOrderList = () => {
    const lines = [`【今日${categoryLabel(orderCat)}訂單】${today}`]
    if (days[orderCat].storeInput.trim()) lines.push(`店家：${days[orderCat].storeInput.trim()}`)
    lines.push('')
    const itemMap: Record<string, number> = {}
    for (const o of catOrders) {
      const key = `${o.item_name ?? ''}${o.note ? `（${o.note}）` : ''}`
      itemMap[key] = (itemMap[key] ?? 0) + (o.qty ?? 1)
    }
    Object.entries(itemMap).forEach(([name, qty]) => lines.push(`${name} × ${qty}`))
    lines.push('')
    lines.push(`合計：$${catOrders.reduce((s, o) => s + o.subtotal, 0)}`)
    navigator.clipboard.writeText(lines.join('\n'))
    flash('已複製到剪貼簿！')
  }

  const tabClass = (t: string) =>
    `px-4 py-2 rounded-lg font-medium text-sm transition-colors ${tab === t ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
  const catBtnClass = (cat: Category) =>
    `px-3 py-1.5 text-sm rounded-lg font-medium ${orderCat === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`

  // PIN 驗證畫面
  if (!verified) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border p-8 w-full max-w-xs space-y-4">
          <h2 className="text-lg font-bold text-gray-800 text-center">管理員驗證</h2>
          <p className="text-sm text-gray-500 text-center">請輸入管理員 PIN 碼</p>
          <input
            type="password" inputMode="numeric" placeholder="PIN 碼"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitPin()}
            className={`w-full border rounded-lg px-4 py-3 text-center text-xl tracking-widest focus:outline-none focus:ring-2 ${pinError ? 'border-red-400 ring-red-300' : 'focus:ring-orange-400'}`}
            autoFocus
          />
          {pinError && <p className="text-red-500 text-sm text-center">PIN 碼錯誤，請重試</p>}
          <button onClick={submitPin}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg font-medium">確認進入</button>
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
        <button className={tabClass('ratings')} onClick={() => setTab('ratings')}>評價統計</button>
        <button className={tabClass('employees')} onClick={() => setTab('employees')}>員工管理</button>
      </div>

      {/* ===== 今日設定 ===== */}
      {tab === 'today' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">📋 設定今日店家與菜單（三類分開設定）</h2>
            <div className="space-y-5">
              {CATEGORIES.map(({ key, label }) => {
                const d = days[key]
                return (
                  <div key={key} className="border rounded-lg p-4">
                    <p className="font-medium text-gray-700 mb-2">{label}</p>
                    <div className="flex gap-2 mb-3">
                      <input
                        placeholder="本日店家名稱（例：阿明便當）"
                        value={d.storeInput}
                        onChange={e => setDay(key, { storeInput: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && saveStoreName(key)}
                        className="flex-1 border rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                      <button onClick={() => saveStoreName(key)}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">儲存店家</button>
                    </div>
                    <input ref={fileRefs[key]} type="file" accept="image/*" capture="environment"
                      onChange={e => handleMenuUpload(key, e)}
                      className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-600 file:text-white file:font-medium hover:file:bg-gray-700 cursor-pointer" />
                    {d.uploading && <p className="text-sm text-gray-400 mt-2">上傳中…</p>}
                    {d.menuImage && !d.uploading && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm text-green-600 font-medium">✓ 已上傳菜單圖片</p>
                          <button onClick={() => removeMenuImage(key)} className="text-xs text-red-400 hover:text-red-600">移除</button>
                        </div>
                        <img src={d.menuImage} alt="菜單" className="max-h-48 rounded-lg border object-contain" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 今日訂單 */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold text-gray-700">今日訂單</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {CATEGORIES.map(({ key, label }) => (
                  <button key={key} className={catBtnClass(key)} onClick={() => setOrderCat(key)}>{label}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <span className="text-sm text-gray-500">
                {categoryLabel(orderCat)}：{catOrders.length > 0 ? `${catOrders.length} 筆` : '尚無訂單'}
              </span>
              {catOrders.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg overflow-hidden border text-sm">
                    <button onClick={() => setOrderView('person')}
                      className={`px-3 py-1.5 ${orderView === 'person' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>依員工</button>
                    <button onClick={() => setOrderView('item')}
                      className={`px-3 py-1.5 ${orderView === 'item' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>依品項</button>
                  </div>
                  <button onClick={copyOrderList} className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium">複製叫餐清單</button>
                </div>
              )}
            </div>

            {catOrders.length === 0 ? (
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
                  {catOrders.map((o, i) => (
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
                    <td className="pt-2 text-right text-orange-600">${catOrders.reduce((s, o) => s + o.subtotal, 0)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            ) : (() => {
              const itemMap: Record<string, { itemName: string; count: number; total: number; persons: string[]; note: string }> = {}
              for (const o of catOrders) {
                const key = `${o.item_name ?? ''}__${o.note ?? ''}`
                if (!itemMap[key]) itemMap[key] = { itemName: o.item_name ?? '', count: 0, total: 0, persons: [], note: o.note ?? '' }
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
                    {items.map(([key, info]) => (
                      <tr key={key} className="border-b last:border-0">
                        <td className="py-1.5 text-gray-700">
                          <div>{info.itemName}</div>
                          {info.note && <div className="text-xs text-blue-500">備註：{info.note}</div>}
                        </td>
                        <td className="py-1.5 text-gray-500 text-xs">{info.persons.join('、')}</td>
                        <td className="py-1.5 text-right font-semibold text-gray-700">× {info.count}</td>
                        <td className="py-1.5 text-right text-orange-500">${info.total}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td colSpan={2} className="pt-2 text-gray-700">合計</td>
                      <td className="pt-2 text-right text-gray-700">× {catOrders.reduce((s, o) => s + (o.qty ?? 1), 0)}</td>
                      <td className="pt-2 text-right text-orange-600">${catOrders.reduce((s, o) => s + o.subtotal, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              )
            })()}
          </div>
        </div>
      )}

      {/* ===== 評價統計 ===== */}
      {tab === 'ratings' && (() => {
        // 依「店家＋分類」與「餐點＋分類」聚合
        type Agg = { name: string; cat: string; sum: number; count: number }
        const storeAgg: Record<string, Agg> = {}
        const dishAgg: Record<string, Agg> = {}
        for (const o of ratedOrders as any[]) {
          const cat = o.category ?? 'lunch'
          const store = storeMap[`${o.date}__${cat}`] ?? '（未填店家）'
          const sKey = `${store}__${cat}`
          if (!storeAgg[sKey]) storeAgg[sKey] = { name: store, cat, sum: 0, count: 0 }
          storeAgg[sKey].sum += o.rating; storeAgg[sKey].count += 1
          const dish = o.item_name ?? '（未填餐點）'
          const dKey = `${dish}__${cat}`
          if (!dishAgg[dKey]) dishAgg[dKey] = { name: dish, cat, sum: 0, count: 0 }
          dishAgg[dKey].sum += o.rating; dishAgg[dKey].count += 1
        }
        const sortByAvg = (a: Agg, b: Agg) => (b.sum / b.count) - (a.sum / a.count) || b.count - a.count
        const stores = Object.values(storeAgg).sort(sortByAvg)
        const dishes = Object.values(dishAgg).sort(sortByAvg)
        const months = Array.from({ length: 12 }, (_, i) => i + 1)
        const years = [now.getFullYear() - 1, now.getFullYear()]

        const RankTable = ({ rows, head }: { rows: Agg[]; head: string }) => (
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">{head}</h2>
            {rows.length === 0 ? (
              <p className="text-gray-400 text-sm italic">本月尚無評分資料</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left py-1.5 w-10">排名</th>
                    <th className="text-left py-1.5">名稱</th>
                    <th className="text-left py-1.5">分類</th>
                    <th className="text-left py-1.5">平均</th>
                    <th className="text-right py-1.5">評分數</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const avg = r.sum / r.count
                    const tag = i === 0 ? '🥇最受歡迎' : i === rows.length - 1 && rows.length > 1 ? '⚠最不受歡迎' : ''
                    return (
                      <tr key={r.name + r.cat} className="border-b last:border-0">
                        <td className="py-2 text-gray-400">{i + 1}</td>
                        <td className="py-2 text-gray-800">
                          {r.name}
                          {tag && <span className="ml-2 text-xs text-gray-500">{tag}</span>}
                        </td>
                        <td className="py-2 text-gray-500 text-xs">{categoryLabel(r.cat)}</td>
                        <td className="py-2"><span className="inline-flex items-center gap-1"><StarDisplay value={avg} /> <span className="text-gray-600 text-xs">{avg.toFixed(1)}</span></span></td>
                        <td className="py-2 text-right text-gray-600">{r.count}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )

        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <select value={rYear} onChange={e => setRYear(Number(e.target.value))}
                className="border rounded-lg px-3 py-1.5 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                {years.map(y => <option key={y} value={y}>{y} 年</option>)}
              </select>
              <select value={rMonth} onChange={e => setRMonth(Number(e.target.value))}
                className="border rounded-lg px-3 py-1.5 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                {months.map(m => <option key={m} value={m}>{m} 月</option>)}
              </select>
              <span className="text-sm text-gray-400">共 {ratedOrders.length} 筆評分</span>
            </div>
            <RankTable rows={stores} head="🏪 店家排行（依平均星數）" />
            <RankTable rows={dishes} head="🍱 餐點排行（依平均星數）" />
            <p className="text-xs text-gray-400">＊評分由同事在「月結報表」針對自己點的餐點給 1～5 星，本表自動彙整。</p>
          </div>
        )
      })()}

      {/* ===== 員工管理 ===== */}
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
