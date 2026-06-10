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

const validCategories = new Set([
  '野菜',
  '肉',
  '魚',
  '卵',
  '乳製品',
  '主食',
  '調味料',
  '加工品',
  '飲料',
  'その他',
])

const ignoredLinePattern =
  /(合計|小計|税込|税率|消費税|現計|釣銭|お預り|お預かり|ポイント|袋|レジ|領収|電話|TEL|カード|クレジット|割引|値引|対象|店舗|担当|No\.|合計点数|買上|お買上|単価|外税|内税|軽減|登録番号|インボイス|ありがとうございました)/i

const nameCorrections = [
  [/^(サケ|鮭|さけ|シャケ|しやけ).*?(キリミ|切身|切り身|切み)?$/iu, '鮭切り身'],
  [/^(コマツナ|小松菜|こまつな)$/iu, '小松菜'],
  [/^(タマゴ|玉子|卵|たまご).*$/iu, '卵'],
  [/^(ギュウニュウ|牛乳|ぎゅうにゅう).*$/iu, '牛乳'],
  [/^(タマネギ|玉ねぎ|玉葱|たまねぎ).*$/iu, '玉ねぎ'],
  [/^(キャベツ|きゃべつ).*$/iu, 'キャベツ'],
  [/^(ニンジン|人参|にんじん).*$/iu, 'にんじん'],
  [/^(ジャガイモ|じゃがいも|馬鈴薯).*$/iu, 'じゃがいも'],
  [/^(トマト|とまと).*$/iu, 'トマト'],
  [/^(ブタ|豚|豚肉).*$/iu, '豚肉'],
  [/^(トリ|鶏|鶏肉|チキン).*$/iu, '鶏肉'],
  [/^(ギュウ|牛|牛肉).*$/iu, '牛肉'],
  [/^(コメ|米|白米).*$/iu, '米'],
  [/^(ナットウ|納豆).*$/iu, '納豆'],
  [/^(トウフ|豆腐).*$/iu, '豆腐'],
]

function inferCategory(name, category) {
  if (validCategories.has(category)) {
    return category
  }

  if (/(小松菜|玉ねぎ|キャベツ|にんじん|じゃがいも|トマト|野菜|ねぎ|白菜|大根)/u.test(name)) {
    return '野菜'
  }

  if (/(鮭|サーモン|魚|さば|鯖|さんま|まぐろ|刺身)/u.test(name)) {
    return '魚'
  }

  if (/(豚|鶏|牛肉|肉|ハム|ベーコン|ウインナー)/u.test(name)) {
    return '肉'
  }

  if (/(卵|玉子|たまご)/u.test(name)) {
    return '卵'
  }

  if (/(牛乳|チーズ|ヨーグルト|乳)/u.test(name)) {
    return '乳製品'
  }

  if (/(米|パン|麺|うどん|そば|パスタ)/u.test(name)) {
    return '主食'
  }

  if (/(醤油|しょうゆ|味噌|みそ|塩|砂糖|油|ソース|だし)/u.test(name)) {
    return '調味料'
  }

  if (/(納豆|豆腐|ちくわ|缶|冷凍|惣菜)/u.test(name)) {
    return '加工品'
  }

  if (/(茶|水|ジュース|飲料|コーヒー)/u.test(name)) {
    return '飲料'
  }

  return 'その他'
}

function normalizeIngredientName(name) {
  const base = String(name ?? '')
    .replace(/[＊*※]/g, '')
    .replace(/[¥￥]?\s*\d{2,6}\s*円?$/u, '')
    .replace(/\s+/g, '')
    .replace(/[|｜:：]/g, '')
    .trim()

  const withoutAmount = base
    .replace(/\d+(?:\.\d+)?\s*(g|ｇ|グラム|ml|mL|ML|ミリリットル|個|コ|本|枚|袋|パック|P)$/iu, '')
    .trim()

  for (const [pattern, replacement] of nameCorrections) {
    if (pattern.test(withoutAmount)) {
      return replacement
    }
  }

  return withoutAmount || base
}

function inferGramFromText(text) {
  const match = String(text ?? '').match(/(\d+(?:\.\d+)?)\s*(g|ｇ|グラム|ml|mL|ML|ミリリットル)/iu)
  return match ? Math.round(Number(match[1])) : null
}

function inferQuantityFromText(text) {
  const match = String(text ?? '').match(/(\d+)\s*(個|コ|本|枚|袋|パック|P)/iu)
  return match ? Math.round(Number(match[1])) : null
}

function normalizeCategory(category) {
  const value = String(category ?? '').trim()
  return validCategories.has(value) ? value : 'その他'
}

