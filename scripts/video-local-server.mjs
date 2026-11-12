// 本地集成环境：生产 Worker + SQLite，文件存储模拟 R2；不连接生产目录或部署服务。
import http from 'node:http'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { resolve, dirname, join } from 'node:path'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createVideoWorker } from '../worker/video/index.mjs'

const port = Number(process.env.VIDEO_LOCAL_PORT || 8795)
const base = `http://127.0.0.1:${port}`
const root = resolve(process.env.VIDEO_LOCAL_ROOT || 'output/video-e2e-20261112/local')
mkdirSync(root, { recursive: true })
const db = new DatabaseSync(join(root, 'tasks.sqlite'))
db.exec(readFileSync(new URL('../worker/video/migrations/0001_video_tasks.sql', import.meta.url), 'utf8'))
const secret = randomBytes(32)
const metadataPath = join(root, 'object-metadata.json')
const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, 'utf8')) : {}
const saveMetadata = () => writeFileSync(metadataPath, JSON.stringify(metadata))
function statement(sql) {
  let values = []
  return {
    bind(...args) { values = args; return this },
    async first() { return db.prepare(sql).get(...values) || null },
    async all() { return { results: db.prepare(sql).all(...values) } },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } } }
  }
}
const d1 = { prepare: statement, async batch(statements) {
  db.exec('BEGIN')
  try { const result = []; for (const s of statements) result.push(await s.run()); db.exec('COMMIT'); return result }
  catch (error) { db.exec('ROLLBACK'); throw error }
} }
function objectPath(key, pub = false) {
  if (!key || key.split('/').some(value => !value || value === '.' || value === '..') || /[\\\x00-\x1f]/.test(key)) throw new Error('Invalid local storage path')
  return join(root, pub ? 'public' : 'private', key)
}
function signature(method, path, expires) { return createHmac('sha256', secret).update(`${method}\n${path}\n${expires}`).digest('hex') }
const storage = {
  async create(key, contentType) { metadata[`upload:${key}`] = { parts: [], contentType }; saveMetadata(); return 'local-multipart' },
  async parts(key) { return metadata[`upload:${key}`]?.parts || [] },
  async sign(key, method, pub = false, query = {}) {
    const path = `/__objects/${pub ? 'public' : 'private'}/${key}`
    const params = new URLSearchParams(query); const expires = String(Date.now() + 900000)
    params.set('expires', expires)
    params.set('signature', signature(method, path + '?' + new URLSearchParams(query), expires))
    return base + path.split('/').map(encodeURIComponent).join('/') + '?' + params
  },
  async complete(key, uploadId, parts) {
    const dest = objectPath(key); mkdirSync(dirname(dest), { recursive: true })
    const output = createWriteStream(dest)
    for (const part of parts) {
      for await (const chunk of createReadStream(dest + `.part-${part.partNumber}`)) {
        if (!output.write(chunk)) await new Promise(resolve => output.once('drain', resolve))
      }
    }
    output.end(); await new Promise((resolve, reject) => { output.on('finish', resolve); output.on('error', reject) })
    metadata[`private:${key}`] = { contentType: metadata[`upload:${key}`].contentType }; saveMetadata()
  },
  async head(key, pub = false) {
    const file = objectPath(key, pub)
    return existsSync(file) ? { size: statSync(file).size, httpMetadata: metadata[`${pub ? 'public' : 'private'}:${key}`] || {} } : null
  },
  async abort() {}, async removePrefix() { throw new Error('Local harness does not clean user test artifacts') }
}
const env = { DB: d1, VIDEO_STAGING: {}, ALLOWED_ORIGINS: 'http://127.0.0.1:5176,http://localhost:5176,http://127.0.0.1:5174,http://localhost:5174', GITHUB_OWNER: 'IT-NuanxinPro', IMAGE_REPO: 'nuanXinProPic', WORKFLOW_REPO: 'wallpaper-gallery-workflow', GITHUB_DISPATCH_TOKEN: 'local-dispatch-only', VIDEO_SERVICE_TOKEN: process.env.VIDEO_SERVICE_TOKEN || 'local-video-service' }
const worker = createVideoWorker({ storageFactory: () => storage, githubFetch: async url => {
  if (url.endsWith('/user')) return Response.json({ login: 'local-video-tester' })
  if (url.includes('/dispatches')) return new Response(null, { status: 204 })
  if (url.includes('/contents/metadata/video.json')) return Response.json({ encoding: 'base64', content: readFileSync(new URL('../../nuanXinProPic/metadata/video.json', import.meta.url)).toString('base64') })
  return Response.json({ permissions: { push: true } })
} })
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, base)
    if (url.pathname.startsWith('/__objects/')) {
      const origin = req.headers.origin
      if (origin && env.ALLOWED_ORIGINS.split(',').includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,HEAD,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Range')
      res.setHeader('Access-Control-Expose-Headers', 'ETag,Content-Length,Content-Range')
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
      const path = decodeURIComponent(url.pathname)
      const provided = url.searchParams.get('signature') || ''; const expires = url.searchParams.get('expires') || ''
      const params = new URLSearchParams(url.search); params.delete('signature'); params.delete('expires')
      const expected = signature(req.method, path + '?' + params, expires)
      if (Number(expires) < Date.now() || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) { res.writeHead(403); res.end(); return }
      const [, , bucket, ...segments] = path.split('/'); const key = segments.join('/')
      const file = objectPath(key, bucket === 'public')
      if (req.method === 'PUT') {
        const part = url.searchParams.get('partNumber')
        const target = part ? file + `.part-${Number(part)}` : file
        mkdirSync(dirname(target), { recursive: true })
        await pipeline(req, createWriteStream(target))
        const digest = createHash('md5'); for await (const chunk of createReadStream(target)) digest.update(chunk)
        const etag = '"' + digest.digest('hex') + '"'
        if (part) {
          const upload = metadata[`upload:${key}`]
          upload.parts = upload.parts.filter(item => item.partNumber !== Number(part))
          upload.parts.push({ partNumber: Number(part), size: statSync(target).size, etag })
        } else metadata[`${bucket}:${key}`] = { contentType: req.headers['content-type'] || 'application/octet-stream' }
        saveMetadata(); res.setHeader('ETag', etag); res.writeHead(200); res.end(); return
      }
      if (!existsSync(file)) { res.writeHead(404); res.end(); return }
      const stat = statSync(file)
      res.setHeader('Content-Type', metadata[`${bucket}:${key}`]?.contentType || 'application/octet-stream')
      res.setHeader('Accept-Ranges', 'bytes')
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
      if (range) {
        const start = Number(range[1]); const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1
        if (start > end) { res.writeHead(416); res.end(); return }
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`); res.setHeader('Content-Length', end - start + 1); res.writeHead(206)
        await pipeline(createReadStream(file, { start, end }), res); return
      }
      res.setHeader('Content-Length', stat.size); res.writeHead(200)
      if (req.method === 'HEAD') res.end()
      else await pipeline(createReadStream(file), res)
      return
    }
    const request = new Request(base + req.url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) })
    const result = await worker.fetch(request, env, { waitUntil(promise) { promise.catch(() => {}) } })
    res.writeHead(result.status, Object.fromEntries(result.headers))
    res.end(Buffer.from(await result.arrayBuffer()))
  } catch (error) {
    if (res.headersSent || res.destroyed) { res.destroy(); return }
    res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: error.message } }))
  }
})
server.listen(port, '127.0.0.1', () => console.log(`Local video integration API: ${base}; production APIs disabled`))
