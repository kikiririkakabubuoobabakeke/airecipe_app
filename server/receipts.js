import { createGroqChatCompletion, defaultGroqModel } from './groq.js'
import { isSupabaseServiceRoleConfigured, supabase } from './supabase.js'

const demoUserId = process.env.AI_RECIPE_DEMO_USER_ID

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }

  if (!isSupabaseServiceRoleConfigured) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for receipt import operations',
    )
  }

  return supabase
}

async function resolveUserId(requestedUserId) {
  if (requestedUserId) {
    return requestedUserId
  }

  if (demoUserId) {
    return demoUserId
  }

  throw new Error('AI_RECIPE_DEMO_USER_ID is required in .env.')
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIsoDate(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function normalizeCategory(category) {
  const value = String(category ?? '').trim()
  return value || 'その他'
}

function normalizeItem(item, index) {
  const name = String(item?.name ?? '').trim()

  return {
    id: String(item?.id ?? `receipt-${index + 1}`),
    name,
    category: normalizeCategory(item?.category),
    quantity:
      item?.quantity === null || item?.quantity === undefined
        ? null
        : Math.max(0, Math.round(Number(item.quantity) || 0)) || null,
    gram:
      item?.gram === null || item?.gram === undefined
        ? null
        : Math.max(0, Math.round(Number(item.gram) || 0)) || null,
    expirationDate: item?.expirationDate ? String(item.expirationDate) : null,
    memo: item?.memo ? String(item.memo) : 'レシートOCR',
    selected: item?.selected !== false,
  }
}

function normalizeReceiptItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeItem)
    .filter((item) => item.name)
}

function buildReceiptPrompt(ocrText) {
  return `以下は日本のスーパー等のレシートOCR結果です。食材として在庫登録すべき商品だけを抽出してください。

条件:
- 返答はJSONのみ。Markdownや説明文は禁止。
- 日用品、袋代、割引、合計、税、ポイント、店舗名、電話番号は除外してください。
- 商品名は自然な日本語の食材名に補正してください。
- category は 野菜 / 肉 / 魚 / 卵 / 乳製品 / 主食 / 調味料 / 加工品 / 飲料 / その他 のどれかにしてください。
- quantity は個数・本数・パック数として分かる場合だけ数値にしてください。
- gram はgやml換算できる場合だけ数値にしてください。mlはgram欄で扱ってください。
- expirationDate は判断できない場合 null にしてください。
- 賞味期限が不明な場合でも、カテゴリから期限を仮置きしすぎないでください。
- selected は true にしてください。

OCR結果:
${ocrText}

JSON形式:
{
  "items": [
    {
      "name": "小松菜",
      "category": "野菜",
      "quantity": 1,
      "gram": null,
      "expirationDate": null,
      "memo": "レシートOCR",
      "selected": true
    }
  ]
}`
}

function parseJsonFromModel(content) {
  const trimmed = content.trim()
  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  return JSON.parse(withoutFence)
}

function fallbackParseReceiptText(ocrText) {
  const ignoredPatterns =
    /(合計|小計|税込|税率|消費税|現計|釣銭|お預り|ポイント|袋|レジ|領収|電話|TEL|カード|クレジット|割引|値引|対象|店舗|担当|No\.|合計点数)/i

  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !ignoredPatterns.test(line))

  return lines.slice(0, 12).map((line, index) => {
    const withoutPrice = line.replace(/[¥￥]?\s*\d{2,5}\s*円?$/u, '').trim()

    return {
      id: `receipt-${index + 1}`,
      name: withoutPrice || line,
      category: 'その他',
      quantity: 1,
      gram: null,
      expirationDate: null,
      memo: 'レシートOCR',
      selected: true,
    }
  })
}

export async function parseReceiptText({ ocrText }) {
  const text = String(ocrText ?? '').trim()

  if (!text) {
    throw new Error('ocrText is required')
  }

  try {
    const completion = await createGroqChatCompletion({
      model: defaultGroqModel,
      messages: [
        {
          role: 'system',
          content:
            'あなたは日本語レシートから食材だけを抽出してJSON化するアシスタントです。',
        },
        {
          role: 'user',
          content: buildReceiptPrompt(text),
        },
      ],
      temperature: 0.2,
      max_tokens: 1800,
      response_format: {
        type: 'json_object',
      },
    })
    const content = completion?.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('Groq response was empty')
    }

    const payload = parseJsonFromModel(content)
    const items = normalizeReceiptItems(payload.items)

    if (items.length) {
      return { items }
    }
  } catch (error) {
    console.warn('[node] Receipt AI parse failed, using fallback:', error)
  }

  return {
    items: fallbackParseReceiptText(text),
  }
}

async function findOrCreateIngredient({ client, userId, item }) {
  const { data: existing, error: fetchError } = await client
    .from('ingredient_management')
    .select('ingredient_id, ingredient_name, category')
    .eq('user_id', userId)
    .eq('ingredient_name', item.name)
    .limit(1)
    .maybeSingle()

  if (fetchError) {
    throw new Error(`Failed to find ingredient: ${fetchError.message}`)
  }

  if (existing) {
    return existing
  }

  const { data, error } = await client
    .from('ingredient_management')
    .insert({
      user_id: userId,
      ingredient_name: item.name,
      category: item.category,
      barcode: `receipt-${Date.now()}`,
    })
    .select('ingredient_id, ingredient_name, category')
    .single()

  if (error) {
    throw new Error(`Failed to create ingredient: ${error.message}`)
  }

  return data
}

function fallbackExpirationDate(item) {
  if (item.expirationDate) {
    return item.expirationDate
  }

  const categoryDays = {
    野菜: 5,
    肉: 2,
    魚: 1,
    卵: 14,
    乳製品: 7,
    主食: 30,
    調味料: 90,
    加工品: 14,
    飲料: 14,
    その他: 7,
  }

  return addDaysIsoDate(categoryDays[item.category] ?? 7)
}

export async function importReceiptItems({
  items,
  userId: requestedUserId,
}) {
  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()
  const selectedItems = normalizeReceiptItems(items).filter(
    (item) => item.selected,
  )

  if (!selectedItems.length) {
    throw new Error('No receipt items selected')
  }

  const imported = []

  for (const item of selectedItems) {
    const ingredient = await findOrCreateIngredient({ client, userId, item })
    const { data, error } = await client
      .from('inventory')
      .insert({
        ingredient_id: ingredient.ingredient_id,
        user_id: userId,
        quantity: item.quantity,
        gram: item.gram,
        purchase_date: todayIsoDate(),
        expiration_date: fallbackExpirationDate(item),
        memo: item.memo ?? 'レシートOCR',
      })
      .select('inventory_id')
      .single()

    if (error) {
      throw new Error(`Failed to import inventory: ${error.message}`)
    }

    imported.push({
      inventoryId: data.inventory_id,
      ingredientId: ingredient.ingredient_id,
      name: ingredient.ingredient_name,
    })
  }

  return {
    userId,
    importedCount: imported.length,
    imported,
  }
}