function normalizeItem(item, index) {
  const sourceText = String(item?.sourceLine ?? item?.name ?? '')
  const name = normalizeIngredientName(item?.name)
  const category = inferCategory(name, normalizeCategory(item?.category))
  const quantity =
    item?.quantity === null || item?.quantity === undefined
      ? inferQuantityFromText(sourceText)
      : Math.max(0, Math.round(Number(item.quantity) || 0)) || null
  const gram =
    item?.gram === null || item?.gram === undefined
      ? inferGramFromText(sourceText)
      : Math.max(0, Math.round(Number(item.gram) || 0)) || null

  return {
    id: String(item?.id ?? `receipt-${index + 1}`),
    name,
    category,
    quantity,
    gram,
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

function extractReceiptProductLines(ocrText) {
  return String(ocrText ?? '')
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[＊*※]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    .filter((line) => line && !ignoredLinePattern.test(line))
    .map((line) => line.replace(/^[^\p{L}\p{N}]+/u, '').trim())
    .filter((line) => line.length >= 2)
    .filter((line) => !/^[\d\s¥￥,.-]+$/u.test(line))
    .slice(0, 30)
}

function buildReceiptPrompt(ocrText, productLines) {
  const candidateText = productLines
    .map((line, index) => `${index + 1}. ${line}`)
    .join('\n')

  return `以下は日本のスーパー等のレシートOCR結果です。食材として在庫登録すべき商品だけを抽出してください。

条件:
- 返答はJSONのみ。Markdownや説明文は禁止。
- 「商品候補行」を最優先で見てください。OCR全文は補助情報です。
- 日用品、袋代、割引、合計、税、ポイント、店舗名、電話番号、支払い情報は除外してください。
- 商品名は自然な日本語の食材名に補正してください。例: サケキリミ→鮭切り身、コマツナ→小松菜、タマゴ→卵。
- 誤読っぽいカタカナでも、一般的な食材名なら補正してください。
- 商品名に価格や記号を含めないでください。
- category は 野菜 / 肉 / 魚 / 卵 / 乳製品 / 主食 / 調味料 / 加工品 / 飲料 / その他 のどれかにしてください。
- quantity は個数・本数・パック数として分かる場合だけ数値にしてください。
- gram はgやml換算できる場合だけ数値にしてください。mlはgram欄で扱ってください。
- expirationDate は判断できない場合 null にしてください。
- 賞味期限が不明な場合でも、カテゴリから期限を仮置きしすぎないでください。
- selected は true にしてください。
- sourceLine に元の商品候補行を入れてください。

商品候補行:
${candidateText || '(候補行なし)'}

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
      "selected": true,
      "sourceLine": "コマツナ 128"
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

export function fallbackParseReceiptText(ocrText) {
  const lines = extractReceiptProductLines(ocrText)

  return lines.slice(0, 12).map((line, index) => {
    const withoutPrice = line.replace(/[¥￥]?\s*\d{2,6}\s*円?$/u, '').trim()
    const name = normalizeIngredientName(withoutPrice || line)

    return {
      id: `receipt-${index + 1}`,
      name,
      category: inferCategory(name, 'その他'),
      quantity: inferQuantityFromText(line) ?? 1,
      gram: inferGramFromText(line),
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

  const productLines = extractReceiptProductLines(text)

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
          content: buildReceiptPrompt(text, productLines),
        },
      ],
      temperature: 0.05,
      max_tokens: 2200,
      response_format: {
        type: 'json_object',
      },
    })
    const content = completion?.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('Groq response was empty')
    }

    const payload = parseJsonFromModel(content)
    const items = normalizeReceiptItems(payload.items).filter((item) =>
      productLines.length
        ? productLines.some((line) =>
          line.includes(item.name) ||
          normalizeIngredientName(line).includes(item.name) ||
          item.name.includes(normalizeIngredientName(line)),
        ) || item.category !== 'その他'
        : true,
    )

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

export async function importReceiptItemsDetail({
  items,
  userId: requestedUserId,
}) {
  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()

  const selectedItems = (Array.isArray(items) ? items : []).filter(
    (item) => item.selected !== false && item.name,
  )

  if (!selectedItems.length) {
    throw new Error('No receipt items selected')
  }

  const imported = []

  for (const item of selectedItems) {
    let amountStr = '1個'
    const gramVal = item.gram ? Number(item.gram) : null
    const qtyVal = item.quantity ? Number(item.quantity) : null

    if (gramVal && gramVal > 0) {
      amountStr = `${gramVal}g`
    } else if (qtyVal && qtyVal > 0) {
      amountStr = `${qtyVal}個`
    }

    const { data: ingredient, error: ingredientError } = await client
      .from('ingredient_management')
      .insert({
        user_id: userId,
        ingredient_name: item.name,
        category: item.category,
        barcode: `receipt-${Date.now()}`,
        amount: amountStr,
        is_opened: false,
        best_before_date: item.bestBeforeDate ? String(item.bestBeforeDate) : null,
        expiration_date: item.expirationDate ? String(item.expirationDate) : null,
      })
      .select('ingredient_id, ingredient_name')
      .single()

    if (ingredientError) {
      throw new Error(`Failed to create ingredient detail: ${ingredientError.message}`)
    }

    let invExpirationDate = item.expirationDate || item.bestBeforeDate || null

    const { data: inventoryData, error: inventoryError } = await client
      .from('inventory')
      .insert({
        ingredient_id: ingredient.ingredient_id,
        user_id: userId,
        quantity: qtyVal,
        gram: gramVal,
        purchase_date: todayIsoDate(),
        expiration_date: invExpirationDate,
        memo: item.memo || 'レシートOCR詳細登録',
      })
      .select('inventory_id')
      .single()

    if (inventoryError) {
      throw new Error(`Failed to import inventory detail: ${inventoryError.message}`)
    }

    imported.push({
      inventoryId: inventoryData.inventory_id,
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

