export const MAX_SOURCE_BYTES = 250000000
export const PART_SIZE = 8388608
export const DAY = 86400000
export const USAGES = ['desktop', 'mobile', 'social-cover']

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}
export function ensure(condition, message, status = 400, code = 'INVALID_REQUEST') {
  if (!condition) throw new HttpError(status, code, message)
}
export function segment(value, label = '路径') {
  ensure(typeof value === 'string' && value.trim().length > 0 && value.length <= 150, `${label}不能为空或过长`)
  const text = value.trim().normalize('NFC')
  ensure(!/[\\/\x00-\x1f\x7f%]/.test(text) && !['.', '..'].includes(text), `${label}包含非法路径字符`)
  return text
}
export function validateSource(body) {
  const filename = segment(body.filename, '文件名')
  ensure(/\.(mp4|avi|flv|mov|m4v|webm|mkv)$/i.test(filename), '不支持的视频格式')
  ensure(Number.isSafeInteger(body.size) && body.size > 0 && body.size <= MAX_SOURCE_BYTES, '源视频必须大于0且不超过250MB')
  ensure(typeof body.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(body.sha256), '缺少有效的SHA-256文件指纹')
  const contentType = typeof body.contentType === 'string' && /^video\/[\w.+-]+$/.test(body.contentType) ? body.contentType : 'application/octet-stream'
  return { filename, size: body.size, sha256: body.sha256.toLowerCase(), contentType }
}
export function privateKey(key, id) {
  ensure(typeof key === 'string' && key.startsWith(`jobs/${id}/`) && key.length < 500 && !key.split('/').some(p => !p || p === '.' || p === '..') && !/[\\\x00-\x1f%]/.test(key), '处理资源不属于当前任务')
  return key
}
export function validateResult(value, id) {
  ensure(value && typeof value === 'object', '缺少处理结果')
  for (const asset of [value.download, value.preview]) {
    ensure(asset && asset.contentType === 'video/mp4' && Number.isSafeInteger(asset.size) && asset.size > 0 && /^[a-f0-9]{64}$/i.test(asset.sha256 || ''), '视频资源信息无效')
    privateKey(asset.key, id)
  }
  ensure(Array.isArray(value.frames) && value.frames.length > 0 && value.frames.length <= 5, '缺少有效候选封面')
  const ids = new Set()
  for (const frame of value.frames) {
    ensure(typeof frame.id === 'string' && /^[\w-]{1,80}$/.test(frame.id) && !ids.has(frame.id), '候选封面标识无效')
    ensure(Number.isFinite(frame.timestamp) && frame.timestamp >= 0 && Number.isFinite(frame.score), '候选封面参数无效')
    ids.add(frame.id); privateKey(frame.key, id); privateKey(frame.thumbnailKey, id)
  }
  ensure(ids.has(value.defaultFrameId), '默认封面不存在')
  const meta = value.metadata
  ensure(meta && [meta.width, meta.height].every(n => Number.isInteger(n) && n > 0 && n <= 16384) && Number.isFinite(meta.duration) && meta.duration > 0 && meta.format === 'mp4', '技术元数据无效')
  return value
}
export function validateReview(value, result) {
  ensure(value && result, '视频尚未处理完成')
  ensure(result.frames.some(frame => frame.id === value.selectedFrameId), '选择的封面不属于当前任务')
  ensure(USAGES.includes(value.usage), '用途无效')
  const basename = segment(value.filename, '文件名').replace(/\.[^.]+$/, '')
  segment(basename, '文件名主体')
  const review = {
    selectedFrameId: value.selectedFrameId,
    usage: value.usage, topic: segment(value.topic, '主题路径'),
    filename: basename + '.mp4',
    displayTitle: typeof value.displayTitle === 'string' ? value.displayTitle.trim().slice(0, 300) : '',
    description: typeof value.description === 'string' ? value.description.trim().slice(0, 3000) : '',
    keywords: Array.isArray(value.keywords) ? [...new Set(value.keywords.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean))].slice(0, 30).map(v => v.slice(0, 100)) : []
  }
  if (value.ai && typeof value.ai === 'object') {
    ensure(result.frames.some(frame => frame.id === value.ai.frameId), 'AI分析封面无效')
    review.ai = { frameId: value.ai.frameId, model: String(value.ai.model || '').slice(0, 150), confidence: Math.max(0, Math.min(1, Number(value.ai.confidence) || 0)), analyzedAt: String(value.ai.analyzedAt || '').slice(0, 60) }
  }
  return review
}
export function formalObjects(job) {
  const review = validateReview(job.review, job.result)
  const base = `${review.usage}/${review.topic}/${review.filename.replace(/\.mp4$/i, '')}-${job.id.slice(0, 8)}`
  return { download: `wallpaper/video/${base}.mp4`, preview: `preview/video/${base}.mp4`, thumbnail: `thumbnail/video/${base}.webp` }
}
export function safeMessage(error) {
  return String(error?.message || error || '处理失败').replace(/https?:\/\/\S+/g, '[远端地址]').replace(/(?:Bearer\s+|gh[pousr]_)[A-Za-z0-9_\-.]+/g, '[凭据]').slice(0, 1000)
}
