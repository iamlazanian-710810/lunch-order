'use client'

import { useEffect, useState } from 'react'
import Planet from './Planet'

// 八顆星屑飛散的終點（px）
const SPARKS: [number, number][] = [[90, -40], [70, 60], [-80, 50], [-95, -30], [10, -100], [-20, 95], [110, 15], [-60, -85]]

// 光速躍遷的放射光線：角度、長度、飛多遠、延遲都帶一點固定的錯落，看起來才不會像齒輪
const rand = (i: number, seed: number) => {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
  return x - Math.floor(x) // 0~1，固定值（每次都一樣，不用 Math.random）
}
const STREAKS = Array.from({ length: 44 }, (_, i) => ({
  a: `${Math.round(i * (360 / 44) + rand(i, 1) * 6)}deg`,
  len: `${Math.round(50 + rand(i, 2) * 150)}px`,
  far: `${Math.round(220 + rand(i, 3) * 420)}px`,
  d: `${Math.round(rand(i, 4) * 260)}ms`,
  w: `${rand(i, 5) > 0.7 ? 3 : rand(i, 5) > 0.3 ? 2 : 1}px`,
}))

const TITLE = '點餐完成'

// 金額從 $0 跳到實際金額的時間點，要跟 globals.css 的 done-rise-2（1.7s 出現）對齊
const COUNT_START_MS = 1750
const COUNT_DURATION_MS = 450

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 送出成功的完成動畫（約 2 秒）：流星撞行星 → 閃光＋光速躍遷＋星雲亮起＋星屑 → 光環展開 → 打勾
// → 標題逐字點亮 → 摘要浮現、金額跳動。每次成功都重新 mount，動畫才會重播；時間軸寫在 globals.css。
export default function OrderDoneOverlay({
  item,
  price,
  onClose,
}: {
  item: string
  price: number
  onClose: () => void
}) {
  const [shownPrice, setShownPrice] = useState(() => (prefersReducedMotion() ? price : 0))

  useEffect(() => {
    if (prefersReducedMotion()) return
    let raf = 0
    const start = performance.now() + COUNT_START_MS
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / COUNT_DURATION_MS))
      setShownPrice(Math.round(price * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [price])

  return (
    <div className="done-overlay px-4" role="dialog" aria-modal="true" aria-labelledby="order-done-title">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="done-stage">
          <div className="done-nebula" />
          <div className="done-warp">
            {STREAKS.map((s, i) => (
              <div key={i} className="done-streak"
                style={{ '--a': s.a, '--len': s.len, '--far': s.far, '--d': s.d, height: s.w } as React.CSSProperties} />
            ))}
          </div>
          <div className="done-comet" />
          <div className="done-flash" />
          <div className="done-shock" />
          {SPARKS.map(([dx, dy], i) => (
            <div key={i} className="done-spark" style={{ '--dx': `${dx}px`, '--dy': `${dy}px` } as React.CSSProperties} />
          ))}
          <Planet>
            <div className="done-check-wrap">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#1a1030"
                strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path className="done-check" d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </div>
          </Planet>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="done-rise-1 cosmic-eyebrow" style={{ color: 'var(--accent)' }}>ORDER LOCKED IN</div>
          <h2 id="order-done-title" className="cosmic-title text-[28px] m-0" aria-label={TITLE}>
            {[...TITLE].map((ch, i) => (
              <span key={i} className="done-title-char" aria-hidden
                style={{ '--i': i } as React.CSSProperties}>{ch}</span>
            ))}
          </h2>
          <div className="done-rise-1 text-[15px] text-[#c9cdf2]">你的餐點已進入今日軌道</div>
        </div>

        <div className="done-rise-2 flex flex-col items-center gap-4">
          <div className="cosmic-soft px-4 py-2.5 text-[15px] text-white max-w-[320px]" style={{ borderRadius: 999 }}>
            {item} · <span className="cosmic-num font-semibold" aria-label={`$${price}`}>${shownPrice}</span>
          </div>
          <button type="button" autoFocus onClick={onClose}
            className="cosmic-btn-ghost w-[200px] text-base" style={{ minHeight: 48 }}>好的</button>
        </div>
      </div>
    </div>
  )
}
