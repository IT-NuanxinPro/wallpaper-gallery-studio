import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  findSetupResource,
  mergeStagingCors,
  parseAllowedOrigins,
  createSetupConfig,
  setupVideoService,
  redactSetupDiagnostic,
  executeSetupCommand,
  probeR2Buckets,
  resolveSetupR2Credentials
} from './video-service-setup.mjs'

test('只选择明确独立资源，同名异常或资源名越界时拒绝', () => {
  const id = '11111111-2222-4333-8444-555555555555'
  assert.equal(
    findSetupResource('d1', 'wallpaper-video-tasks', {
      result: [
        { name: 'other', uuid: 'other' },
        { name: 'wallpaper-video-tasks', uuid: id }
      ]
    }).uuid,
    id
  )
  assert.equal(
    findSetupResource('r2', 'wallpaper-video-staging', {
      result: { buckets: [{ name: 'wallpaper-images' }] }
    }),
    null
  )
  assert.throws(() => findSetupResource('r2', 'wallpaper-images', { result: [] }), /允许/)
  assert.throws(() => findSetupResource('d1', 'wallpaper-video-tasks', { result: {} }), /列表/)
  assert.throws(
    () =>
      findSetupResource('d1', 'wallpaper-video-tasks', {
        result: [
          { name: 'wallpaper-video-tasks', uuid: id },
          { name: 'wallpaper-video-tasks', uuid: id }
        ]
      }),
    /同名/
  )
})

test('CORS保留既有规则，只合并暂存上传规则且重复执行不增长', () => {
  const previous = {
    rules: [
      {
        id: 'existing-client',
        allowed: { origins: ['https://old.example'], methods: ['GET'] },
        maxAgeSeconds: 12
      }
    ]
  }
  const merged = mergeStagingCors(previous, ['https://studio.example', 'http://localhost:5174'])
  assert.deepEqual(merged.rules[0], previous.rules[0])
  assert.deepEqual(merged.rules[1].allowed.methods, ['GET', 'HEAD', 'PUT'])
  assert.ok(merged.rules[1].exposeHeaders.includes('ETag'))
  assert.ok(merged.rules[1].allowed.headers.includes('Range'))
  assert.deepEqual(mergeStagingCors(merged, ['https://studio.example']), merged)
  assert.deepEqual(previous.rules.length, 1)
})

test('来源必须是明确origin，拒绝通配、路径和非本机明文HTTP', () => {
  assert.deepEqual(
    parseAllowedOrigins('https://studio.example,http://127.0.0.1:5174,https://studio.example'),
    ['https://studio.example', 'http://127.0.0.1:5174']
  )
  for (const input of [
    '*',
    'https://studio.example/upload',
    'http://public.example',
    'https://name:password@studio.example',
    'https://*.example',
    ''
  ]) {
    assert.throws(() => parseAllowedOrigins(input))
  }
})

test('临时配置只绑定固定独立库/暂存桶，正式桶仅绑定且无secret', () => {
  const config = createSetupConfig('/checkout/studio', '11111111-2222-4333-8444-555555555555', [
    'https://studio.example'
  ])
  assert.equal(config.name, 'wallpaper-video-ingest')
  assert.equal(config.d1_databases[0].database_name, 'wallpaper-video-tasks')
  assert.equal(config.r2_buckets[1].bucket_name, 'wallpaper-images')
  assert.equal(config.main, '/checkout/studio/worker/video/index.mjs')
  assert.equal(config.vars.ALLOWED_ORIGINS, 'https://studio.example')
  assert.equal(config.vars.R2_SECRET_ACCESS_KEY, undefined)
  assert.throws(() =>
    createSetupConfig('/checkout/studio', 'arbitrary-id', ['https://studio.example'])
  )
})

