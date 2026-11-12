import test from 'node:test'
import assert from 'node:assert/strict'
import { TaskStore } from '../store.mjs'
import { maintainTasks } from '../maintenance.mjs'
import { createVideoWorker } from '../index.mjs'
import { memoryD1, fakeStorage } from './helpers.mjs'

test('a claim stores run identity atomically with the lease', async () => {
  const db = memoryD1(); const store = new TaskStore(db)
  await store.insert({ id: 'claim', owner: 'alice', status: 'queued' }, 'process')
  let mutationCount = 0
  const original = db.prepare
  db.prepare = sql => {
    if (sql.startsWith('UPDATE')) { mutationCount++; assert.equal(mutationCount, 1, 'claim must not need a second mutation to save runId') }
    return original(sql)
  }
  const { task } = await store.claim('process', '123')
  assert.equal(task.runId, '123')
  assert.equal((await store.get('claim')).runId, '123')
})

test('heartbeats preserve review revision and do not conflict with a completed phase', async () => {
  let now = 1000; const store = new TaskStore(memoryD1(), () => now)
  await store.insert({ id: 'heart', owner: 'alice', status: 'queued' }, 'process')
  const { task, leaseToken } = await store.claim('process', '321')
  now = 5000
  await store.heartbeat(task.id, leaseToken)
  assert.equal((await store.get(task.id)).revision, task.revision)
  const completed = await store.save({ ...task, status: 'awaiting_ai', _leaseToken: null, _leaseUntil: null }, task.revision, leaseToken)
  assert.equal(completed.status, 'awaiting_ai')
  assert.equal(completed._leaseToken, null)
})

test('failed publications cannot starve cleanup of old source files', async () => {
  const day = 86400000; let now = 1; const db = memoryD1(); const store = new TaskStore(db, () => now); const storage = fakeStorage()
  for (let i = 0; i < 101; i++) await store.insert({ id: `pub-${i}`, owner: 'alice', status: 'failed', jobs: [] }, 'publish')
  await store.insert({ id: 'old-upload', owner: 'alice', status: 'uploading', upload: { key: 'jobs/old-upload/source', uploadId: 'test' } }, 'process', 'fingerprint')
  storage.objects.set('jobs/old-upload/source', { size: 10 })
  now = 40 * day
  await maintainTasks({ DB: db }, { storage, now: () => now, githubFetch: async () => Response.json({ status: 'completed' }) })
  assert.equal((await store.get('old-upload')).status, 'expired')
  assert.equal(await storage.head('jobs/old-upload/source'), null)
  assert.equal(await store.idempotent('alice', 'fingerprint'), null, 'expired files can be uploaded again')
})

test('a failed multipart cleanup retries on the next sweep without losing its phase', async () => {
  let now = 1; const db = memoryD1(); const store = new TaskStore(db, () => now); const storage = fakeStorage()
  await store.insert({ id: 'abort', owner: 'alice', status: 'uploading', upload: { key: 'jobs/abort/source', uploadId: 'incomplete' } }, 'process')
  let attempts = 0
  storage.abort = async () => { if (++attempts === 1) throw new Error('network interruption') }
  now = 8 * 86400000
  await assert.rejects(maintainTasks({ DB: db }, { storage, now: () => now }), /network/)
  now += 10000
  await maintainTasks({ DB: db }, { storage, now: () => now })
  assert.equal(attempts, 2)
  assert.ok((await store.get('abort')).materialsCleanedAt)
})

test('publication cleanup preserves a batch retried after the cleanup snapshot', async () => {
  const day = 86400000; let now = 1
  const db = memoryD1(); const store = new TaskStore(db, () => now); const storage = fakeStorage()
  await store.insert({ id: 'retry-job', owner: 'alice', status: 'publishing', publicationId: 'retry-pub' }, 'process')
  await store.insert({ id: 'retry-pub', owner: 'alice', status: 'failed', jobs: [{ id: 'retry-job' }] }, 'publish')
  await db.prepare('INSERT INTO video_publication_jobs(publication_id,job_id,review_revision) VALUES(?,?,?)').bind('retry-pub', 'retry-job', 1).run()
  now = 100 * day
  const env = { DB: db, GITHUB_OWNER: 'owner', IMAGE_REPO: 'images', WORKFLOW_REPO: 'workflow', GITHUB_DISPATCH_TOKEN: 'test' }
  const githubFetch = async url => url.endsWith('/dispatches')
    ? new Response(null, { status: 204 })
    : Response.json(url.endsWith('/user') ? { login: 'alice' } : { permissions: { push: true } })
  const worker = createVideoWorker({ storageFactory: () => storage, now: () => now, githubFetch })
  const originalBatch = db.batch.bind(db)
  let retried = false
  db.batch = async statements => {
    if (!retried) {
      // 清理已读取 failed 快照，但过期事务尚未执行时，用户成功重试。
      retried = true
      const response = await worker.fetch(new Request('https://api.example/video/publications/retry-pub/retry', {
        method: 'POST', headers: { Authorization: 'Bearer test' }
      }), env, { waitUntil() {} })
      assert.equal(response.status, 200)
      assert.equal((await response.json()).status, 'queued')
    }
    return originalBatch(statements)
  }

  await maintainTasks(env, { storage, now: () => now, githubFetch })
  assert.equal(retried, true)
  assert.equal((await store.get('retry-pub'))?.status, 'queued', 'cleanup must preserve the successfully retried publication')
  assert.equal((await store.get('retry-job')).status, 'publishing')
  assert.equal((await db.prepare('SELECT * FROM video_publication_jobs WHERE publication_id=?').bind('retry-pub').all()).results.length, 1, 'cleanup must preserve the frozen job association')
})
