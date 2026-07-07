export const CATEGORY_VALUES = {
  meatEggFish: '肉・卵・魚',
  vegetable: '野菜',
  dairy: '乳製品',
  staple: '主食',
  seasoning: '調味料',
  processed: '加工品',
  drink: '飲料',
  other: 'その他',
}

const categoryLabels = {
  ja: {
    [CATEGORY_VALUES.meatEggFish]: '肉・卵・魚',
    [CATEGORY_VALUES.vegetable]: '野菜',
    [CATEGORY_VALUES.dairy]: '乳製品',
    [CATEGORY_VALUES.staple]: '主食',
    [CATEGORY_VALUES.seasoning]: '調味料',
    [CATEGORY_VALUES.processed]: '加工品',
    [CATEGORY_VALUES.drink]: '飲料',
    [CATEGORY_VALUES.other]: 'その他',
  },
  en: {
    [CATEGORY_VALUES.meatEggFish]: 'Meat, eggs, fish',
    [CATEGORY_VALUES.vegetable]: 'Vegetables',
    [CATEGORY_VALUES.dairy]: 'Dairy',
    [CATEGORY_VALUES.staple]: 'Staples',
    [CATEGORY_VALUES.seasoning]: 'Seasonings',
    [CATEGORY_VALUES.processed]: 'Processed foods',
    [CATEGORY_VALUES.drink]: 'Drinks',
    [CATEGORY_VALUES.other]: 'Other',
  },
  fr: {
    [CATEGORY_VALUES.meatEggFish]: 'Viande, œufs, poisson',
    [CATEGORY_VALUES.vegetable]: 'Légumes',
    [CATEGORY_VALUES.dairy]: 'Produits laitiers',
    [CATEGORY_VALUES.staple]: 'Féculents',
    [CATEGORY_VALUES.seasoning]: 'Assaisonnements',
    [CATEGORY_VALUES.processed]: 'Produits transformes',
    [CATEGORY_VALUES.drink]: 'Boissons',
    [CATEGORY_VALUES.other]: 'Autre',
  },
}

const categoryAliases = new Map(
  [
    ['meateggfish', CATEGORY_VALUES.meatEggFish],
    ['meat', CATEGORY_VALUES.meatEggFish],
    ['fish', CATEGORY_VALUES.meatEggFish],
    ['egg', CATEGORY_VALUES.meatEggFish],
    ['meat eggs fish', CATEGORY_VALUES.meatEggFish],
    ['meat, eggs, fish', CATEGORY_VALUES.meatEggFish],
    ['viande oeufs poisson', CATEGORY_VALUES.meatEggFish],
    ['viande, oeufs, poisson', CATEGORY_VALUES.meatEggFish],
    ['肉', CATEGORY_VALUES.meatEggFish],
    ['魚', CATEGORY_VALUES.meatEggFish],
    ['卵', CATEGORY_VALUES.meatEggFish],
    ['肉魚卵', CATEGORY_VALUES.meatEggFish],
    ['肉・魚・卵', CATEGORY_VALUES.meatEggFish],
    ['肉・卵・魚', CATEGORY_VALUES.meatEggFish],
    ['vegetable', CATEGORY_VALUES.vegetable],
    ['vegetables', CATEGORY_VALUES.vegetable],
    ['legumes', CATEGORY_VALUES.vegetable],
    ['野菜', CATEGORY_VALUES.vegetable],
    ['dairy', CATEGORY_VALUES.dairy],
    ['produits laitiers', CATEGORY_VALUES.dairy],
    ['乳製品', CATEGORY_VALUES.dairy],
    ['staple', CATEGORY_VALUES.staple],
    ['staples', CATEGORY_VALUES.staple],
    ['feculents', CATEGORY_VALUES.staple],
    ['主食', CATEGORY_VALUES.staple],
    ['seasoning', CATEGORY_VALUES.seasoning],
    ['seasonings', CATEGORY_VALUES.seasoning],
    ['assaisonnements', CATEGORY_VALUES.seasoning],
    ['調味料', CATEGORY_VALUES.seasoning],
    ['processed', CATEGORY_VALUES.processed],
    ['processed foods', CATEGORY_VALUES.processed],
    ['produits transformes', CATEGORY_VALUES.processed],
    ['加工品', CATEGORY_VALUES.processed],
    ['drink', CATEGORY_VALUES.drink],
    ['drinks', CATEGORY_VALUES.drink],
    ['beverage', CATEGORY_VALUES.drink],
    ['beverages', CATEGORY_VALUES.drink],
    ['boissons', CATEGORY_VALUES.drink],
    ['飲料', CATEGORY_VALUES.drink],
    ['other', CATEGORY_VALUES.other],
    ['autre', CATEGORY_VALUES.other],
    ['その他', CATEGORY_VALUES.other],
  ].map(([alias, category]) => [normalizeCategoryText(alias), category]),
)

function normalizeCategoryText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[・、,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function normalizeCategoryValue(value) {
  const key = normalizeCategoryText(value)
  return key ? categoryAliases.get(key) ?? null : null
}

export function isKnownCategory(value) {
  return Boolean(normalizeCategoryValue(value))
}

export function inferCategoryFromName(name) {
  const text = String(name ?? '').normalize('NFKC')

  if (/(小松菜|玉ねぎ|玉葱|キャベツ|にんじん|人参|じゃがいも|馬鈴薯|トマト|野菜|ねぎ|白菜|大根|ピーマン|きのこ|しめじ|えのき|しいたけ|レタス|なす|ナス)/u.test(text)) {
    return CATEGORY_VALUES.vegetable
  }

  if (/(鮭|サーモン|魚|さば|鯖|さんま|まぐろ|刺身|豚|鶏|牛|肉|卵|玉子|たまご|ハム|ベーコン|ウインナー|ソーセージ|チキン)/u.test(text)) {
    return CATEGORY_VALUES.meatEggFish
  }

  if (/(牛乳|チーズ|ヨーグルト|バター|乳)/u.test(text)) {
    return CATEGORY_VALUES.dairy
  }

  if (/(米|白米|ご飯|パン|麺|うどん|そば|パスタ|ラーメン|焼きそば)/u.test(text)) {
    return CATEGORY_VALUES.staple
  }

  if (/(醤油|しょうゆ|味噌|みそ|塩|砂糖|油|ごま油|酢|ソース|だし|コンソメ|ケチャップ|マヨネーズ|カレー粉|こしょう|胡椒|料理酒|みりん|ポン酢|めんつゆ)/u.test(text)) {
    return CATEGORY_VALUES.seasoning
  }

  if (/(納豆|豆腐|ちくわ|缶|冷凍|惣菜|加工|レトルト|カップ)/u.test(text)) {
    return CATEGORY_VALUES.processed
  }

  if (/(茶|水|ジュース|飲料|コーヒー|珈琲|牛乳飲料|ソーダ)/u.test(text)) {
    return CATEGORY_VALUES.drink
  }

  return CATEGORY_VALUES.other
}

export function resolveCategory({
  category,
  name,
  inferWhenOther = false,
} = {}) {
  const normalized = normalizeCategoryValue(category)

  if (
    normalized &&
    (!inferWhenOther || normalized !== CATEGORY_VALUES.other)
  ) {
    return normalized
  }

  return inferCategoryFromName(name)
}

export function localizeCategory(category, language = 'ja') {
  const canonical = normalizeCategoryValue(category) ?? CATEGORY_VALUES.other
  const labels = categoryLabels[language] ?? categoryLabels.ja
  return labels[canonical] ?? labels[CATEGORY_VALUES.other]
}
