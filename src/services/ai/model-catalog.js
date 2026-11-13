import { normalizeModelId } from './model'

export function normalizeModelList(value, apiKey = '') {
  if (!Array.isArray(value)) return []
  const ids = new Set()
  for (const item of value) {
    const id = normalizeModelId(item?.id)
    if (id && (!apiKey || !id.includes(apiKey))) ids.add(id)
  }
  return [...ids].sort((a, b) => a.localeCompare(b)).map(id => ({ id }))
}
