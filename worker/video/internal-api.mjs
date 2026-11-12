import { ensure, formalObjects, privateKey, validateResult, safeMessage, HttpError } from './domain.mjs'

async function verifyObject(storage, descriptor, publicBucket = false) {
  const actual = await storage.head(descriptor.key, publicBucket)
  ensure(actual && actual.size > 0 && (!descriptor.size || actual.size === descriptor.size), '处理产物不存在或大小不一致', 409, 'OBJECT_VERIFICATION')
  if (descriptor.contentType) ensure(actual.httpMetadata?.contentType === descriptor.contentType, '处理产物媒体类型不一致', 409, 'OBJECT_VERIFICATION')
}
function publicationObjects(task) {
  return task.jobs.flatMap(job => {
    const keys = job.finalKeys || formalObjects(job)
    const frame = job.result.frames.find(frame => frame.id === job.review.selectedFrameId)
    return [
      { key: keys.download, sourceKey: job.result.download.key, size: job.result.download.size, contentType: 'video/mp4' },
      { key: keys.preview, sourceKey: job.result.preview.key, size: job.result.preview.size, contentType: 'video/mp4' },
      { key: keys.thumbnail, sourceKey: frame.thumbnailKey, size: frame.thumbnailSize, contentType: 'image/webp' }
    ]
  })
}
export async function internalApi({ request, path, body, store, storage, present }) {
  if (path === '/internal/video/claim' && request.method === 'POST') {
    ensure(['process', 'publish'].includes(body.kind) && /^\d{1,30}$/.test(String(body.runId)), '任务类型或Actions运行标识无效')
    const claim = await store.claim(body.kind, String(body.runId))
    if (!claim) return { task: null }
    return { task: await present(claim.task, false), leaseToken: claim.leaseToken }
  }
  const match = path.match(/^\/internal\/video\/(jobs|publications)\/([a-zA-Z0-9-]+)\/(source|objects|heartbeat|complete|checkpoint|progress|fail|verify|mirrors)$/)
  ensure(match, '内部接口不存在', 404)
  const [, type, id, action] = match
  let task = await store.get(id)
  ensure(task && task._kind === (type === 'jobs' ? 'process' : 'publish'), '任务不存在', 404)
  const lease = body.leaseToken || new URL(request.url).searchParams.get('leaseToken')
  ensure(task._leaseToken && task._leaseToken === lease && task._leaseUntil > store.now(), '任务租约失效', 409, 'LEASE_LOST')
  if (action === 'heartbeat' && request.method === 'POST') {
    await store.heartbeat(task.id, lease)
    return { ok: true }
  }
  if (action === 'source' && type === 'jobs' && request.method === 'GET') {
    const response = { url: await storage.sign(task.upload.key, 'GET') }
    if (task._checkpoint) {
      const result = task._checkpoint
      const assets = [result.download, result.preview, ...result.frames.flatMap(frame => [{ key: frame.key, size: frame.size }, { key: frame.thumbnailKey, size: frame.thumbnailSize }])]
      const objects = []
      for (const asset of assets) {
        const actual = await storage.head(asset.key)
        if (actual && asset.size && actual.size === asset.size) objects.push({ key: asset.key, size: asset.size, url: await storage.sign(asset.key, 'GET') })
      }
      response.checkpoint = { result, objects }
    }
    return response
  }
  ensure(request.method === 'POST', '请求方法无效', 405)
  if (action === 'checkpoint' && type === 'jobs') {
    task._checkpoint = validateResult(body.result, task.id)
    await store.save(task, task.revision, lease)
    return { ok: true }
  }
  if (action === 'objects' && type === 'jobs') {
    ensure(Array.isArray(body.objects) && body.objects.length > 0 && body.objects.length <= 20, '处理资源列表无效')
    return { objects: await Promise.all(body.objects.map(async asset => {
      privateKey(asset.key, task.id)
      ensure(asset.key !== task.upload.key && /^(video\/mp4|image\/(jpeg|webp|png))$/.test(asset.contentType), '不能覆盖源文件或上传未知媒体')
      return { key: asset.key, url: await storage.sign(asset.key, 'PUT') }
    })) }
  }
  if (action === 'complete' && type === 'jobs') {
    task.result = validateResult(body.result, task.id)
    await Promise.all([verifyObject(storage, task.result.download), verifyObject(storage, task.result.preview), ...task.result.frames.flatMap(frame => [verifyObject(storage, { key: frame.key, size: frame.size }), verifyObject(storage, { key: frame.thumbnailKey, size: frame.thumbnailSize })])])
    task.status = 'awaiting_ai'
    task.review = { selectedFrameId: task.result.defaultFrameId, usage: task.result.metadata.height > task.result.metadata.width ? 'mobile' : 'desktop', topic: '通用', filename: task.filename.replace(/\.[^.]+$/, '') + '.mp4', displayTitle: '', description: '', keywords: [] }
    task._leaseToken = null; task._leaseUntil = null; delete task.error
    return present(await store.save(task, task.revision, lease))
  }
  if (action === 'objects' && type === 'publications') {
    const allowed = publicationObjects(task)
    ensure(Array.isArray(body.objects) && body.objects.length > 0 && body.objects.length <= 90, '正式资源列表无效')
    return { objects: await Promise.all(body.objects.map(async asset => {
      const expected = allowed.find(item => item.key === asset.key && item.sourceKey === asset.sourceKey)
      ensure(expected && asset.contentType === expected.contentType && (!expected.size || expected.size === asset.size), '正式资源不匹配冻结审核版本', 403)
      return { key: expected.key, sourceKey: expected.sourceKey, sourceUrl: await storage.sign(expected.sourceKey, 'GET'), url: await storage.sign(expected.key, 'PUT', true) }
    })) }
  }
  if (action === 'verify' && type === 'publications') {
    const expected = publicationObjects(task)
    ensure(Array.isArray(body.objects) && body.objects.length === expected.length && new Set(body.objects.map(object => object.key)).size === expected.length, '正式资源验收清单不完整')
    for (const asset of body.objects) {
      const match = expected.find(object => object.key === asset.key)
      ensure(match && match.contentType === asset.contentType && (!match.size || match.size === asset.size), '正式资源验收信息不符')
      await verifyObject(storage, asset, true)
    }
    task.verifiedObjectsAt = new Date(store.now()).toISOString()
    await store.save(task, task.revision, lease)
    return { ok: true }
  }
  if (action === 'mirrors' && type === 'publications') {
    ensure(Array.isArray(body.objects) && body.objects.length > 0 && body.objects.length <= 100 && body.objects.every(asset => /^data\/video(?:\.json|\/(?:[^/.][^/]*\/)*[^/]+\.json)$/.test(asset.key) && !asset.key.includes('..') && !/[\\%\x00-\x1f]/.test(asset.key) && asset.contentType === 'application/json'), '只允许上传视频JSON镜像')
    return { objects: await Promise.all(body.objects.map(async asset => ({ key: asset.key, url: await storage.sign(asset.key, 'PUT', true) }))) }
  }
  if (action === 'progress' && type === 'publications') {
    ensure(['publishing', 'deploying'].includes(body.status), '发布阶段无效')
    task.status = body.status
    if (body.metadataCommitSha) task.metadataCommitSha = String(body.metadataCommitSha).slice(0, 100)
    if (body.deploymentId) task.deploymentId = String(body.deploymentId).slice(0, 100)
    if (body.deploymentRunId) task.deploymentRunId = String(body.deploymentRunId).slice(0, 100)
    return present(await store.save(task, task.revision, lease), false)
  }
  if (action === 'complete' && type === 'publications') {
    ensure(task.verifiedObjectsAt, '正式资源尚未验收，不能标记已发布', 409)
    ensure(body.metadataCommitSha && body.deploymentId && body.dataSha, '缺少实际部署结果，不能标记已发布')
    Object.assign(task, { status: 'published', metadataCommitSha: String(body.metadataCommitSha), deploymentId: String(body.deploymentId), dataSha: String(body.dataSha) })
    return present(await store.finishPublication(task), false)
  }
  if (action === 'fail') {
    task.status = 'failed'; task.error = { stage: String(body.stage || 'processing').slice(0, 60), message: safeMessage(body.message), at: new Date(store.now()).toISOString() }
    task._leaseToken = null; task._leaseUntil = null
    return present(await store.save(task, task.revision, lease), false)
  }
  throw new HttpError(404, 'NOT_FOUND', '内部接口不存在')
}