function setupFixture({
  headStatus = 404,
  enable = true,
  loseEnableResponse = false,
  failDisableAfterEnable = false,
  d1Status = 200
} = {}) {
  const runner = fs.mkdtempSync(path.join(os.tmpdir(), 'video-setup-fixture-'))
  const scratch = fs.mkdtempSync(path.join(runner, 'video-service-setup.'))
  const id = '11111111-2222-4333-8444-555555555555'
  const calls = []
  const commands = []
  let gateValue = 'false'
  let enableAttempted = false
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'IT-NuanxinPro/wallpaper-gallery',
    STUDIO_REF: 'b'.repeat(40),
    CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
    CLOUDFLARE_API_TOKEN: 'cf-fixture-only',
    CLOUDFLARE_R2_ACCESS_KEY: 'fixture-access',
    CLOUDFLARE_R2_SECRET_KEY: 'fixture-secret',
    VIDEO_CONFIG_TOKEN: 'github-fixture-only',
    VIDEO_SETUP_TEMP_DIR: scratch,
    RUNNER_TEMP: runner,
    ALLOWED_ORIGINS: 'http://localhost:5174',
    ENABLE_CONSUMERS: String(enable)
  }
  const response = (value, status = 200, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
    headers: new Headers(headers)
  })
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url)
    calls.push({
      host: parsed.hostname,
      pathname: parsed.pathname,
      method: init.method || 'GET',
      body: init.body && JSON.parse(init.body)
    })
    if (
      parsed.hostname === 'api.github.com' &&
      parsed.pathname.endsWith('/actions/variables/VIDEO_INGEST_ENABLED')
    )
      return response({ name: 'VIDEO_INGEST_ENABLED', value: gateValue })
    if (parsed.hostname === 'api.github.com')
      return response(
        parsed.pathname.endsWith('/deploy.yml') ? { state: 'active' } : { workflow_runs: [] }
      )
    if (parsed.hostname.endsWith('.r2.cloudflarestorage.com')) return response(null, headStatus)
    if (parsed.pathname.endsWith('/health'))
      return response({ service: 'video-ingest', configured: true })
    if (parsed.pathname.endsWith('/setup-probe/source')) return response({}, 404)
    if (init.method === 'OPTIONS')
      return response(null, 204, { 'Access-Control-Allow-Origin': init.headers.Origin })
    if (parsed.pathname.endsWith('/video/jobs')) return response({ jobs: [] })
    if (parsed.pathname.endsWith('/d1/database') && d1Status !== 200)
      return response(
        { success: false, errors: [{ code: 10000, message: 'fixture response body is private' }] },
        d1Status
      )
    if (parsed.pathname.endsWith('/d1/database'))
      return response({
        success: true,
        result: init.method === 'POST' ? { uuid: id, name: 'wallpaper-video-tasks' } : []
      })
    if (parsed.pathname.endsWith('/r2/buckets'))
      return response({
        success: true,
        result:
          init.method === 'POST'
            ? { name: 'wallpaper-video-staging' }
            : { buckets: [{ name: 'wallpaper-images' }] }
      })
    if (parsed.pathname.endsWith('/cors'))
      return response({
        success: true,
        result: {
          rules: [
            { id: 'old-policy', allowed: { origins: ['https://old.example'], methods: ['GET'] } }
          ]
        }
      })
    if (parsed.pathname.endsWith('/workers/subdomain'))
      return response({ success: true, result: { subdomain: 'fixture-subdomain' } })
    throw new Error('unexpected fixture request')
  }
  const run = (command, args, options = {}) => {
    commands.push({ command, args, input: options.input, stage: options.stage })
    if (command === 'git') return env.STUDIO_REF
    if (command === 'gh' && args[0] === 'variable' && args[2] === 'VIDEO_INGEST_ENABLED') {
      if (args[4] === 'true') {
        enableAttempted = true
        gateValue = 'true'
        if (loseEnableResponse) throw new Error('启用响应丢失')
      } else {
        if (enableAttempted && failDisableAfterEnable) throw new Error('关停请求失败')
        gateValue = 'false'
      }
    }
    if (args.includes('bulk')) {
      const file = args[args.indexOf('bulk') + 1]
      assert.equal(fs.statSync(file).mode & 0o777, 0o600)
      const secrets = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.equal(secrets.GITHUB_DISPATCH_TOKEN, env.VIDEO_CONFIG_TOKEN)
      assert.equal(secrets.R2_SECRET_ACCESS_KEY, env.CLOUDFLARE_R2_SECRET_KEY)
      assert.ok(secrets.VIDEO_SERVICE_TOKEN.length >= 48)
    }
    return ''
  }
  return {
    env,
    fetchImpl,
    run,
    calls,
    commands,
    getGate: () => gateValue,
    scratch,
    cleanup: () => fs.rmSync(runner, { recursive: true, force: true })
  }
}

