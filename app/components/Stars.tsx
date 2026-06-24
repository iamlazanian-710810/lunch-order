'use client'

// 唯讀星級顯示（可帶半星，用整數四捨五入呈現）
export function StarDisplay({ value, size = 'text-base' }: { value: number; size?: string }) {
  const rounded = Math.round(value)
  return (
    <span className={`${size} leading-none tracking-tight`} title={value.toFixed(2)}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} className={n <= rounded ? 'text-amber-400' : 'text-gray-200'}>★</span>
      ))}
    </span>
  )
}

// 可點選星級（給本人評分用）
export function StarRate({
  value,
  onRate,
  disabled,
}: {
  value: number | null
  onRate?: (n: number) => void
  disabled?: boolean
}) {
  return (
    <span className="leading-none whitespace-nowrap">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onRate?.(n)}
          className={`text-lg leading-none ${disabled ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform'} ${value && n <= value ? 'text-amber-400' : 'text-gray-300'}`}
        >★</button>
      ))}
    </span>
  )
}
