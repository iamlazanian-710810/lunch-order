// 日期工具：一律用「本機時區（台灣）」計算日期字串
// 注意：不可用 toISOString()，那是 UTC，台灣凌晨 0~8 點會算成前一天

export const toDateStr = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const todayStr = () => toDateStr(new Date())

export const tomorrowStr = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toDateStr(d)
}

// 2026-09-08 -> 9月8日（週一）
export const dateLabel = (dateStr: string) =>
  new Date(dateStr + 'T12:00:00').toLocaleDateString('zh-TW', {
    month: 'long', day: 'numeric', weekday: 'short',
  })

// 2026-09-08 -> 9/8（週一）
export const shortDateLabel = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00')
  const wd = d.toLocaleDateString('zh-TW', { weekday: 'short' })
  return `${d.getMonth() + 1}/${d.getDate()}（${wd.replace('週', '週')}）`
}

export type DayKey = 'today' | 'tomorrow'

export const DAYS: { key: DayKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'tomorrow', label: '明日' },
]

export const dateOfDay = (day: DayKey) => (day === 'today' ? todayStr() : tomorrowStr())
