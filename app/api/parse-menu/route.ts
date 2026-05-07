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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' })
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: image, mimeType } },
    ])
    const text = result.response.text()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return Response.json({ error: '辨識結果格式異常，請重試', raw: text }, { status: 500 })

    return Response.json(JSON.parse(jsonMatch[0]))
  } catch (e: any) {
    console.error('parse-menu error:', e)
    return Response.json({ error: e.message || '伺服器錯誤' }, { status: 500 })
  }
}
