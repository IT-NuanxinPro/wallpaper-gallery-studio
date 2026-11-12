import { HttpError, ensure, safeMessage, formalObjects } from './domain.mjs'
import { TaskStore } from './store.mjs'
import { R2Storage } from './storage.mjs'
import { authorize, serviceAuthorized, dispatch, githubRequest } from './auth.mjs'
import { publicApi } from './public-api.mjs'
import { internalApi } from './internal-api.mjs'
import { maintainTasks } from './maintenance.mjs'

async function readBody(request) {
  if (!request.body) return {}
  const reader = request.body.getReader(); const chunks = []; let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > 262144) { await reader.cancel(); throw new HttpError(413, 'BODY_TOO_LARGE', '控制请求过大，请直接上传R2') }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { return size ? JSON.parse(new TextDecoder().decode(bytes)) : {} }
  catch { throw new HttpError(400, 'INVALID_JSON', '请求JSON格式无效') }
}
async function presentTask(record, storage, signResources = true) {
  const clean = structuredClone(record)
  for (const key of Object.keys(clean)) if (key.startsWith('_')) delete clean[key]
  if (clean.jobs) clean.jobs = await Promise.all(clean.jobs.map(job => presentTask(job, storage, false)))
  if (signResources && clean.result && clean.status === 'published' && clean.materialsCleanedAt) {
    const keys = clean.finalKeys || formalObjects(clean)
    clean.result.download.url = await storage.sign(keys.download, 'GET', true)
    clean.result.preview.url = await storage.sign(keys.preview, 'GET', true)
    clean.result.frames = clean.result.frames.filter(frame => frame.id === clean.review.selectedFrameId)
    for (const frame of clean.result.frames) {
      frame.url = await storage.sign(keys.thumbnail, 'GET', true)
      frame.thumbnailUrl = frame.url
    }
  } else if (signResources && clean.result && clean.status !== 'expired') {
    clean.result.download.url = await storage.sign(clean.result.download.key, 'GET')
    clean.result.preview.url = await storage.sign(clean.result.preview.key, 'GET')
    for (const frame of clean.result.frames) {
      frame.url = await storage.sign(frame.key, 'GET')
      frame.thumbnailUrl = await storage.sign(frame.thumbnailKey, 'GET')
    }
  }
  return clean
}
export function createVideoWorker({ githubFetch = fetch, storageFactory = env => new R2Storage(env), now = Date.now } = {}) {
  return {
    async fetch(request, env, ctx) {
      const origin = request.headers.get('Origin')
      const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' }
      if (origin && allowed.includes(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '600' })
      try {
        ensure(!origin || allowed.includes(origin), '工作台来源未授权', 403, 'ORIGIN_NOT_ALLOWED')
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
        const path = new URL(request.url).pathname.replace(/\/$/, '')
        if (path === '/health') return Response.json({ ok: true, service: 'video-ingest', configured: !!env.DB && !!env.VIDEO_STAGING }, { headers })
        ensure(env.DB, '视频任务数据库尚未配置', 503, 'NOT_CONFIGURED')
        const store = new TaskStore(env.DB, now); const storage = storageFactory(env)
        const present = (record, sign = true) => presentTask(record, storage, sign)
        const body = await readBody(request)
        let value
        if (path.startsWith('/internal/')) {
          ensure(serviceAuthorized(request, env), '内部服务未授权', 401, 'UNAUTHORIZED')
          value = await internalApi({ request, path, body, store, storage, present })
        } else {
          const owner = await authorize(request, env, githubFetch)
          if (path === '/video/topics' && request.method === 'GET') {
            const metadata = await githubRequest(env, `/repos/${env.GITHUB_OWNER}/${env.IMAGE_REPO}/contents/metadata/video.json`, {}, request.headers.get('Authorization').slice(7), githubFetch)
            ensure(metadata.encoding === 'base64' && typeof metadata.content === 'string', '视频分类元数据读取失败', 502)
            let parsed
            try { parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(metadata.content.replace(/\s/g, '')), char => char.charCodeAt(0)))) }
            catch { throw new HttpError(502, 'INVALID_CATALOG', '视频分类元数据格式无效') }
            const topics = [...new Set(Object.values(parsed.images || {}).map(item => item.topic || item.subcategory).filter(value => typeof value === 'string' && value.trim()))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
            return Response.json({ topics }, { headers })
          }
          const wake = kind => {
            const pending = dispatch(env, kind, githubFetch).catch(() => {})
            if (ctx?.waitUntil) ctx.waitUntil(pending)
          }
          value = await publicApi({ request, path, body, owner, store, storage, present, wake })
        }
        const status = value?._httpStatus || 200
        if (value) delete value._httpStatus
        return Response.json(value, { status, headers })
      } catch (error) {
        return Response.json({ error: { code: error.code || 'INTERNAL_ERROR', message: error.status ? error.message : safeMessage(error) } }, { status: error.status || 500, headers })
      }
    },
    async scheduled(controller, env, ctx) {
      const run = maintainTasks(env, { storage: storageFactory(env), now, githubFetch })
      if (ctx?.waitUntil) ctx.waitUntil(run)
      else await run
    }
  }
}
export default createVideoWorker()
