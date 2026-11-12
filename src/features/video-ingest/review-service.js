import { compressImage, IMAGE_CONFIG } from '@/services/ai/core/image-processor'

export async function frameToBase64(
  frame,
  { fetchImpl = (...args) => fetch(...args), compress = compressImage } = {}
) {
  const url = frame.url || frame.thumbnailUrl
  if (!url) throw new Error('封面地址已失效，请刷新任务')
  // 资源使用短期签名访问，不把业务 token 发送给对象存储。
  const response = await fetchImpl(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' })
  if (!response.ok) throw new Error('封面下载失败，请刷新任务后重试')
  const blob = await response.blob()
  if (blob.size > 20000000) throw new Error('封面图片过大，无法分析')
  return compress(blob, IMAGE_CONFIG)
}

export function chooseVideoTopic(analysis, originalTopic, topics = []) {
  const normalize = value =>
    typeof value === 'string' ? value.trim().normalize('NFC').toLowerCase() : ''
  for (const suggestion of [analysis.third, analysis.secondary]) {
    const match = topics.find(topic => normalize(topic) === normalize(suggestion))
    if (match) return match
  }
  if (originalTopic?.trim()) return originalTopic
  return topics.length ? '' : analysis.secondary || analysis.third || ''
}

export async function analyzeVideoFrame({
  api,
  job,
  review,
  analyzeImage,
  modelKey,
  providerType,
  credentials,
  topics = [],
  frameToBase64: readFrame = frameToBase64
}) {
  const frame = job.result?.frames?.find(candidate => candidate.id === review.selectedFrameId)
  if (!frame) throw new Error('请选择有效封面后再分析')
  const lease = await api.claimAi(job.id, job.revision)
  let primaryError
  let updated
  try {
    const imageBase64 = await readFrame(frame)
    const analysis = await analyzeImage({
      imageBase64,
      series: review.usage === 'mobile' ? 'mobile' : 'desktop',
      providerType,
      credentials,
      modelKey
    })
    const filename = analysis.filenameSuggestions?.[0] || review.filename
    const nextReview = {
      ...review,
      topic: chooseVideoTopic(analysis, review.topic, topics),
      filename: `${filename
        .replace(/\.[^.]+$/, '')
        .replace(/[/\\%]/g, '-')
        .slice(0, 146)}.mp4`,
      displayTitle: analysis.displayTitle || review.displayTitle,
      description: analysis.description || review.description,
      keywords: analysis.keywords?.length ? analysis.keywords : review.keywords,
      ai: {
        frameId: frame.id,
        model: modelKey,
        confidence: analysis.confidence || 0,
        analyzedAt: new Date().toISOString()
      }
    }
    updated = await api.saveReview(job.id, {
      revision: lease.revision,
      review: nextReview,
      leaseToken: lease.leaseToken
    })
  } catch (error) {
    primaryError = error
  } finally {
    try {
      await api.releaseAi(job.id, lease.leaseToken)
    } catch (error) {
      // 成功写回通常已清除租约；真正的释放失败交由界面提示并刷新服务端状态。
      if (!primaryError && ![404, 409].includes(error.status)) primaryError = error
    }
  }
  if (primaryError) throw primaryError
  return updated
}
