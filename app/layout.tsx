import type { Metadata } from 'next'
import { Noto_Sans_TC, Chakra_Petch } from 'next/font/google'
import './globals.css'
import CosmicShell from './components/CosmicShell'

// 中文內文（variable font，不需指定字重）；Google 沒有中文 subset 可預載，所以關掉 preload
const notoSansTC = Noto_Sans_TC({ subsets: ['latin'], variable: '--font-body', preload: false })
// 數字與英文小標
const chakraPetch = Chakra_Petch({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-tech' })

export const metadata: Metadata = {
  title: '辦公室午餐訂餐系統',
  description: '每日點餐、月底結算',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${notoSansTC.variable} ${chakraPetch.variable}`}>
      <body className="min-h-screen">
        <CosmicShell>{children}</CosmicShell>
      </body>
    </html>
  )
}
