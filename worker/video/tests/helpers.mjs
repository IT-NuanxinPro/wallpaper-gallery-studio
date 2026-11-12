import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

export function memoryD1() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_video_tasks.sql', import.meta.url), 'utf8'))
  function prepare(sql) {
    let args = []
    return {
      bind(...values) { args = values; return this },
      async first() { return sqlite.prepare(sql).get(...args) || null },
      async all() { return { results: sqlite.prepare(sql).all(...args) } },
      async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } } }
    }
  }
  return {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN')
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result }
      catch (error) { sqlite.exec('ROLLBACK'); throw error }
    }
  }
}

export function fakeStorage() {
  const objects = new Map(); const sessions = new Map()
  return {
    objects, sessions,
    async create(key) { sessions.set(key, []); return 'upload-1' },
    async sign(key, method, pub, query = {}) { return `https://storage.example/${pub ? 'public' : 'private'}/${key}?method=${method}&${new URLSearchParams(query)}` },
    async parts(key) { return sessions.get(key) || [] },
    async complete(key) { objects.set(key, { size: sessions.get(key).reduce((n, part) => n + part.size, 0), httpMetadata: { contentType: 'video/mp4' } }) },
    async head(key) { return objects.get(key) || null },
    async abort(key) { sessions.delete(key) },
    async removePrefix(prefix) { for (const key of objects.keys()) if (key.startsWith(prefix)) objects.delete(key) }
  }
}
