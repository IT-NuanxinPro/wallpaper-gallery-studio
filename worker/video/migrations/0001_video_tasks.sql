CREATE TABLE IF NOT EXISTS video_tasks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('process', 'publish')),
  owner TEXT NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  data_json TEXT NOT NULL,
  UNIQUE(owner, kind, idempotency_key)
);
CREATE INDEX IF NOT EXISTS video_tasks_queue ON video_tasks(kind, status, created_at);
CREATE INDEX IF NOT EXISTS video_tasks_owner ON video_tasks(owner, created_at);
CREATE TABLE IF NOT EXISTS video_publication_jobs (
  publication_id TEXT NOT NULL REFERENCES video_tasks(id),
  job_id TEXT NOT NULL REFERENCES video_tasks(id),
  review_revision INTEGER NOT NULL,
  PRIMARY KEY(publication_id, job_id)
);
