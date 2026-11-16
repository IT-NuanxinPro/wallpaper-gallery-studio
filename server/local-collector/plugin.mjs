import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PREFIX = '/__local-collector'
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
export function isLocalCollectorRequest(req) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false
  try {
    const url = new URL('http://' + req.headers.host)
    if (!LOOPBACK.has(url.hostname) || url.username || url.password || url.pathname !== '/') return false
    if (req.headers['sec-fetch-site'] === 'cross-site') return false
    if (req.headers.origin && !['http:', 'https:'].some(protocol => req.headers.origin === protocol + '//' + url.host)) return false
    return req.method === 'GET' || (req.method === 'POST' && req.headers['x-studio-local'] === '1' &&
      req.headers['content-type']?.startsWith('application/json'))
  } catch {
    return false
  }
}

export function createBridgeProcess({ project, python, spawnImpl = spawn, timeout = 12000 }) {
  const secret = randomBytes(32).toString('hex')
  let child
  let pending
  let port
  let stopped = false
  function stop() {
    stopped = true
    child?.kill('SIGTERM')
    port = undefined
  }
  async function start() {
    if (stopped) throw new Error('本地服务已停止，请重启工作台')
    if (port) return { port, secret }
    if (pending) return pending
    if (!project || !existsSync(join(project, 'web_app.py'))) throw new Error('请在 .env.local 配置 WALLPAPER_COLLECTOR_DIR 为采集项目目录，并重启工作台')
    const executable = python || (existsSync(join(project, '.venv/bin/python')) ? join(project, '.venv/bin/python') : 'python3')
    pending = new Promise((accept, reject) => {
      const process = spawnImpl(executable, ['-u', fileURLToPath(new URL('./bridge.py', import.meta.url)), '--project', resolve(project), '--port', '0'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: globalThis.process.env.PATH, HOME: globalThis.process.env.HOME, LANG: 'en_US.UTF-8', STUDIO_COLLECTOR_SECRET: secret }
      })
      child = process
      let ready = false
      let buffer = ''
      let failureMessage = '采集服务未能启动，请检查 Python 环境及采集项目依赖后重试'
      const fail = () => {
        if (ready) return
        clearTimeout(timer)
        process.kill('SIGTERM')
        reject(new Error(failureMessage))
      }
      const timer = setTimeout(fail, timeout)
      process.stderr.on('data', chunk => {
        try {
          if (JSON.parse(chunk.toString()).code === 'COLLECTOR_IN_USE')
            failureMessage = '另一个本地工作台已连接采集项目，请关闭对应开发服务后重试'
        } catch {}
      })
      process.stdout.on('data', chunk => {
        if (ready) return
        buffer += chunk.toString()
        if (buffer.length > 8192) return fail()
        if (!buffer.includes('\n')) return
        try {
          const value = JSON.parse(buffer.split('\n')[0])
          if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) return fail()
          port = value.port
          ready = true
          clearTimeout(timer)
          accept({ port, secret })
        } catch { fail() }
      })
      process.once('error', fail)
      process.once('exit', () => {
        if (child === process) { child = undefined; port = undefined }
        fail()
      })
    }).finally(() => { pending = undefined })
    return pending
  }
  return { start, stop }
}

export function localCollectorPlugin({ project, python } = {}) {
  return {
    name: 'studio-local-collector',
    apply: 'serve',
    configureServer(server) {
      const bridge = createBridgeProcess({ project, python })
      const stop = () => bridge.stop()
      server.httpServer?.once('close', stop)
      const sendError = (res, status, message) => {
        if (res.headersSent || res.destroyed) return
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ ok: false, msg: message }))
      }
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(PREFIX + '/')) return next()
        if (!isLocalCollectorRequest(req)) return sendError(res, 403, '素材采集仅允许本机工作台访问')
        const suffix = req.url.slice(PREFIX.length)
        if (!/^\/(health|platforms|sources|status|files|runs|batches(?:\/(?:create|receipt|clean|import|discard|items\/delete))?|image|thumbnail|start|stop)(?:\?|$)/.test(suffix))
          return sendError(res, 404, '本地接口不存在')
        if (Number(req.headers['content-length'] || 0) > 1048576) return sendError(res, 413, '请求内容过大')
        try {
          const { port, secret } = await bridge.start()
          const upstream = httpRequest({
            hostname: '127.0.0.1', port, path: suffix, method: req.method,
            headers: {
              'X-Studio-Bridge': secret,
              ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
              ...(req.headers['x-github-token'] ? { 'X-GitHub-Token': req.headers['x-github-token'] } : {})
            }
          }, response => {
            res.writeHead(response.statusCode, {
              'Content-Type': response.headers['content-type'] || 'application/json',
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff'
            })
            response.pipe(res)
          })
          upstream.setTimeout(180000, () => upstream.destroy(new Error('timeout')))
          upstream.on('error', () => sendError(res, 502, '采集服务连接中断，请刷新后重试；本地素材仍保留'))
          res.on('close', () => upstream.destroy())
          if (req.method === 'POST') {
            let size = 0
            const chunks = []
            for await (const chunk of req) {
              size += chunk.length
              if (size > 1048576) { upstream.destroy(); return sendError(res, 413, '请求内容过大') }
              chunks.push(chunk)
            }
            const body = Buffer.concat(chunks)
            upstream.setHeader('Content-Length', body.length)
            upstream.end(body)
          } else upstream.end()
        } catch (error) {
          sendError(res, 503, error.message)
        }
      })
    }
  }
}
