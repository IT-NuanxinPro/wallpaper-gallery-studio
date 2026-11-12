import { HttpError } from './domain.mjs'

function hydrate(row) {
  if (!row) return null
  return { ...JSON.parse(row.data_json), id: row.id, owner: row.owner, status: row.status, revision: row.revision, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), _kind: row.kind, _leaseToken: row.lease_token, _leaseUntil: row.lease_until }
}
export class TaskStore {
  constructor(db, now = Date.now) { this.db = db; this.now = now }
  async get(id) { return hydrate(await this.db.prepare('SELECT * FROM video_tasks WHERE id=?').bind(id).first()) }
  async list(owner, kind) {
    const { results } = await this.db.prepare('SELECT * FROM video_tasks WHERE owner=? AND kind=? ORDER BY created_at DESC LIMIT 200').bind(owner, kind).all()
    return results.map(hydrate)
  }
  async idempotent(owner, key) { return hydrate(await this.db.prepare("SELECT * FROM video_tasks WHERE owner=? AND kind='process' AND idempotency_key=?").bind(owner, key).first()) }
  async insert(record, kind, key = null) {
    const now = this.now()
    await this.db.prepare('INSERT INTO video_tasks (id,kind,owner,status,revision,idempotency_key,created_at,updated_at,data_json) VALUES(?,?,?,?,1,?,?,?,?)').bind(record.id, kind, record.owner, record.status, key, now, now, JSON.stringify(record)).run()
    return this.get(record.id)
  }
  async save(record, expectedRevision, leaseToken) {
    const sql = `UPDATE video_tasks SET status=?,revision=revision+1,updated_at=?,data_json=?,lease_token=?,lease_until=CASE WHEN ? IS NULL THEN NULL ELSE max(coalesce(lease_until,0),?) END,idempotency_key=CASE WHEN ?='expired' THEN NULL ELSE idempotency_key END WHERE id=? AND revision=?${leaseToken ? ' AND lease_token=?' : ''}`
    const args = [record.status, this.now(), JSON.stringify(record), record._leaseToken || null, record._leaseToken || null, record._leaseUntil || null, record.status, record.id, expectedRevision]
    if (leaseToken) args.push(leaseToken)
    const response = await this.db.prepare(sql).bind(...args).run()
    if (response.meta.changes !== 1) throw new HttpError(409, 'REVISION_CONFLICT', '任务已更新，请刷新后重试')
    return this.get(record.id)
  }
  async claim(kind, runId) {
    const token = crypto.randomUUID(); const now = this.now()
    const row = await this.db.prepare(`UPDATE video_tasks SET lease_token=?,lease_until=?,updated_at=?,revision=revision+1,data_json=json_set(data_json,'$.runId',?),status=CASE kind WHEN 'process' THEN 'processing' ELSE 'publishing' END WHERE id=(SELECT id FROM video_tasks WHERE kind=? AND status='queued' ORDER BY created_at LIMIT 1) AND NOT EXISTS(SELECT 1 FROM video_tasks WHERE kind=? AND lease_token IS NOT NULL) RETURNING *`).bind(token, now + 180000, now, runId, kind, kind).first()
    const task = hydrate(row)
    if (!task) return null
    return { task, leaseToken: token }
  }
  async heartbeat(id, token) {
    const now = this.now()
    const response = await this.db.prepare('UPDATE video_tasks SET lease_until=? WHERE id=? AND lease_token=? AND lease_until>?').bind(now + 180000, id, token, now).run()
    if (response.meta.changes !== 1) throw new HttpError(409, 'LEASE_LOST', '任务租约失效')
  }
  async freeze(publication, jobs) {
    const now = this.now()
    const predicates = jobs.map(() => '(id=? AND revision=?)').join(' OR ')
    const params = jobs.flatMap(job => [job.id, job.revision])
    const statements = [this.db.prepare(`INSERT INTO video_tasks(id,kind,owner,status,revision,created_at,updated_at,data_json) SELECT ?,'publish',?,'queued',1,?,?,? WHERE (SELECT COUNT(*) FROM video_tasks WHERE owner=? AND kind='process' AND status='awaiting_review' AND (${predicates}))=?`).bind(publication.id, publication.owner, now, now, JSON.stringify(publication), publication.owner, ...params, jobs.length)]
    for (const job of jobs) {
      const frozen = { ...job, status: 'publishing', publicationId: publication.id }
      statements.push(this.db.prepare("UPDATE video_tasks SET status='publishing',revision=revision+1,updated_at=?,data_json=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM video_tasks WHERE id=?)").bind(now, JSON.stringify(frozen), job.id, job.revision, publication.id))
      statements.push(this.db.prepare('INSERT INTO video_publication_jobs(publication_id,job_id,review_revision) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM video_tasks WHERE id=?)').bind(publication.id, job.id, job.revision, publication.id))
    }
    await this.db.batch(statements)
    const saved = await this.get(publication.id)
    if (!saved) throw new HttpError(409, 'REVISION_CONFLICT', '审核结果已更新或正在发布，请刷新')
    return saved
  }
  async finishPublication(publication) {
    const now = this.now(); const statements = []
    for (const job of publication.jobs) {
      statements.push(this.db.prepare("UPDATE video_tasks SET status='published',revision=revision+1,updated_at=? WHERE id=? AND id IN(SELECT job_id FROM video_publication_jobs WHERE publication_id=?) AND EXISTS(SELECT 1 FROM video_tasks WHERE id=? AND lease_token=?)").bind(now, job.id, publication.id, publication.id, publication._leaseToken))
    }
    statements.push(this.db.prepare("UPDATE video_tasks SET status='published',revision=revision+1,updated_at=?,data_json=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?").bind(now, JSON.stringify(publication), publication.id, publication._leaseToken))
    await this.db.batch(statements)
    return this.get(publication.id)
  }
  async stale() {
    const { results } = await this.db.prepare('SELECT * FROM video_tasks WHERE lease_token IS NOT NULL AND lease_until<?').bind(this.now()).all()
    return results.map(hydrate)
  }
  async aged() {
    const now = this.now()
    const { results } = await this.db.prepare("SELECT * FROM video_tasks WHERE kind='process' AND lease_token IS NULL AND status IN('uploading','awaiting_ai','awaiting_review','failed','expired','published') AND ((json_extract(data_json,'$.materialsCleanedAt') IS NULL AND (status='expired' OR updated_at < CASE WHEN status IN('uploading','published') THEN ? ELSE ? END)) OR (json_extract(data_json,'$.materialsCleanedAt') IS NOT NULL AND created_at<?)) ORDER BY updated_at LIMIT 100").bind(now - 7 * 86400000, now - 30 * 86400000, now - 90 * 86400000).all()
    return results.map(hydrate)
  }
  async agedPublications() {
    const { results } = await this.db.prepare("SELECT * FROM video_tasks WHERE kind='publish' AND lease_token IS NULL AND ((status='failed' AND json_extract(data_json,'$.materialsExpiredAt') IS NULL AND updated_at<?) OR (status IN('failed','published') AND created_at<?)) ORDER BY updated_at LIMIT 100").bind(this.now() - 30 * 86400000, this.now() - 90 * 86400000).all()
    return results.map(hydrate)
  }
  async expirePublication(publication) {
    const now = this.now()
    publication.materialsExpiredAt = new Date(now).toISOString()
    const statements = []
    for (const job of publication.jobs) {
      statements.push(this.db.prepare("UPDATE video_tasks SET status='expired',revision=revision+1,idempotency_key=NULL WHERE id=? AND status='publishing' AND EXISTS(SELECT 1 FROM video_tasks WHERE id=? AND status='failed' AND revision=? AND lease_token IS NULL)").bind(job.id, publication.id, publication.revision))
    }
    statements.push(this.db.prepare("UPDATE video_tasks SET data_json=?,revision=revision+1 WHERE id=? AND status='failed' AND revision=? AND lease_token IS NULL").bind(JSON.stringify(publication), publication.id, publication.revision))
    await this.db.batch(statements)
  }
}
