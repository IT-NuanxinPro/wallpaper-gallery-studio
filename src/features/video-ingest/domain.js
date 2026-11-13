import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export const MAX_VIDEO_SIZE = 250000000
export const VIDEO_PART_SIZE = 8388608
export const VIDEO_USAGES = [
  { value: 'desktop', label: '电脑壁纸' },
  { value: 'mobile', label: '手机壁纸' },
  { value: 'social-cover', label: '社交封面' }
]
export const JOB_STATUS = {
  uploading: '待上传',
  queued: '等待处理',
  processing: '云端处理中',
  awaiting_ai: '待分析',
  awaiting_review: '待审核',
  publishing: '发布中',
  published: '已发布',
  failed: '失败',
  expired: '已过期'
}
export function abortError() {
  const error = new Error('上传已暂停，可重选同一文件继续')
  error.name = 'AbortError'
  return error
}

export function validateVideoFile(file) {
  if (!file?.size) throw new Error('不能上传空视频')
  if (file.size > MAX_VIDEO_SIZE) throw new Error('单个视频不能超过 250 MB')
  if (!/\.(mp4|avi|flv|mov|m4v|webm|mkv)$/i.test(file.name || '')) {
    throw new Error('请选择 MP4、AVI、FLV、MOV、M4V、WebM 或 MKV 视频')
  }
  if (!validSegment(file.name)) throw new Error('源文件名过长或包含非法路径字符，请重命名后上传')
}

function validSegment(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 150 &&
    !/[/\\%]|^\.{1,2}$/.test(value) &&
    ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
}

// 始终只读一个有界分块，不在内存或 IndexedDB 中保留整个视频。
export async function hashVideoFile(
  file,
  { chunkSize = VIDEO_PART_SIZE, signal, onProgress } = {}
) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new Error('无效的散列分块大小')
  const hash = sha256.create()
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    if (signal?.aborted) throw abortError()
    const end = Math.min(offset + chunkSize, file.size)
    hash.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()))
    onProgress?.(end, file.size)
    // 让出主线程，保持大文件散列时的暂停按钮可操作。
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  if (signal?.aborted) throw abortError()
  return bytesToHex(hash.digest())
}

export function createReviewDraft(job) {
  const defaults = {
    selectedFrameId: job.result?.defaultFrameId || job.result?.frames?.[0]?.id || '',
    usage: 'desktop',
    topic: '',
    filename: `${(job.filename || '视频').replace(/\.[^.]+$/, '')}.mp4`,
    displayTitle: '',
    description: '',
    keywords: []
  }
  const draft = { ...defaults, ...job.review }
  if (canReview(job)) draft.usage = 'desktop'
  return JSON.parse(JSON.stringify(draft))
}

export function validateReview(review, frames = []) {
  const errors = []
  if (!frames.some(frame => frame.id === review?.selectedFrameId))
    errors.push('请选择有效的候选封面')
  if (!VIDEO_USAGES.some(usage => usage.value === review?.usage)) errors.push('请选择视频用途')
  if (!validSegment(review?.topic))
    errors.push('请填写有效的主题分类（不超过150字，不能含路径分隔符或%）')
  if (!validSegment(review?.filename) || !/\.mp4$/i.test(review.filename)) {
    errors.push('文件名须以 .mp4 结尾，不超过150字且不能含路径分隔符或%')
  }
  if (!review?.displayTitle?.trim()) errors.push('请填写展示标题')
  if (!review?.description?.trim()) errors.push('请填写视频描述')
  if (
    !Array.isArray(review?.keywords) ||
    !review.keywords.some(keyword => typeof keyword === 'string' && keyword.trim())
  ) {
    errors.push('请填写至少一个关键词')
  }
  return errors
}

export function canReview(job) {
  return ['awaiting_ai', 'awaiting_review'].includes(job?.status)
}

export function canPublish(job) {
  return (
    job?.status === 'awaiting_review' &&
    job.review?.usage === 'desktop' &&
    validateReview(job.review, job.result?.frames).length === 0
  )
}

export function formatBytes(size = 0) {
  return size < 1000000 ? `${(size / 1000).toFixed(0)} KB` : `${(size / 1000000).toFixed(1)} MB`
}

export function errorMessage(error) {
  if (!error) return ''
  return typeof error === 'string' ? error : error.message || '请求失败，请重试'
}