test('配置fixture只创建独立资源，0600批量密钥不落摘要，自检后才启用', async () => {
  const fixture = setupFixture()
  try {
    const result = await setupVideoService({ ...fixture, root: '/checkout/studio' })
    assert.deepEqual(Object.keys(result).sort(), [
      'databaseId',
      'publicBucket',
      'stagingBucket',
      'workerUrl'
    ])
    assert.equal(result.workerUrl, 'https://wallpaper-video-ingest.fixture-subdomain.workers.dev')
    assert.equal(
      fixture.calls.filter(
        call => call.method !== 'GET' && call.pathname.includes('/r2/buckets/wallpaper-images')
      ).length,
      0
    )
    assert.deepEqual(
      fixture.calls.find(call => call.method === 'PUT' && call.pathname.endsWith('/cors')).body
        .rules[0].id,
      'old-policy'
    )
    assert.equal(fixture.commands.at(-1).args[2], 'VIDEO_INGEST_ENABLED')
    assert.equal(fixture.commands.at(-1).args[4], 'true')
    assert.deepEqual(
      fixture.commands.filter(call => call.command === 'npx').map(call => call.stage),
      ['独立D1迁移', 'Worker部署', 'Worker密钥写入']
    )
    assert.deepEqual(fs.readdirSync(fixture.scratch), [])
  } finally {
    fixture.cleanup()
  }
})

test('R2只读自检失败时不启用消费者且清理临时密钥，不删除云资源', async () => {
  const fixture = setupFixture({ headStatus: 403 })
  try {
    await assert.rejects(
      setupVideoService({ ...fixture, root: '/checkout/studio' }),
      /HEAD自检失败/
    )
    assert.equal(
      fixture.commands.some(
        call =>
          call.command === 'gh' &&
          call.args.includes('VIDEO_INGEST_ENABLED') &&
          call.args.includes('true')
      ),
      false
    )
    assert.equal(
      fixture.calls.some(call => call.method === 'DELETE'),
      false
    )
    assert.deepEqual(fs.readdirSync(fixture.scratch), [])
  } finally {
    fixture.cleanup()
  }
})

test('默认不启用消费者，即使配置自检通过也保持关闭', async () => {
  const fixture = setupFixture({ enable: false })
  try {
    await setupVideoService({ ...fixture, root: '/checkout/studio' })
    const gates = fixture.commands.filter(
      call => call.command === 'gh' && call.args.includes('VIDEO_INGEST_ENABLED')
    )
    assert.equal(gates.length, 1)
    assert.equal(gates[0].args[4], 'false')
  } finally {
    fixture.cleanup()
  }
})

test('远端启用成功但CLI响应丢失时，整体失败并回写false后读回确认', async () => {
  const fixture = setupFixture({ loseEnableResponse: true })
  try {
    await assert.rejects(
      setupVideoService({ ...fixture, root: '/checkout/studio' }),
      /启用响应丢失/
    )
    assert.equal(fixture.getGate(), 'false')
    assert.ok(
      fixture.calls.some(call => call.pathname.endsWith('/actions/variables/VIDEO_INGEST_ENABLED'))
    )
    assert.equal(
      fixture.calls.some(call => call.method === 'DELETE'),
      false
    )
    assert.deepEqual(fs.readdirSync(fixture.scratch), [])
  } finally {
    fixture.cleanup()
  }
})

test('启用结果不明且无法关停时明确要求人工确认，不声称默认关闭', async () => {
  const fixture = setupFixture({ loseEnableResponse: true, failDisableAfterEnable: true })
  try {
    await assert.rejects(
      setupVideoService({ ...fixture, root: '/checkout/studio' }),
      /无法确认消费者已关闭，必须人工确认/
    )
    assert.equal(fixture.getGate(), 'true')
    assert.equal(
      fixture.calls.some(call => call.method === 'DELETE'),
      false
    )
  } finally {
    fixture.cleanup()
  }
})

test('Cloudflare鉴权失败明确标出D1列表阶段和数值码，不混淆GitHub或输出正文', async () => {
  const fixture = setupFixture({ d1Status: 401 })
  try {
    const error = await setupVideoService({ ...fixture, root: '/checkout/studio' }).catch(
      value => value
    )
    assert.match(error.message, /Cloudflare D1列表.*HTTP 401.*10000/)
    assert.doesNotMatch(
      error.message,
      /github-fixture-only|cf-fixture-only|fixture response body|https:\/\//
    )
    assert.equal(fixture.getGate(), 'false')
    assert.equal(
      fixture.calls.some(call => call.method === 'POST'),
      false
    )
  } finally {
    fixture.cleanup()
  }
})

