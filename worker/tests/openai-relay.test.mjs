import test from 'node:test'
import assert from 'node:assert/strict'
import { createOpenAIRelay } from '../openai-relay.mjs'

const origin = 'https://studio.example'
const key = 'synthetic-relay-test-key'
const env = { ALLOWED_ORIGINS: ` ${origin}, http://localhost:5176 ` }

function request(path = '/v1/models', options = {}) {
  return new Request(`https://relay.example${path}`, {
    ...options,
    headers: { Origin: origin, Authorization: `Bearer ${key}`, ...options.headers }
  })
}

function upstreamRequest(input, init = {}) {
  return new Request(input, { ...init, ...(init.body ? { duplex: 'half' } : {}) })
}

function assertCors(response) {
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)
  assert.match(response.headers.get('Vary') || '', /(?:^|,)\s*Origin\s*(?:,|$)/i)
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null)
}

test('GET models targets only the fixed origin and forwards the supplied Bearer', async () => {
  let received
  const relay = createOpenAIRelay({
    upstreamFetch: async (input, init) => {
      received = upstreamRequest(input, init)
      return Response.json(
        { data: [{ id: 'vision-test' }] },
        {
          headers: { 'Access-Control-Allow-Origin': '*', 'Set-Cookie': 'upstream=value' }
        }
      )
    }
  })
  const response = await relay.fetch(request(), env)
  assert.equal(received.url, 'http://studio-ai-origin.061129.xyz:8052/v1/models')
  assert.equal(received.method, 'GET')
  assert.equal(received.headers.get('Authorization'), `Bearer ${key}`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { data: [{ id: 'vision-test' }] })
  assertCors(response)
  assert.match(response.headers.get('Cache-Control') || '', /no-store/i)
  assert.equal(response.headers.get('Set-Cookie'), null)
})

test('POST preserves JSON bytes and model while dropping unrelated request headers', async () => {
  const body =
    '{ "model": "custom-vision", "stream": true, "messages": [{"role":"user","content":"测试"}] }'
  let received
  let receivedBody
  const relay = createOpenAIRelay({
    upstreamFetch: async (input, init) => {
      received = upstreamRequest(input, init)
      receivedBody = await received.text()
      return Response.json({ choices: [] })
    }
  })
  const response = await relay.fetch(
    request('/v1/chat/completions', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Cookie: 'private=session',
        'X-Forwarded-Host': 'attacker.example',
        'X-Target-URL': 'http://attacker.example',
        'X-Custom-Secret': 'do-not-forward'
      }
    }),
    env
  )
  assert.equal(response.status, 200)
  assert.equal(received.url, 'http://studio-ai-origin.061129.xyz:8052/v1/chat/completions')
  assert.equal(received.method, 'POST')
  assert.equal(receivedBody, body)
  assert.equal(received.headers.get('Authorization'), `Bearer ${key}`)
  assert.equal(received.headers.get('Content-Type'), 'application/json')
  assert.equal(received.headers.get('Accept'), 'text/event-stream')
  for (const name of [
    'Cookie',
    'Origin',
    'Host',
    'X-Forwarded-Host',
    'X-Target-URL',
    'X-Custom-Secret'
  ]) {
    assert.equal(received.headers.get(name), null, name)
  }
})

test('valid preflights permit the required method and headers without calling upstream', async () => {
  let calls = 0
  const relay = createOpenAIRelay({
    upstreamFetch: async () => {
      calls++
      return Response.json({})
    }
  })
  for (const [path, method] of [
    ['/v1/models', 'GET'],
    ['/v1/chat/completions', 'POST']
  ]) {
    const response = await relay.fetch(
      new Request(`https://relay.example${path}`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': method,
          'Access-Control-Request-Headers': 'authorization, content-type, accept'
        }
      }),
      env
    )
    assert.equal(response.status, 204)
    assertCors(response)
    const methods = (response.headers.get('Access-Control-Allow-Methods') || '')
      .split(',')
      .map(value => value.trim().toUpperCase())
    assert.ok(methods.includes(method))
    const headers = (response.headers.get('Access-Control-Allow-Headers') || '').toLowerCase()
    assert.ok(headers.includes('authorization'))
    assert.ok(headers.includes('content-type'))
    assert.ok(headers.includes('accept'))
    assert.equal(await response.text(), '')
  }
  for (const [headers, status] of [
    [{ 'Access-Control-Request-Method': 'DELETE' }, 405],
    [
      {
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,x-target-url'
      },
      400
    ]
  ]) {
    const response = await relay.fetch(
      request('/v1/models', {
        method: 'OPTIONS',
        headers: { Authorization: '', ...headers }
      }),
      env
    )
    assert.equal(response.status, status)
  }
  assert.equal(calls, 0)
})

