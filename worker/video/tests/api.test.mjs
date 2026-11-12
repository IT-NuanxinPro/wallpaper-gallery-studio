import test from 'node:test'
import assert from 'node:assert/strict'
import { createVideoWorker } from '../index.mjs'
import { TaskStore } from '../store.mjs'
import { memoryD1, fakeStorage } from './helpers.mjs'

function fixture() {
  const storage = fakeStorage()
  const env = { DB: memoryD1(), GITHUB_OWNER: 'owner', IMAGE_REPO: 'images', WORKFLOW_REPO: 'workflow', GITHUB_DISPATCH_TOKEN: 'server', VIDEO_SERVICE_TOKEN: 'internal-test', ALLOWED_ORIGINS: 'https://studio.example' }
  const worker = createVideoWorker({ storageFactory: () => storage, githubFetch: async url => Response.json(url.endsWith('/user') ? { login: 'alice' } : url.endsWith('/images') ? { permissions: { push: true } } : { ok: true }) })
  const call = async (path, body, method = body === undefined ? 'GET' : 'POST', internal = false) => {
    const response = await worker.fetch(new Request(`https://api.example${path}`, { method, headers: { ...(internal ? { 'X-Video-Service-Token': 'internal-test' } : { Authorization: 'Bearer user-test' }), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, { waitUntil() {} })
    return { status: response.status, body: await response.json() }
  }
  return { worker, env, storage, call, store: new TaskStore(env.DB) }
}
const source = { filename: '发光-宝可梦.mp4', size: 42, sha256: 'a'.repeat(64), contentType: 'video/mp4', idempotencyKey: 'source-1' }

test('server checks repository permission independently and rejects foreign CORS origins', async () => {
  const f = fixture()
  const denied = createVideoWorker({ githubFetch: async url => Response.json(url.endsWith('/user') ? { login: 'alice' } : { permissions: { pull: true } }), storageFactory: () => f.storage })
  const response = await denied.fetch(new Request('https://api.example/video/jobs', { headers: { Authorization: 'Bearer user' } }), f.env)
  assert.equal(response.status, 403)
  const cors = await f.worker.fetch(new Request('https://api.example/video/jobs', { headers: { Origin: 'https://evil.example', Authorization: 'Bearer user' } }), f.env)
  assert.equal(cors.status, 403)
})

test('upload completion checks real parts and size; repeated create preserves one job', async () => {
  const f = fixture()
  const created = await f.call('/video/jobs', source)
  assert.equal(created.status, 201)
  const id = created.body.id
  assert.equal((await f.call('/video/jobs', source)).body.id, id)
  assert.equal((await f.call(`/video/jobs/${id}/upload/complete`, { parts: [{ partNumber: 1, etag: 'fake' }] })).status, 409)
  f.storage.sessions.set(`jobs/${id}/source`, [{ partNumber: 1, etag: 'real', size: 42 }])
  assert.equal((await f.call(`/video/jobs/${id}/upload/complete`, { parts: [{ partNumber: 1, etag: 'real' }] })).body.status, 'queued')
  assert.equal((await f.call(`/video/jobs/${id}/upload/complete`, { parts: [] })).body.status, 'queued')
})

test('processing, review freeze and deployment failure retry preserve completed work', async () => {
  const f = fixture()
  const { body: job } = await f.call('/video/jobs', source)
  f.storage.sessions.set(`jobs/${job.id}/source`, [{ partNumber: 1, etag: 'real', size: 42 }])
  await f.call(`/video/jobs/${job.id}/upload/complete`, { parts: [{ partNumber: 1, etag: 'real' }] })
  const claim = (await f.call('/internal/video/claim', { kind: 'process', runId: '100' }, 'POST', true)).body
  assert.equal(claim.task.id, job.id)
  assert.equal((await f.call('/internal/video/claim', { kind: 'process', runId: '101' }, 'POST', true)).body.task, null)
  const base = `jobs/${job.id}/`
  const asset = (name, size) => ({ key: base + name, size, contentType: 'video/mp4', sha256: 'b'.repeat(64) })
  const result = { download: asset('download.mp4', 42), preview: asset('preview.mp4', 21), frames: [{ id: 'frame-1', key: base + 'frame.jpg', thumbnailKey: base + 'frame.webp', timestamp: 1, score: 2 }], defaultFrameId: 'frame-1', metadata: { width: 3840, height: 2160, duration: 11, size: 42, format: 'mp4' } }
  for (const a of [result.download, result.preview]) f.storage.objects.set(a.key, { size: a.size, httpMetadata: { contentType: a.contentType } })
  f.storage.objects.set(base + 'frame.jpg', { size: 10 }); f.storage.objects.set(base + 'frame.webp', { size: 5 })
  const processed = await f.call(`/internal/video/jobs/${job.id}/complete`, { leaseToken: claim.leaseToken, result }, 'POST', true)
  assert.equal(processed.body.status, 'awaiting_ai')
  const recovered = (await f.call('/video/jobs')).body.jobs[0]
  assert.match(recovered.result.frames[0].url, /^https:\/\/storage\.example\//)
  assert.match(recovered.result.preview.url, /^https:\/\/storage\.example\//)
  const review = { selectedFrameId: 'frame-1', usage: 'desktop', topic: '动漫', filename: '发光宝可梦.mp4', displayTitle: '发光宝可梦', keywords: ['宝可梦'], description: '测试' }
  const reviewed = await f.call(`/video/jobs/${job.id}/review`, { revision: processed.body.revision, review }, 'PATCH')
  assert.equal(reviewed.body.status, 'awaiting_review')
  const frozen = await f.call('/video/publications', { jobs: [{ id: job.id, revision: reviewed.body.revision }] })
  assert.equal(frozen.status, 201)
  assert.match(frozen.body.jobs[0].finalKeys.download, /^wallpaper\/video\/desktop\/动漫\//)
  assert.equal((await f.call(`/video/jobs/${job.id}/review`, { revision: reviewed.body.revision, review }, 'PATCH')).status, 409)
  const publisher = (await f.call('/internal/video/claim', { kind: 'publish', runId: '200' }, 'POST', true)).body
  const pubId = publisher.task.id
  assert.equal((await f.call(`/internal/video/publications/${pubId}/complete`, { leaseToken: publisher.leaseToken, metadataCommitSha: 'abc123', dataSha: 'new123', deploymentId: 'pages123' }, 'POST', true)).status, 409)
  const keys = publisher.task.jobs[0].finalKeys
  const formal = [{ key: keys.download, size: 42, contentType: 'video/mp4' }, { key: keys.preview, size: 21, contentType: 'video/mp4' }, { key: keys.thumbnail, size: 5, contentType: 'image/webp' }]
  for (const asset of formal) f.storage.objects.set(asset.key, { size: asset.size, httpMetadata: { contentType: asset.contentType } })
  assert.equal((await f.call(`/internal/video/publications/${pubId}/verify`, { leaseToken: publisher.leaseToken, objects: formal }, 'POST', true)).status, 200)
  await f.call(`/internal/video/publications/${pubId}/progress`, { leaseToken: publisher.leaseToken, status: 'deploying', metadataCommitSha: 'abc123' }, 'POST', true)
  await f.call(`/internal/video/publications/${pubId}/fail`, { leaseToken: publisher.leaseToken, stage: 'deployment', message: 'timeout' }, 'POST', true)
  const retry = await f.call(`/video/publications/${pubId}/retry`, {})
  assert.equal(retry.body.status, 'queued')
  assert.equal(retry.body.metadataCommitSha, 'abc123')
  assert.equal((await f.store.get(job.id)).status, 'publishing')
  const second = (await f.call('/internal/video/claim', { kind: 'publish', runId: '201' }, 'POST', true)).body
  const published = await f.call(`/internal/video/publications/${pubId}/complete`, { leaseToken: second.leaseToken, metadataCommitSha: 'abc123', dataSha: 'new123', deploymentId: 'pages123' }, 'POST', true)
  assert.equal(published.body.status, 'published')
  assert.equal((await f.store.get(job.id)).status, 'published')
})

test('a human edit invalidates an in-flight AI result instead of losing the edit', async () => {
  const f = fixture()
  const result = { frames: [{ id: 'f', key: 'jobs/ai/f.jpg', thumbnailKey: 'jobs/ai/f.webp' }], download: { key: 'jobs/ai/d.mp4' }, preview: { key: 'jobs/ai/p.mp4' } }
  const review = { selectedFrameId: 'f', usage: 'desktop', topic: '动漫', filename: '宝可梦.mp4', displayTitle: '人工标题', description: '', keywords: [] }
  const job = await f.store.insert({ id: 'ai', owner: 'alice', status: 'awaiting_ai', result, review }, 'process')
  const lease = (await f.call('/video/jobs/ai/ai/claim', { revision: job.revision })).body
  const human = await f.call('/video/jobs/ai/review', { revision: lease.revision, review }, 'PATCH')
  assert.equal(human.status, 200)
  const stale = await f.call('/video/jobs/ai/review', { revision: lease.revision, leaseToken: lease.leaseToken, review: { ...review, displayTitle: '过期AI标题', ai: { frameId: 'f', model: 'test' } } }, 'PATCH')
  assert.equal(stale.status, 409)
  assert.equal((await f.store.get('ai')).review.displayTitle, '人工标题')
})

test('batch review version conflict freezes none of the jobs', async () => {
  const f = fixture()
  const a = await f.store.insert({ id: 'a', owner: 'alice', status: 'awaiting_review' }, 'process')
  const b = await f.store.insert({ id: 'b', owner: 'alice', status: 'awaiting_review' }, 'process')
  await f.store.save({ ...b, status: 'failed' }, b.revision)
  await assert.rejects(f.store.freeze({ id: 'pub', owner: 'alice', jobs: [a, b] }, [a, b]), /审核/)
  assert.equal((await f.store.get('a')).status, 'awaiting_review')
  assert.equal(await f.store.get('pub'), null)
})

test('published tasks still preview their formal assets after private cleanup', async () => {
  const f = fixture()
  const result = { frames: [{ id: 'f', key: 'jobs/done/f.jpg', thumbnailKey: 'jobs/done/f.webp' }], download: { key: 'jobs/done/d.mp4' }, preview: { key: 'jobs/done/p.mp4' } }
  const review = { selectedFrameId: 'f', usage: 'desktop', topic: '动漫', filename: '宝可梦.mp4', displayTitle: '宝可梦', description: '', keywords: [] }
  await f.store.insert({ id: 'done', owner: 'alice', status: 'published', result, review, materialsCleanedAt: new Date().toISOString() }, 'process')
  const { body } = await f.call('/video/jobs/done')
  assert.match(body.result.preview.url, /\/public\/preview\/video\//)
  assert.match(body.result.frames[0].url, /\/public\/thumbnail\/video\//)
})

test('direct API publication cannot bypass the required review fields', async () => {
  const f = fixture()
  const result = { frames: [{ id: 'f', key: 'jobs/incomplete/f.jpg', thumbnailKey: 'jobs/incomplete/f.webp' }] }
  const review = { selectedFrameId: 'f', usage: 'desktop', topic: '动漫', filename: '宝可梦.mp4', displayTitle: '只有标题', description: '', keywords: [] }
  const job = await f.store.insert({ id: 'incomplete', owner: 'alice', status: 'awaiting_review', result, review }, 'process')
  const response = await f.call('/video/publications', { jobs: [{ id: job.id, revision: job.revision }] })
  assert.equal(response.status, 400)
  assert.equal((await f.store.get(job.id)).status, 'awaiting_review')
})

test('topics are read from the current remote video metadata without a media tree', async () => {
  const f = fixture()
  const metadata = { images: { a: { topic: '动漫' }, b: { subcategory: '风景' }, c: { topic: '动漫' } } }
  const worker = createVideoWorker({ storageFactory: () => f.storage, githubFetch: async url => Response.json(url.endsWith('/user') ? { login: 'alice' } : url.includes('/contents/metadata/video.json') ? { encoding: 'base64', content: Buffer.from(JSON.stringify(metadata)).toString('base64') } : { permissions: { push: true } }) })
  const response = await worker.fetch(new Request('https://api.example/video/topics', { headers: { Authorization: 'Bearer user' } }), f.env)
  assert.equal(response.status, 200)
  assert.deepEqual(new Set((await response.json()).topics), new Set(['动漫', '风景']))
})
