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
          <div className="max-w-4xl mx-auto px-4 py-3 flex gap-x-5 gap-y-2 items-center flex-wrap">
            <span className="font-bold text-orange-500 text-lg">公司點餐</span>
            <a href="/" className="text-gray-600 hover:text-orange-500 font-medium">午餐</a>
            <a href="/drinks" className="text-gray-600 hover:text-sky-500 font-medium">飲料/下午茶</a>
            <a href="/celebration" className="text-gray-600 hover:text-rose-500 font-medium">慶祝活動</a>
            <span className="text-gray-200">|</span>
            <a href="/report" className="text-gray-600 hover:text-orange-500 font-medium">月結報表</a>
            <a href="/admin" className="text-gray-600 hover:text-orange-500 font-medium">管理後台</a>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
