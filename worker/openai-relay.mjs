export const UPSTREAM_ORIGIN = 'http://studio-ai-origin.061129.xyz:8052'

const routes = new Map([
  ['/v1/models', 'GET'],
  ['/v1/chat/completions', 'POST']
])
const allowedRequestHeaders = ['authorization', 'content-type', 'accept']
const allowedResponseHeaders = ['content-type', 'retry-after', 'x-request-id']

function error(status, message, headers) {
  return Response.json({ error: { message, type: 'relay_error' } }, { status, headers })
}

export function createOpenAIRelay({ upstreamFetch = fetch } = {}) {
  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url)
      const origin = request.headers.get('Origin')
      const origins = String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
      const responseHeaders = new Headers({
        'Cache-Control': 'no-store',
        Vary: 'Origin',
        'X-Content-Type-Options': 'nosniff'
      })
      if (origin && !origins.includes(origin)) {
        return error(403, '此工作台来源未授权', responseHeaders)
      }
      if (origin) {
        responseHeaders.set('Access-Control-Allow-Origin', origin)
        responseHeaders.set('Access-Control-Expose-Headers', 'Retry-After, X-Request-ID')
      }
      const method = routes.get(url.pathname)
      if (!method) return error(404, '代理接口不存在', responseHeaders)
      if (url.search) return error(400, '代理接口不接受查询参数', responseHeaders)
      if (request.method === 'OPTIONS') {
        const requestedMethod = request.headers.get('Access-Control-Request-Method')
        const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
          .split(',')
          .map(value => value.trim().toLowerCase())
          .filter(Boolean)
        if (requestedMethod && requestedMethod !== method) {
          return error(405, '请求方法不支持', responseHeaders)
        }
        if (requestedHeaders.some(name => !allowedRequestHeaders.includes(name))) {
          return error(400, '请求头不支持', responseHeaders)
        }
        responseHeaders.set('Access-Control-Allow-Methods', `${method}, OPTIONS`)
        responseHeaders.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept')
        responseHeaders.set('Access-Control-Max-Age', '600')
        return new Response(null, { status: 204, headers: responseHeaders })
      }
      if (request.method !== method) {
        responseHeaders.set('Allow', `${method}, OPTIONS`)
        return error(405, '请求方法不支持', responseHeaders)
      }
      if (!/^Bearer \S+$/i.test(request.headers.get('Authorization') || '')) {
        return error(401, '请填写上游服务的 API Key', responseHeaders)
      }
      if (
        method === 'POST' &&
        !/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')
      ) {
        return error(415, '请使用 application/json 请求体', responseHeaders)
      }
      const headers = new Headers()
      for (const name of allowedRequestHeaders) {
        const value = request.headers.get(name)
        if (value) headers.set(name, value)
      }
      try {
        const upstream = await upstreamFetch(`${UPSTREAM_ORIGIN}${url.pathname}`, {
          method,
          headers,
          body: method === 'POST' ? request.body : undefined,
          signal: request.signal,
          redirect: 'manual'
        })
        if (upstream.status >= 300 && upstream.status < 400) {
          await upstream.body?.cancel()
          return error(502, '上游返回了重定向，请检查接口配置', responseHeaders)
        }
        for (const name of allowedResponseHeaders) {
          const value = upstream.headers.get(name)
          if (value) responseHeaders.set(name, value)
        }
        return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
      } catch {
        return error(
          request.signal.aborted ? 499 : 502,
          request.signal.aborted ? '请求已取消' : '上游服务连接失败，请稍后重试',
          responseHeaders
        )
      }
    }
  }
}
