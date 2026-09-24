// 帶光環的小行星（純裝飾）。顏色跟著最近的 data-theme，大小由 CSS 的 --size 控制。
// 光環拆前後兩層：後半圈在星球後面，前半圈只留下半疊在前面，看起來才是「繞著」星球。
export default function Planet({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`planet ${className}`} aria-hidden>
      <div className="planet__tilt">
        <div className="planet__ring" />
        <div className="planet__body">
          <div className="planet__surface" />
          <div className="planet__shade" />
          {children}
        </div>
        <div className="planet__ring planet__ring--front" />
      </div>
    </div>
  )
}
