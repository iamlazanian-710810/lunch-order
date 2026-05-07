import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '辦公室午餐訂餐系統',
  description: '每日點餐、月底結算',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-4xl mx-auto px-4 py-3 flex gap-6 items-center">
            <span className="font-bold text-orange-500 text-lg">午餐訂餐</span>
            <a href="/" className="text-gray-600 hover:text-orange-500 font-medium">今日點餐</a>
            <a href="/admin" className="text-gray-600 hover:text-orange-500 font-medium">管理後台</a>
            <a href="/report" className="text-gray-600 hover:text-orange-500 font-medium">月結報表</a>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
