import { DAY, PART_SIZE, ensure, validateSource, validateReview, formalObjects, HttpError } from './domain.mjs'

export async function publicApi({ request, path, body, owner, store, storage, present, wake }) {
  const method = request.method
  if (path === '/video/jobs' && method === 'GET') return { jobs: await Promise.all((await store.list(owner, 'process')).map(job => present(job))) }
  if (path === '/video/jobs' && method === 'POST') {
    const source = validateSource(body)
    const key = String(body.idempotencyKey || source.sha256)
    ensure(key.length > 0 && key.length <= 200, '上传请求标识无效')
    const previous = await store.idempotent(owner, key)
    if (previous) {
      ensure(previous.sha256 === source.sha256 && previous.size === source.size, '上传标识已被其他文件使用', 409)
      return present(previous)
    }
    const id = crypto.randomUUID(); const sourceKey = `jobs/${id}/source`
    const uploadId = await storage.create(sourceKey, source.contentType)
    const task = { id, owner, status: 'uploading', ...source, upload: { key: sourceKey, uploadId, partSize: PART_SIZE } }
    try { return { _httpStatus: 201, ...await present(await store.insert(task, 'process', key)) } }
    catch (error) {
      await storage.abort(sourceKey, uploadId)
      const winner = await store.idempotent(owner, key)
      if (winner?.sha256 === source.sha256 && winner.size === source.size) return present(winner)
      throw error
    }
  }
  if (path === '/video/publications' && method === 'POST') {
    ensure(Array.isArray(body.jobs) && body.jobs.length > 0 && body.jobs.length <= 30, '请选择1至30个审核完成的视频')
    ensure(new Set(body.jobs.map(item => item.id)).size === body.jobs.length, '发布列表包含重复任务')
    const jobs = []
    for (const selected of body.jobs) {
      const job = await store.get(selected.id)
      ensure(job && job.owner === owner && job._kind === 'process', '视频任务不存在', 404)
      ensure(job.status === 'awaiting_review' && job.revision === selected.revision, '审核已更新或视频尚未准备好', 409)
      const review = validateReview(job.review, job.result)
      ensure(review.displayTitle, '请填写视频标题')
      ensure(review.description && review.keywords.length > 0, '请填写视频描述和至少一个关键词')
      const clean = { ...job, review, finalKeys: formalObjects(job) }
      for (const key of Object.keys(clean)) if (key.startsWith('_')) delete clean[key]
      jobs.push(clean)
    }
    const publication = await store.freeze({ id: crypto.randomUUID(), owner, status: 'queued', jobs }, jobs)
    wake('publish')
    return { _httpStatus: 201, ...await present(publication) }
  }
  const match = path.match(/^\/video\/(jobs|publications)\/([a-zA-Z0-9-]+)(.*)$/)
  ensure(match, '接口不存在', 404, 'NOT_FOUND')
  const [, type, id, action] = match
  let job = await store.get(id)
  ensure(job && job.owner === owner && job._kind === (type === 'jobs' ? 'process' : 'publish'), '任务不存在', 404, 'NOT_FOUND')
  if (!action && method === 'GET') return present(job)
  if (action === '/retry' && method === 'POST') {
    ensure(job.status === 'failed', '当前任务不能重试', 409)
    ensure(!job.materialsExpiredAt, '素材已过期，请重新上传视频', 409)
    ensure(type !== 'jobs' || !job.publicationId, '请重试原发布批次，无需重新处理视频', 409)
    ensure(!job._leaseToken, '原任务尚未结束', 409)
    job.status = 'queued'; delete job.error
    job = await store.save(job, job.revision)
    wake(job._kind)
    return present(job)
  }
  ensure(type === 'jobs', '接口不存在', 404)
  if (action.startsWith('/upload')) {
    if (action === '/upload/complete' && method === 'POST' && job.status !== 'uploading') return present(job)
    ensure(job.status === 'uploading', '当前任务已不需要上传', 409)
    const { key, uploadId } = job.upload
    if (action === '/upload' && method === 'GET') return { uploadId, partSize: PART_SIZE, parts: await storage.parts(key, uploadId) }
    if (action === '/upload/parts' && method === 'POST') {
      const max = Math.ceil(job.size / PART_SIZE)
      ensure(Array.isArray(body.partNumbers) && body.partNumbers.length > 0 && body.partNumbers.length <= 32 && body.partNumbers.every(n => Number.isInteger(n) && n >= 1 && n <= max), '上传分块编号无效')
      return { parts: await Promise.all(body.partNumbers.map(async partNumber => ({ partNumber, url: await storage.sign(key, 'PUT', false, { uploadId, partNumber }) }))) }
    }
    if (action === '/upload/complete' && method === 'POST') {
      const head = await storage.head(key)
      if (!head) {
        const actual = (await storage.parts(key, uploadId)).sort((a, b) => a.partNumber - b.partNumber)
        const supplied = body.parts
        const count = Math.ceil(job.size / PART_SIZE)
        ensure(Array.isArray(supplied) && actual.length === count && supplied.length === count, '分块尚未上传完成，请刷新续传', 409)
        for (let i = 0; i < count; i++) {
          const part = actual[i]
          ensure(part.partNumber === i + 1 && part.size === Math.min(PART_SIZE, job.size - i * PART_SIZE) && supplied.some(value => value.partNumber === part.partNumber && value.etag === part.etag), '上传分块校验失败，请重新检查', 409)
        }
        await storage.complete(key, uploadId, actual)
      }
      ensure((await storage.head(key))?.size === job.size, '上传文件大小校验失败', 409)
      job.status = 'queued'
      job = await store.save(job, job.revision)
      wake('process')
      return present(job)
    }
  }
  if (action === '/ai/claim' && method === 'POST') {
    ensure(['awaiting_ai', 'awaiting_review'].includes(job.status), '任务尚不能进行AI分析', 409)
    ensure(body.revision === job.revision, '任务已更新，请刷新', 409)
    ensure(!job._aiLeaseUntil || job._aiLeaseUntil < store.now(), '另一页面正在分析，请稍后重试', 409)
    job._aiLeaseToken = crypto.randomUUID(); job._aiLeaseUntil = store.now() + 10 * 60000
    job = await store.save(job, job.revision)
    return { leaseToken: job._aiLeaseToken, revision: job.revision }
  }
  if (action === '/ai/release' && method === 'POST') {
    if (body.leaseToken === job._aiLeaseToken) { delete job._aiLeaseToken; delete job._aiLeaseUntil; job = await store.save(job, job.revision) }
    return present(job)
  }
  if (action === '/review' && method === 'PATCH') {
    ensure(['awaiting_ai', 'awaiting_review'].includes(job.status), '当前任务不能修改审核结果', 409)
    ensure(body.revision === job.revision, '审核结果已更新，请刷新后重试', 409)
    if (body.leaseToken) ensure(body.leaseToken === job._aiLeaseToken && job._aiLeaseUntil > store.now(), 'AI分析租约已失效，请重新分析', 409)
    else if (body.review?.ai && JSON.stringify(body.review.ai) !== JSON.stringify(job.review?.ai)) throw new HttpError(409, 'AI_LEASE_REQUIRED', 'AI结果回写需要有效租约')
    job.review = validateReview(body.review, job.result)
    job.status = 'awaiting_review'; delete job._aiLeaseToken; delete job._aiLeaseUntil
    return present(await store.save(job, job.revision))
  }
  throw new HttpError(404, 'NOT_FOUND', '接口不存在')
}
