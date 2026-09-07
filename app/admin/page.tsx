'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import {
  supabase, DAILY_CATEGORIES, categoryLabel, eventStatus, EVENT_STATUS_LABEL,
  type Employee, type DailyCategory, type CelebrationEvent,
} from '@/lib/supabase'
import { todayStr, tomorrowStr, dateLabel, type DayKey } from '@/lib/date'
import { StarDisplay } from '../components/Stars'

const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || '1234'

type DayInfo = { storeInput: string; menuImage: string | null; uploading: boolean }
const emptyDay = (): DayInfo => ({ storeInput: '', menuImage: null, uploading: false })

// 四個獨立欄位：今日午餐、今日飲料點心、明日午餐、明日飲料點心
type SlotKey = `${DayKey}__${DailyCategory}`
const SLOTS: { key: SlotKey; day: DayKey; cat: DailyCategory; label: string }[] = [
  { key: 'today__lunch', day: 'today', cat: 'lunch', label: '今日午餐' },
  { key: 'today__drinks', day: 'today', cat: 'drinks', label: '今日飲料/下午茶' },
  { key: 'tomorrow__lunch', day: 'tomorrow', cat: 'lunch', label: '明日午餐' },
  { key: 'tomorrow__drinks', day: 'tomorrow', cat: 'drinks', label: '明日飲料/下午茶' },
]

const emptyEventForm = () => ({
  id: '', name: '', restaurant_name: '', note: '',
  start_date: todayStr(), end_date: todayStr(),
  menu_image: null as string | null,
})

