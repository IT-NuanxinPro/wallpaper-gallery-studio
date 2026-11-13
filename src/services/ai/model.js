export const AI_PROVIDER = 'sub2api'

export function normalizeModelId(value) {
  if (typeof value !== 'string') return ''
  const id = value.trim()
  if (!id || id.length > 200 || /\s/.test(id)) return ''
  if (
    [...id].some(
      char => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)
    )
  )
    return ''
  return id
}