test('CLI错误先脱敏环境凭据、Bearer和URL查询，再限制尾部1200字', () => {
  const output =
    'head\n' +
    'x'.repeat(1500) +
    '\nTOKEN=fake-env-token KEY=fake-env-key SECRET=fake-env-secret Bearer stray-bearer-value https://storage.test/object?X-Amz-Signature=fake-signature&access=fake-access#fragment\n实际迁移错误'
  const diagnostic = redactSetupDiagnostic(output, {
    API_TOKEN: 'fake-env-token',
    ACCESS_KEY: 'fake-env-key',
    SOME_SECRET: 'fake-env-secret',
    EMPTY_TOKEN: ''
  })
  assert.ok(diagnostic.length <= 1200)
  assert.match(diagnostic, /实际迁移错误/)
  assert.doesNotMatch(
    diagnostic,
    /fake-env-token|fake-env-key|fake-env-secret|stray-bearer-value|fake-signature|fake-access/
  )
  assert.doesNotMatch(
    redactSetupDiagnostic('{"VIDEO_SERVICE_TOKEN":"fresh-generated-secret"}', {}),
    /fresh-generated-secret/
  )
})

test('实际本地子进程错误保留阶段和脱敏stderr，不输出完整命令参数', () => {
  const fake = 'fake-child-env-secret'
  const source =
    'process.stderr.write("fake-child-env-secret https://storage.test/a?signature=fake-child-signature Bearer fake-child-bearer\\n缺少迁移路径"); process.exit(1)'
  assert.throws(
    () =>
      executeSetupCommand(process.execPath, ['-e', source], {
        env: { ...process.env, API_TOKEN: fake },
        stage: '独立D1迁移'
      }),
    error => {
      assert.match(error.message, /独立D1迁移.*退出码1/)
      assert.match(error.message, /缺少迁移路径/)
      assert.doesNotMatch(
        error.message,
        /fake-child-env-secret|fake-child-signature|fake-child-bearer|process.stderr.write/
      )
      return true
    }
  )
})

test('两桶自检分别完成并聚合，仅报告S3白名单Code而不输出body或签名', async () => {
  const calls = []
  const error = await probeR2Buckets(
    {
      R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_ACCESS_KEY_ID: 'fake-access',
      R2_SECRET_ACCESS_KEY: 'fake-secret'
    },
    async (url, options) => {
      const bucket = new URL(url).pathname.split('/')[1]
      calls.push({ bucket, method: options.method })
      return {
        status: bucket === 'wallpaper-images' ? 404 : 403,
        text: async () =>
          '<Error><Code>AccessDenied</Code><RequestId>private-request-id</RequestId><Message>fake-secret?signature=private-signature</Message></Error>'
      }
    }
  ).catch(value => value)
  assert.deepEqual(calls, [
    { bucket: 'wallpaper-video-staging', method: 'HEAD' },
    { bucket: 'wallpaper-video-staging', method: 'GET' },
    { bucket: 'wallpaper-images', method: 'HEAD' }
  ])
  assert.match(error.message, /wallpaper-video-staging.*HEAD HTTP 403.*GET HTTP 403.*AccessDenied/)
  assert.match(error.message, /wallpaper-images.*HEAD HTTP 404.*通过/)
  assert.doesNotMatch(
    error.message,
    /fake-secret|private-request-id|private-signature|video-setup-probe|https:/
  )
})

test('视频R2专用密钥成对优先，缺半对时拒绝与正式旧key混用', () => {
  const previous = {
    CLOUDFLARE_R2_ACCESS_KEY: 'old-access',
    CLOUDFLARE_R2_SECRET_KEY: 'old-secret'
  }
  assert.deepEqual(resolveSetupR2Credentials(previous), {
    accessKey: 'old-access',
    secretKey: 'old-secret'
  })
  assert.deepEqual(
    resolveSetupR2Credentials({
      ...previous,
      VIDEO_R2_ACCESS_KEY: 'new-access',
      VIDEO_R2_SECRET_KEY: 'new-secret'
    }),
    { accessKey: 'new-access', secretKey: 'new-secret' }
  )
  assert.throws(
    () => resolveSetupR2Credentials({ ...previous, VIDEO_R2_ACCESS_KEY: 'only-half' }),
    /成对/
  )
})