test('CORS requires an exact configured Origin while authenticated CLI requests remain usable', async () => {
  let calls = 0
  const relay = createOpenAIRelay({
    upstreamFetch: async () => {
      calls++
      return Response.json({ data: [] })
    }
  })
  for (const badOrigin of [
    'https://studio.example.attacker.test',
    'https://other.example',
    'null'
  ]) {
    const response = await relay.fetch(
      request('/v1/models', { headers: { Origin: badOrigin } }),
      env
    )
    assert.equal(response.status, 403)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
  }
  assert.equal((await relay.fetch(request(), {})).status, 403)
  assert.equal(calls, 0)
  const response = await relay.fetch(
    new Request('https://relay.example/v1/models', {
      headers: { Authorization: `Bearer ${key}` }
    }),
    env
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
  assert.equal(calls, 1)
})

test('unapproved paths, query targets, methods and missing Bearer never reach upstream', async () => {
  let calls = 0
  const relay = createOpenAIRelay({
    upstreamFetch: async () => {
      calls++
      return Response.json({})
    }
  })
  const invalid = [
    ['/v1/responses', {}, 404],
    ['/v1/models?target=http://attacker.example', {}, 400],
    ['/v1/models?url=http://attacker.example', {}, 400],
    ['/v1/models?key=synthetic-query-key', {}, 400],
    ['/v1/models', { method: 'DELETE' }, 405],
    ['/v1/models', { method: 'POST', body: '{}' }, 405],
    ['/v1/chat/completions', {}, 405],
    ['/v1/models', { method: 'HEAD' }, 405],
    [
      '/v1/chat/completions',
      { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } },
      415
    ],
    ['/v1/models', { headers: { Authorization: '' } }, 401],
    ['/v1/models', { headers: { Authorization: 'Basic dummy' } }, 401]
  ]
  for (const [path, options, status] of invalid) {
    const response = await relay.fetch(request(path, options), env)
    assert.equal(response.status, status, `${options.method || 'GET'} ${path}`)
    assertCors(response)
    assert.ok(!(await response.text()).includes('synthetic-query-key'))
  }
  assert.equal(calls, 0)
})

test('upstream authentication and throttling statuses survive with safe response headers', async () => {
  for (const status of [401, 429]) {
    const body = JSON.stringify({ error: { message: 'upstream error', code: 'test' } })
    const relay = createOpenAIRelay({
      upstreamFetch: async () =>
        new Response(body, {
          status,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '12',
            'Set-Cookie': 'private=value',
            'Access-Control-Allow-Origin': '*'
          }
        })
    })
    const response = await relay.fetch(request(), env)
    assert.equal(response.status, status)
    assert.equal(await response.text(), body)
    assert.equal(response.headers.get('Retry-After'), '12')
    assert.equal(response.headers.get('Set-Cookie'), null)
    assert.match(response.headers.get('Cache-Control') || '', /no-store/i)
    assertCors(response)
  }
})

test('Worker fetch uses manual redirects and rejects every 3xx without exposing Location', async () => {
  for (const status of [301, 302, 303, 304, 307, 308]) {
    let calls = 0
    const relay = createOpenAIRelay({
      upstreamFetch: async (input, init) => {
        calls++
        assert.equal(upstreamRequest(input, init).redirect, 'manual')
        return new Response(null, { status, headers: { Location: 'http://attacker.example/key' } })
      }
    })
    const response = await relay.fetch(request(), env)
    assert.equal(response.status, 502)
    assert.equal(response.headers.get('Location'), null)
    assert.equal(calls, 1)
    assertCors(response)
  }
})

test(
  'SSE response and first chunk are available before the upstream stream closes',
  { timeout: 1000 },
  async t => {
    const encoder = new TextEncoder()
    let producer
    let closed = false
    const stream = new ReadableStream({
      start(controller) {
        producer = controller
      }
    })
    t.after(() => {
      if (!closed) producer.close()
    })
    producer.enqueue(encoder.encode('data: {"first":true}\n\n'))
    const relay = createOpenAIRelay({
      upstreamFetch: async () =>
        new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'public, max-age=3600' }
        })
    })
    const response = await relay.fetch(
      request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"stream":true}'
      }),
      env
    )
    assert.match(response.headers.get('Content-Type'), /^text\/event-stream/)
    const reader = response.body.getReader()
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: {"first":true}\n\n')
    producer.enqueue(encoder.encode('data: [DONE]\n\n'))
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: [DONE]\n\n')
    producer.close()
    closed = true
    assert.equal((await reader.read()).done, true)
    assert.match(response.headers.get('Cache-Control') || '', /no-store/i)
  }
)

test('client cancellation aborts the active upstream request', { timeout: 1000 }, async () => {
  const client = new AbortController()
  let started
  const upstreamStarted = new Promise(resolve => {
    started = resolve
  })
  let upstreamSignal
  const relay = createOpenAIRelay({
    upstreamFetch: (input, init) => {
      upstreamSignal = upstreamRequest(input, init).signal
      started()
      return new Promise((_resolve, reject) => {
        upstreamSignal.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true }
        )
      })
    }
  })
  const pending = relay.fetch(request('/v1/models', { signal: client.signal }), env)
  await upstreamStarted
  client.abort()
  assert.equal(upstreamSignal.aborted, true)
  try {
    const response = await pending
    assert.ok(response.status >= 400)
    assert.ok(!(await response.text()).includes(key))
  } catch (error) {
    assert.equal(error.name, 'AbortError')
  }
})

test('relay failures neither expose exception secrets nor write credentials to logs or storage', async t => {
  const logged = []
  for (const name of ['log', 'warn', 'error', 'debug', 'info']) {
    t.mock.method(console, name, (...args) => logged.push(args))
  }
  let stored = false
  const forbiddenStorage = {
    put() {
      stored = true
      throw new Error('unexpected persistence')
    }
  }
  const relay = createOpenAIRelay({
    upstreamFetch: async () => {
      throw new Error(`network failed ${key} http://39.102.124.66:8052/internal`)
    }
  })
  const response = await relay.fetch(request(), {
    ...env,
    KV: forbiddenStorage,
    DB: forbiddenStorage,
    R2: forbiddenStorage
  })
  assert.equal(response.status, 502)
  const body = await response.text()
  assert.ok(!body.includes(key))
  assert.ok(!body.includes('/internal'))
  assert.ok(!body.includes('stack'))
  assert.ok(!JSON.stringify(logged).includes(key))
  assert.equal(stored, false)
  assertCors(response)
})