export default function AdminPage() {
  const dates = useMemo(() => ({ today: todayStr(), tomorrow: tomorrowStr() }), [])
  const dateOf = (d: DayKey) => dates[d]

  const [verified, setVerified] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [dayOrders, setDayOrders] = useState<any[]>([])   // 今日 + 明日的午餐/飲料訂單
  const [tab, setTab] = useState<'daily' | 'celebration' | 'ratings' | 'employees'>('daily')
  const [msg, setMsg] = useState('')

  // 四個欄位的店家／菜單
  const [slots, setSlots] = useState<Record<SlotKey, DayInfo>>({
    today__lunch: emptyDay(), today__drinks: emptyDay(),
    tomorrow__lunch: emptyDay(), tomorrow__drinks: emptyDay(),
  })
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [settingDay, setSettingDay] = useState<DayKey>('today')
  const [orderSlot, setOrderSlot] = useState<SlotKey>('today__lunch')
  const [orderView, setOrderView] = useState<'person' | 'item'>('person')

  // 慶祝活動
  const [events, setEvents] = useState<CelebrationEvent[]>([])
  const [evForm, setEvForm] = useState(emptyEventForm())
  const [evSaving, setEvSaving] = useState(false)
  const [evSelected, setEvSelected] = useState('')
  const [evOrders, setEvOrders] = useState<any[]>([])
  const evFileRef = useRef<HTMLInputElement>(null)

  // 評價統計
  const now = new Date()
  const [rYear, setRYear] = useState(now.getFullYear())
  const [rMonth, setRMonth] = useState(now.getMonth() + 1)
  const [ratedOrders, setRatedOrders] = useState<any[]>([])
  const [storeMap, setStoreMap] = useState<Record<string, string>>({})
  const [eventNameMap, setEventNameMap] = useState<Record<string, string>>({})

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

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  // ---------- 載入 ----------
  const load = useCallback(async () => {
    const both = [dates.today, dates.tomorrow]
    const [{ data: emps }, { data: sched }, { data: orders }] = await Promise.all([
      supabase.from('employees').select('*').order('name'),
      supabase.from('daily_schedule').select('date, category, menu_image, restaurant_name').in('date', both),
      supabase.from('orders')
        .select('id, date, category, item_name, qty, subtotal, note, rating, employees(name)')
        .in('date', both).in('category', ['lunch', 'drinks']),
    ])
    setEmployees(emps ?? [])
    setDayOrders(orders ?? [])
    const next: Record<SlotKey, DayInfo> = {
      today__lunch: emptyDay(), today__drinks: emptyDay(),
      tomorrow__lunch: emptyDay(), tomorrow__drinks: emptyDay(),
    }
    for (const s of (sched ?? []) as any[]) {
      const day: DayKey | null = s.date === dates.today ? 'today' : s.date === dates.tomorrow ? 'tomorrow' : null
      const cat = (s.category ?? 'lunch') as DailyCategory
      if (!day || (cat !== 'lunch' && cat !== 'drinks')) continue
      next[`${day}__${cat}` as SlotKey] = {
        storeInput: s.restaurant_name ?? '', menuImage: s.menu_image ?? null, uploading: false,
      }
    }
    setSlots(next)
  }, [dates])

  const loadEvents = useCallback(async () => {
    const { data } = await supabase.from('celebration_events').select('*').order('start_date', { ascending: false })
    const list = (data ?? []) as CelebrationEvent[]
    setEvents(list)
    setEvSelected(prev => prev || list[0]?.id || '')
  }, [])

  const loadEventOrders = useCallback(async () => {
    if (!evSelected) return setEvOrders([])
    const { data } = await supabase.from('orders')
      .select('id, item_name, qty, subtotal, note, employees(name)')
      .eq('category', 'celebration').eq('event_id', evSelected)
    setEvOrders(data ?? [])
  }, [evSelected])

  const loadRatings = useCallback(async () => {
    const from = `${rYear}-${String(rMonth).padStart(2, '0')}-01`
    const nextMonth = rMonth === 12 ? 1 : rMonth + 1
    const nextYear = rMonth === 12 ? rYear + 1 : rYear
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
    const [{ data: rated }, { data: sched }, { data: evs }] = await Promise.all([
      supabase.from('orders').select('date, category, item_name, rating, event_id')
        .gte('date', from).lt('date', to).not('rating', 'is', null),
      supabase.from('daily_schedule').select('date, category, restaurant_name').gte('date', from).lt('date', to),
      supabase.from('celebration_events').select('id, name, restaurant_name'),
    ])
    const sm: Record<string, string> = {}
    for (const s of (sched ?? []) as any[]) {
      if (s.restaurant_name) sm[`${s.date}__${s.category}`] = s.restaurant_name
    }
    const em: Record<string, string> = {}
    for (const e of (evs ?? []) as any[]) em[e.id] = e.restaurant_name || e.name
    setStoreMap(sm); setEventNameMap(em); setRatedOrders(rated ?? [])
  }, [rYear, rMonth])

  useEffect(() => { if (verified) { load(); loadEvents() } }, [load, loadEvents, verified])
  useEffect(() => { if (verified) loadEventOrders() }, [loadEventOrders, verified])
  useEffect(() => { if (tab === 'ratings' && verified) loadRatings() }, [tab, loadRatings, verified])

  // ---------- 圖片壓縮 ----------
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

  // ---------- 每日設定 ----------
  const setSlot = (key: SlotKey, patch: Partial<DayInfo>) =>
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const saveStoreName = async (day: DayKey, cat: DailyCategory) => {
    const key = `${day}__${cat}` as SlotKey
    const name = slots[key].storeInput.trim()
    const { error } = await supabase.from('daily_schedule').upsert(
      { date: dateOf(day), category: cat, restaurant_name: name || null },
      { onConflict: 'date,category' },
    )
    if (error) return flash('儲存失敗：' + error.message)
    flash(`已儲存「${day === 'today' ? '今日' : '明日'}${categoryLabel(cat)}」店家名稱`)
  }

  const handleMenuUpload = async (day: DayKey, cat: DailyCategory, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const key = `${day}__${cat}` as SlotKey
    setSlot(key, { uploading: true })
    const dataUrl = await compressImage(file)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90)
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
    await Promise.all([
      supabase.from('daily_schedule').upsert(
        { date: dateOf(day), category: cat, menu_image: dataUrl }, { onConflict: 'date,category' }),
      // 清掉 90 天前的舊圖，避免資料庫肥大
      supabase.from('daily_schedule').update({ menu_image: null }).lt('date', cutoffStr).not('menu_image', 'is', null),
    ])
    setSlot(key, { menuImage: dataUrl, uploading: false })
    flash(`「${day === 'today' ? '今日' : '明日'}${categoryLabel(cat)}」菜單圖片已上傳`)
  }

  const removeMenuImage = async (day: DayKey, cat: DailyCategory) => {
    const key = `${day}__${cat}` as SlotKey
    await supabase.from('daily_schedule').upsert(
      { date: dateOf(day), category: cat, menu_image: null }, { onConflict: 'date,category' })
    setSlot(key, { menuImage: null })
    if (fileRefs.current[key]) fileRefs.current[key]!.value = ''
    flash('已移除菜單圖片')
  }

  const deleteOrder = async (id: string, reloadEvent = false) => {
    await supabase.from('orders').delete().eq('id', id)
    if (reloadEvent) loadEventOrders(); else load()
    flash('已刪除')
  }

  // ---------- 慶祝活動 ----------
  const editEvent = (ev: CelebrationEvent) => {
    setEvForm({
      id: ev.id, name: ev.name, restaurant_name: ev.restaurant_name ?? '', note: ev.note ?? '',
      start_date: ev.start_date, end_date: ev.end_date, menu_image: ev.menu_image,
    })
    if (evFileRef.current) evFileRef.current.value = ''
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleEventMenuUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await compressImage(file)
    setEvForm(f => ({ ...f, menu_image: dataUrl }))
  }

  const saveEvent = async () => {
    if (!evForm.name.trim()) return flash('請填寫活動名稱')
    if (evForm.end_date < evForm.start_date) return flash('截止日期不能早於開放日期')
    setEvSaving(true)
    const payload = {
      name: evForm.name.trim(),
      restaurant_name: evForm.restaurant_name.trim() || null,
      note: evForm.note.trim() || null,
      start_date: evForm.start_date,
      end_date: evForm.end_date,
      menu_image: evForm.menu_image,
    }
    const { data, error } = evForm.id
      ? await supabase.from('celebration_events').update(payload).eq('id', evForm.id).select().maybeSingle()
      : await supabase.from('celebration_events').insert(payload).select().maybeSingle()
    setEvSaving(false)
    if (error) return flash('儲存失敗：' + error.message + '（若提示欄位不存在，請先到 Supabase 執行升級 SQL）')
    flash(evForm.id ? '活動已更新' : '活動已建立')
    setEvForm(emptyEventForm())
    if (evFileRef.current) evFileRef.current.value = ''
    await loadEvents()
    if (!evForm.id && (data as any)?.id) setEvSelected((data as any).id)
  }

  const deleteEvent = async (ev: CelebrationEvent) => {
    const { count } = await supabase.from('orders')
      .select('id', { count: 'exact', head: true }).eq('event_id', ev.id)
    const n = count ?? 0
    const warn = n > 0
      ? `確定刪除活動「${ev.name}」？\n\n這個活動底下有 ${n} 筆訂單，會一起永久刪除，月結報表的金額也會跟著變少。此動作無法復原。`
      : `確定刪除活動「${ev.name}」？`
    if (!confirm(warn)) return
    const { error } = await supabase.from('celebration_events').delete().eq('id', ev.id)
    if (error) return flash('刪除失敗：' + error.message)
    if (evForm.id === ev.id) setEvForm(emptyEventForm())
    if (evSelected === ev.id) setEvSelected('')
    flash('活動已刪除')
    loadEvents()
  }

  const copyEventList = () => {
    const ev = events.find(e => e.id === evSelected)
    if (!ev) return
    const lines = [`【${ev.name}】訂購彙總`, `期間：${ev.start_date} ～ ${ev.end_date}`]
    if (ev.restaurant_name) lines.push(`店家：${ev.restaurant_name}`)
    lines.push('')
    const itemMap: Record<string, number> = {}
    for (const o of evOrders) {
      const key = `${o.item_name ?? ''}${o.note ? `（${o.note}）` : ''}`
      itemMap[key] = (itemMap[key] ?? 0) + (o.qty ?? 1)
    }
    Object.entries(itemMap).forEach(([name, qty]) => lines.push(`${name} × ${qty}`))
    lines.push('')
    lines.push(`合計：$${evOrders.reduce((s, o) => s + o.subtotal, 0)}`)
    navigator.clipboard.writeText(lines.join('\n'))
    flash('已複製到剪貼簿！')
  }

  // ---------- 員工 ----------
  const addEmployee = async () => {
    if (!newEmpName.trim()) return flash('請輸入員工姓名')
    const { error } = await supabase.from('employees').insert({ name: newEmpName.trim() })
    if (error) return flash('新增失敗：' + error.message)
    setNewEmpName(''); flash('員工已新增'); load()
  }

  const deleteEmployee = async (id: string, name: string) => {
    const { count } = await supabase.from('orders')
      .select('id', { count: 'exact', head: true }).eq('employee_id', id)
    const n = count ?? 0
    const warn = n > 0
      ? `確定刪除員工「${name}」？\n\n他名下有 ${n} 筆訂餐紀錄，會一起永久刪除，月結報表的金額會跟著變少。此動作無法復原。`
      : `確定刪除員工「${name}」？`
    if (!confirm(warn)) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) {
      return flash('刪除失敗：' + error.message + '｜請先到 Supabase SQL Editor 執行升級 SQL（migration_dual_day_celebration.sql）')
    }
    flash(`已刪除員工「${name}」${n > 0 ? `，連同 ${n} 筆訂單` : ''}`)
    load()
  }

  // ---------- 今日/明日訂單 ----------
  const activeSlot = SLOTS.find(s => s.key === orderSlot)!
  const slotOrders = (dayOrders as any[]).filter(
    o => o.date === dateOf(activeSlot.day) && (o.category ?? 'lunch') === activeSlot.cat
  )
  const slotCount = (s: typeof SLOTS[number]) =>
    (dayOrders as any[]).filter(o => o.date === dateOf(s.day) && (o.category ?? 'lunch') === s.cat).length

  const copyOrderList = () => {
    const store = slots[orderSlot].storeInput.trim()
    const lines = [`【${activeSlot.label}訂單】${dateOf(activeSlot.day)}`]
    if (store) lines.push(`店家：${store}`)
    lines.push('')
    const itemMap: Record<string, number> = {}
    for (const o of slotOrders) {
      const key = `${o.item_name ?? ''}${o.note ? `（${o.note}）` : ''}`
      itemMap[key] = (itemMap[key] ?? 0) + (o.qty ?? 1)
    }
    Object.entries(itemMap).forEach(([name, qty]) => lines.push(`${name} × ${qty}`))
    lines.push('')
    lines.push(`合計：$${slotOrders.reduce((s, o) => s + o.subtotal, 0)}`)
    navigator.clipboard.writeText(lines.join('\n'))
    flash('已複製到剪貼簿！')
  }

  const tabClass = (t: string) =>
    `px-4 py-2 rounded-lg font-medium text-sm transition-colors ${tab === t ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
  const slotBtnClass = (k: SlotKey) =>
    `px-3 py-1.5 text-sm rounded-lg font-medium ${orderSlot === k ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
  const dayBtnClass = (d: DayKey) =>
    `flex-1 px-4 py-2 rounded-lg text-sm font-semibold ${settingDay === d ? 'bg-orange-500 text-white' : 'bg-white border text-gray-500 hover:bg-gray-50'}`

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
        <button className={tabClass('daily')} onClick={() => setTab('daily')}>今日／明日設定</button>
        <button className={tabClass('celebration')} onClick={() => setTab('celebration')}>慶祝活動</button>
        <button className={tabClass('ratings')} onClick={() => setTab('ratings')}>評價統計</button>
        <button className={tabClass('employees')} onClick={() => setTab('employees')}>員工管理</button>
      </div>

      {/* ===== 今日／明日設定 ===== */}
      {tab === 'daily' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">📋 設定店家與菜單</h2>
            <div className="flex gap-2 mb-4">
              <button className={dayBtnClass('today')} onClick={() => setSettingDay('today')}>
                今日 · {dateLabel(dates.today)}
              </button>
              <button className={dayBtnClass('tomorrow')} onClick={() => setSettingDay('tomorrow')}>
                明日 · {dateLabel(dates.tomorrow)}
              </button>
            </div>
            <div className="space-y-5">
              {DAILY_CATEGORIES.map(({ key: cat, label }) => {
                const sk = `${settingDay}__${cat}` as SlotKey
                const d = slots[sk]
                return (
                  <div key={sk} className="border rounded-lg p-4">
                    <p className="font-medium text-gray-700 mb-2">
                      {settingDay === 'today' ? '今日' : '明日'}{label}
                      <span className="ml-2 text-xs font-normal text-gray-400">{dateOf(settingDay)}</span>
                    </p>
                    <div className="flex gap-2 mb-3">
                      <input
                        placeholder="店家名稱（例：阿明便當）"
                        value={d.storeInput}
                        onChange={e => setSlot(sk, { storeInput: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && saveStoreName(settingDay, cat)}
                        className="flex-1 border rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                      <button onClick={() => saveStoreName(settingDay, cat)}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">儲存店家</button>
                    </div>
                    <input
                      ref={el => { fileRefs.current[sk] = el }}
                      type="file" accept="image/*" capture="environment"
                      onChange={e => handleMenuUpload(settingDay, cat, e)}
                      className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-600 file:text-white file:font-medium hover:file:bg-gray-700 cursor-pointer" />
                    {d.uploading && <p className="text-sm text-gray-400 mt-2">上傳中…</p>}
                    {d.menuImage && !d.uploading && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm text-green-600 font-medium">✓ 已上傳菜單圖片</p>
                          <button onClick={() => removeMenuImage(settingDay, cat)}
                            className="text-xs text-red-400 hover:text-red-600">移除</button>
                        </div>
                        <img src={d.menuImage} alt="菜單" className="max-h-48 rounded-lg border object-contain" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 四個獨立類別的訂單 */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold text-gray-700">訂單統計</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {SLOTS.map(s => (
                  <button key={s.key} className={slotBtnClass(s.key)} onClick={() => setOrderSlot(s.key)}>
                    {s.label}
                    <span className={`ml-1.5 text-xs ${orderSlot === s.key ? 'text-orange-100' : 'text-gray-400'}`}>
                      {slotCount(s)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <span className="text-sm text-gray-500">
                {activeSlot.label}（{dateOf(activeSlot.day)}）：
                {slotOrders.length > 0 ? `${slotOrders.length} 筆` : '尚無訂單'}
              </span>
              {slotOrders.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg overflow-hidden border text-sm">
                    <button onClick={() => setOrderView('person')}
                      className={`px-3 py-1.5 ${orderView === 'person' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>依員工</button>
                    <button onClick={() => setOrderView('item')}
                      className={`px-3 py-1.5 ${orderView === 'item' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>依品項</button>
                  </div>
                  <button onClick={copyOrderList}
                    className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium">複製叫餐清單</button>
                </div>
              )}
            </div>

            {slotOrders.length === 0 ? (
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
                  {slotOrders.map((o, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 text-gray-700">{o.employees?.name}</td>
                      <td className="py-1.5 text-gray-700">{o.item_name}</td>
                      <td className="py-1.5 text-blue-500 text-xs">{o.note ?? ''}</td>
                      <td className="py-1.5 text-right text-orange-500">${o.subtotal}</td>
                      <td className="py-1.5 text-right">
                        <button onClick={() => deleteOrder(o.id)}
                          className="text-red-300 hover:text-red-500 text-lg leading-none">×</button>
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td colSpan={3} className="pt-2 text-gray-700">合計</td>
                    <td className="pt-2 text-right text-orange-600">${slotOrders.reduce((s, o) => s + o.subtotal, 0)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            ) : (() => {
              const itemMap: Record<string, { itemName: string; count: number; total: number; persons: string[]; note: string }> = {}
              for (const o of slotOrders) {
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
                      <td className="pt-2 text-right text-gray-700">× {slotOrders.reduce((s, o) => s + (o.qty ?? 1), 0)}</td>
                      <td className="pt-2 text-right text-orange-600">${slotOrders.reduce((s, o) => s + o.subtotal, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              )
            })()}
          </div>
        </div>
      )}

      {/* ===== 慶祝活動 ===== */}
      {tab === 'celebration' && (
        <div className="space-y-4">
          {/* 新增／編輯活動 */}
          <div className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
            <h2 className="font-semibold text-gray-700">
              {evForm.id ? '✏️ 編輯活動' : '🎉 新增慶祝活動'}
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                活動名稱 <span className="text-red-400">*</span>
                <span className="ml-2 text-xs font-normal text-gray-400">這是什麼慶祝活動</span>
              </label>
              <input
                placeholder="例：10月壽星慶生會 / 尾牙加菜 / 專案慶功宴"
                value={evForm.name}
                onChange={e => setEvForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-400" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開放預訂/修改（起）</label>
                <input type="date" value={evForm.start_date}
                  onChange={e => setEvForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">截止日期（含當天）</label>
                <input type="date" value={evForm.end_date}
                  onChange={e => setEvForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-400" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">店家名稱（可空白）</label>
                <input placeholder="例：某某蛋糕店" value={evForm.restaurant_name}
                  onChange={e => setEvForm(f => ({ ...f, restaurant_name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">補充說明（可空白）</label>
                <input placeholder="例：公司補助每人 200 元" value={evForm.note}
                  onChange={e => setEvForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-400" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">活動菜單圖片（可空白）</label>
              <input ref={evFileRef} type="file" accept="image/*" onChange={handleEventMenuUpload}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-600 file:text-white file:font-medium hover:file:bg-gray-700 cursor-pointer" />
              {evForm.menu_image && (
                <div className="mt-2 flex items-start gap-3">
                  <img src={evForm.menu_image} alt="菜單" className="max-h-32 rounded-lg border object-contain" />
                  <button onClick={() => { setEvForm(f => ({ ...f, menu_image: null })); if (evFileRef.current) evFileRef.current.value = '' }}
                    className="text-xs text-red-400 hover:text-red-600">移除圖片</button>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveEvent} disabled={evSaving}
                className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50">
                {evSaving ? '儲存中…' : evForm.id ? '儲存修改' : '建立活動'}
              </button>
              {evForm.id && (
                <button onClick={() => { setEvForm(emptyEventForm()); if (evFileRef.current) evFileRef.current.value = '' }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">取消編輯</button>
              )}
            </div>
          </div>

          {/* 活動清單 */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">活動清單（{events.length}）</h2>
            {events.length === 0 ? (
              <p className="text-gray-400 text-sm italic">尚未建立任何活動</p>
            ) : (
              <div className="space-y-2">
                {events.map(ev => {
                  const st = eventStatus(ev, dates.today)
                  const cls = st === 'open' ? 'bg-rose-500 text-white'
                    : st === 'upcoming' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'
                  return (
                    <div key={ev.id}
                      className={`border rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${evSelected === ev.id ? 'border-rose-300 bg-rose-50' : ''}`}>
                      <button className="text-left flex-1 min-w-[180px]" onClick={() => setEvSelected(ev.id)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800">{ev.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{EVENT_STATUS_LABEL[st]}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {ev.start_date} ～ {ev.end_date}
                          {ev.restaurant_name && ` ｜ ${ev.restaurant_name}`}
                        </div>
                      </button>
                      <div className="flex items-center gap-3 text-sm">
                        <button onClick={() => editEvent(ev)} className="text-gray-500 hover:text-gray-800">編輯</button>
                        <button onClick={() => deleteEvent(ev)} className="text-red-300 hover:text-red-500">刪除</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 該活動的訂單彙總 */}
          {evSelected && (
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-semibold text-gray-700">
                  「{events.find(e => e.id === evSelected)?.name}」訂單彙總
                </h2>
                {evOrders.length > 0 && (
                  <button onClick={copyEventList}
                    className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium">複製叫餐清單</button>
                )}
              </div>
              {evOrders.length === 0 ? (
                <p className="text-gray-400 text-sm italic">此活動還沒有人訂購</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="text-left py-1">員工</th>
                      <th className="text-left py-1">品項</th>
                      <th className="text-left py-1">備註</th>
                      <th className="text-right py-1">金額</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(evOrders as any[]).map(o => (
                      <tr key={o.id} className="border-b last:border-0">
                        <td className="py-1.5 text-gray-700">{o.employees?.name}</td>
                        <td className="py-1.5 text-gray-700">{o.item_name}</td>
                        <td className="py-1.5 text-blue-500 text-xs">{o.note ?? ''}</td>
                        <td className="py-1.5 text-right text-rose-500">${o.subtotal}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => deleteOrder(o.id, true)}
                            className="text-red-300 hover:text-red-500 text-lg leading-none">×</button>
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td colSpan={3} className="pt-2 text-gray-700">活動合計</td>
                      <td className="pt-2 text-right text-rose-600">
                        ${(evOrders as any[]).reduce((s, o) => s + o.subtotal, 0)}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}
              <p className="text-xs text-gray-400 mt-3">
                ＊截止日之後同事就不能自行修改，但管理員在這裡仍可刪除或調整。
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===== 評價統計 ===== */}
      {tab === 'ratings' && (() => {
        type Agg = { name: string; cat: string; sum: number; count: number }
        const storeAgg: Record<string, Agg> = {}
        const dishAgg: Record<string, Agg> = {}
        for (const o of ratedOrders as any[]) {
          const cat = o.category ?? 'lunch'
          const store = cat === 'celebration'
            ? (o.event_id ? eventNameMap[o.event_id] ?? '（未指定活動）' : '（未指定活動）')
            : (storeMap[`${o.date}__${cat}`] ?? '（未填店家）')
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
            <RankTable rows={stores} head="🏪 店家 / 活動排行（依平均星數）" />
            <RankTable rows={dishes} head="🍱 餐點排行（依平均星數）" />
            <p className="text-xs text-gray-400">
              ＊評分由同事在「月結報表」針對自己點的餐點給 1～5 星，本表自動彙整。
              慶祝活動以「活動的店家名稱」統計，未填店家時用活動名稱。
            </p>
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
                  <button onClick={() => deleteEmployee(e.id, e.name)}
                    className="text-red-300 hover:text-red-500 text-sm">刪除</button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              ＊刪除員工會連同他所有的訂餐紀錄一起永久刪除，月結報表的金額會跟著變少，刪除前系統會先告訴你有幾筆。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
