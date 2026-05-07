import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const geminiKey = process.env.GEMINI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!geminiKey && !anthropicKey) {
    return Response.json({ error: 'API Key 未設定，請聯絡管理員' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('image') as File
  if (!file) return Response.json({ error: '未收到圖片' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mimeType = file.type || 'image/jpeg'

  const prompt = `這是一份餐廳菜單的照片。請提取所有品項和價格。
只回傳以下 JSON 格式，不要加任何說明文字：
{
  "restaurant_name": "餐廳名稱（若看不出來則留空字串）",
  "items": [
    {"name": "品項名稱", "price": 價格數字},
    ...
  ]
}
價格請填整數（元），若看不清楚價格則填 0。`

  let text = ''

  if (geminiKey) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64, mimeType } },
    ])
    text = result.response.text()
  } else if (anthropicKey) {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: anthropicKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg', data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    })
    text = message.content[0].type === 'text' ? message.content[0].text : ''
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON')
    return Response.json(JSON.parse(jsonMatch[0]))
  } catch {
    return Response.json({ error: '辨識失敗，請重試', raw: text }, { status: 500 })
  }
}
