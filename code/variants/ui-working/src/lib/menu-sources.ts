export const MENU_SOURCE_OPTIONS = [
  {
    id: "breakfast_menu",
    label: "Breakfast Menu",
    aliases: ["breakfast", "breakfast menu", "brunch", "viennoiseries", "light and simple", "light & simple", "classics", "indulgent", "add ons"],
  },
  {
    id: "business_lunch_menu",
    label: "Business Lunch Menu",
    aliases: ["business lunch", "business lunch menu", "lunch", "lunch menu", "mains", "main course"],
  },
  {
    id: "dubai_restaurant_week_lunch_menu",
    label: "Dubai Restaurant Week Lunch Menu",
    aliases: ["dubai_restaurant_week_menu", "dubai restaurant week", "dubai restaurant week menu", "dubai restaurant week lunch", "dubai restaurant week lunch menu", "restaurant week lunch", "drw lunch", "restaurant week menu"],
  },
  {
    id: "dubai_restaurant_week_dinner_menu",
    label: "Dubai Restaurant Week Dinner Menu",
    aliases: ["dubai restaurant week dinner", "dubai restaurant week dinner menu", "restaurant week dinner", "drw dinner"],
  },
  {
    id: "a_la_carte_menu",
    label: "A La Carte Menu",
    aliases: ["a la carte", "à la carte", "alacarte", "dinner", "dinner menu", "raw bar", "starters", "main dining"],
  },
  {
    id: "dessert_menu",
    label: "Dessert Menu",
    aliases: ["dessert", "desserts", "dessert menu", "sweet", "sweets"],
  },
  {
    id: "beverage_menu",
    label: "Beverage Menu",
    aliases: ["beverage", "beverage menu", "drink", "drinks", "drinks menu", "cocktail", "cocktails", "mocktail", "coffee", "tea", "bar menu", "traffic hours", "happy hour"],
  },
  {
    id: "wine_spirits_menu",
    label: "Wine & Spirits Menu",
    aliases: ["wine", "wines", "spirits", "wine spirits", "wine & spirits", "wine and spirits", "wine menu", "spirits menu", "vodka", "tequila", "gin", "rum", "cognac", "whisky", "champagne"],
  },
] as const

export type MenuSourceId = typeof MENU_SOURCE_OPTIONS[number]["id"]

export function normalizeMenuSourceText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function resolveMenuSource(value?: string | null) {
  if (!value?.trim()) return null
  const normalized = normalizeMenuSourceText(value)
  const exact = MENU_SOURCE_OPTIONS.find(option => {
    if (option.id === value || normalizeMenuSourceText(option.id) === normalized || normalizeMenuSourceText(option.label) === normalized) return true
    return option.aliases.some(alias => normalizeMenuSourceText(alias) === normalized)
  }) ?? null
  if (exact) return exact
  return MENU_SOURCE_OPTIONS.find(option => option.aliases.some(alias => {
    const normalizedAlias = normalizeMenuSourceText(alias)
    return normalizedAlias.length > 3 && normalized.includes(normalizedAlias)
  })) ?? null
}

export function menuSourceLabel(value?: string | null) {
  return resolveMenuSource(value)?.label || value?.trim() || ""
}
