'use client'

import { usePathname } from 'next/navigation'

// 星空外框：依目前頁面決定主題色（純視覺），導覽列與星雲光跟著換色
type Theme = 'lunch' | 'drinks' | 'celebration' | 'admin'

const LINKS: { href: string; label: string }[] = [
  { href: '/', label: '午餐' },
  { href: '/drinks', label: '飲料/下午茶' },
  { href: '/celebration', label: '慶祝活動' },
  { href: '/report', label: '月結報表' },
  { href: '/admin', label: '管理後台' },
]

const themeOf = (path: string): Theme =>
  path.startsWith('/drinks') ? 'drinks'
    : path.startsWith('/celebration') ? 'celebration'
    : path.startsWith('/report') || path.startsWith('/admin') ? 'admin'
    : 'lunch'

const isActive = (path: string, href: string) =>
  href === '/' ? path === '/' : path.startsWith(href)

export default function CosmicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'

  return (
    <div className="cosmic-sky" data-theme={themeOf(pathname)}>
      <div className="nebula nebula--a" aria-hidden />
      <div className="nebula nebula--b" aria-hidden />
      <nav className="cosmic-nav">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex gap-x-2 gap-y-2 items-center flex-wrap">
          <span className="cosmic-brand font-bold text-base mr-2">公司點餐</span>
          {LINKS.map(l => (
            <a key={l.href} href={l.href} className="cosmic-navlink text-sm"
              aria-current={isActive(pathname, l.href) ? 'page' : undefined}>
              {l.label}
            </a>
          ))}
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
