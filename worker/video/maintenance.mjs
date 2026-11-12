import { DAY } from './domain.mjs'
import { TaskStore } from './store.mjs'
import { githubRequest, dispatch } from './auth.mjs'

export async function maintainTasks(env, { storage, now = Date.now, githubFetch = fetch }) {
  const store = new TaskStore(env.DB, now)
  for (const task of await store.stale()) {
    // 租约到期本身不足以释放执行权，先确认旧 Runner 已经结束。
    if (!/^\d+$/.test(task.runId || '')) continue
    let run
    try { run = await githubRequest(env, `/repos/${env.GITHUB_OWNER}/${env.WORKFLOW_REPO}/actions/runs/${task.runId}`, {}, undefined, githubFetch) }
    catch { continue }
    if (run.status !== 'completed') continue
    task.status = 'failed'; task._leaseToken = null; task._leaseUntil = null
    task.error = { stage: task._kind === 'process' ? 'processing' : 'publication', message: '执行器已结束但未完成回报，可以从此阶段重试', at: new Date(now()).toISOString() }
    try { await store.save(task, task.revision) } catch { /* 心跳或其他请求已更新，交给下轮补扫。 */ }
  }
  for (const publication of await store.agedPublications()) {
    if (publication.status === 'failed' && !publication.materialsExpiredAt) await store.expirePublication(publication)
    if (now() - new Date(publication.createdAt).getTime() > 90 * DAY) {
      const latest = await store.get(publication.id)
      if (!latest || !['failed', 'published'].includes(latest.status) || latest._leaseToken) continue
      await env.DB.batch([
        env.DB.prepare("DELETE FROM video_publication_jobs WHERE publication_id=? AND EXISTS(SELECT 1 FROM video_tasks WHERE id=? AND revision=? AND status IN('failed','published') AND lease_token IS NULL)").bind(latest.id, latest.id, latest.revision),
        env.DB.prepare("DELETE FROM video_tasks WHERE id=? AND revision=? AND status IN('failed','published') AND lease_token IS NULL").bind(latest.id, latest.revision)
      ])
    }
  }
  for (let task of await store.aged()) {
    if (task._leaseToken || ['publishing', 'queued', 'processing', 'deploying'].includes(task.status)) continue
    const age = now() - new Date(task.updatedAt).getTime()
    const retention = ['uploading', 'published'].includes(task.status) ? 7 * DAY : 30 * DAY
    if ((age >= retention || task.status === 'expired') && !task.materialsCleanedAt) {
      if (task.status === 'uploading') task._cleanupAbortRequired = true
      if (task.status !== 'published') task.status = 'expired'
      try { task = await store.save(task, task.revision) } catch { continue }
      if (task._cleanupAbortRequired) await storage.abort(task.upload.key, task.upload.uploadId)
      await storage.removePrefix(`jobs/${task.id}/`)
      task.materialsCleanedAt = new Date(now()).toISOString()
      delete task._cleanupAbortRequired
      task = await store.save(task, task.revision)
    }
    if (now() - new Date(task.createdAt).getTime() > 90 * DAY && task.materialsCleanedAt) {
      // 只删除任务记录和关联，永不删除公开桶内容。
      await env.DB.batch([
        env.DB.prepare('DELETE FROM video_publication_jobs WHERE job_id=?').bind(task.id),
        env.DB.prepare('DELETE FROM video_tasks WHERE id=? AND revision=?').bind(task.id, task.revision)
      ])
    }
  }
  for (const kind of ['process', 'publish']) {
    const queued = await env.DB.prepare("SELECT id FROM video_tasks WHERE kind=? AND status='queued' LIMIT 1").bind(kind).first()
    if (queued) { try { await dispatch(env, kind, githubFetch) } catch { /* 持久任务仍在队列，下轮补触发。 */ } }
  }
}
