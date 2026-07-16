import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) {
      return Response.json({ error: 'GEMINI_API_KEY 未設定' }, { status: 500 })
    }

    const body = await req.json().catch(() => null)
    if (!body?.image) {
      return Response.json({ error: '未收到圖片資料' }, { status: 400 })
    }

    const { image, mimeType = 'image/jpeg' } = body

    const prompt = `這是一份餐廳菜單的照片。請提取所有品項和價格。
只回傳以下 JSON 格式，不要加任何說明文字：
{
  "restaurant_name": "餐廳名稱（若看不出來則留空字串）",
  "items": [
    {"name": "品項名稱", "price": 價格數字}
  ]
}
價格請填整數（元），若看不清楚價格則填 0。`

    const genAI = new GoogleGenerativeAI(geminiKey)
    // Free-tier models get rate-limited at peak times; fall through the
    // chain instead of failing on the first 429/503.
    const MODELS = ['gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview']
    let text = ''
    let lastErr: any = null
    for (const name of MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: name })
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: image, mimeType } },
        ])
        text = result.response.text()
        if (text) break
      } catch (e: any) {
        lastErr = e
        console.error('parse-menu model failed:', name, e?.status || e?.message)
      }
    }
    if (!text) throw lastErr || new Error('AI 沒有回傳內容')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return Response.json({ error: '辨識結果格式異常，請重試', raw: text }, { status: 500 })

    return Response.json(JSON.parse(jsonMatch[0]))
  } catch (e: any) {
    console.error('parse-menu error:', e)
    return Response.json({ error: e.message || '伺服器錯誤' }, { status: 500 })
  }
}
