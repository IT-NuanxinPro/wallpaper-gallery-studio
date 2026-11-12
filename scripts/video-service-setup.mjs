import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { presign } from '../worker/video/storage.mjs'

const WORKER = 'wallpaper-video-ingest'
const DATABASE = 'wallpaper-video-tasks'
const STAGING = 'wallpaper-video-staging'
const PUBLIC = 'wallpaper-images'
const WORKFLOW_REPOSITORY = 'IT-NuanxinPro/wallpaper-gallery-workflow'
const GALLERY_REPOSITORY = 'IT-NuanxinPro/wallpaper-gallery'
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const CORS_RULE = 'video-studio-upload-v1'

export function findSetupResource(kind, name, payload) {
  if (
    (kind === 'd1' && name !== DATABASE) ||
    (kind === 'r2' && name !== STAGING) ||
    !['d1', 'r2'].includes(kind)
  )
    throw new Error('资源名不在允许创建/配置的独立资源列表中')
  const items = kind === 'd1' ? payload?.result : payload?.result?.buckets
  if (!Array.isArray(items)) throw new Error('云资源列表响应无效，拒绝猜测资源不存在')
  const matches = items.filter(item => item.name === name)
  if (matches.length > 1) throw new Error('发现多个同名资源，拒绝猜测')
  if (matches[0] && kind === 'd1' && !UUID.test(matches[0].uuid || ''))
    throw new Error('D1资源ID无效')
  return matches[0] || null
}

export function parseAllowedOrigins(input) {
  const origins = [
    ...new Set(
      String(input || '')
        .split(/[,\s]+/)
        .filter(Boolean)
    )
  ]
  if (!origins.length || origins.length > 30) throw new Error('必须提供1至30个明确工作台来源')
  for (const origin of origins) {
    let url
    try {
      url = new URL(origin)
    } catch {
      throw new Error('工作台来源不是有效origin')
    }
    if (
      url.origin !== origin ||
      origin.includes('*') ||
      url.username ||
      url.password ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
      )
    )
      throw new Error('工作台来源必须是不含路径、凭据或通配符的HTTPS origin；本机HTTP例外')
  }
  return origins
}

export function mergeStagingCors(previous, origins) {
  parseAllowedOrigins(origins.join(','))
  if (!Array.isArray(previous?.rules)) throw new Error('暂存桶CORS响应无效，拒绝覆盖既有配置')
  const merged = structuredClone(previous)
  let rule = merged.rules.find(item => item.id === CORS_RULE)
  if (!rule) {
    rule = { id: CORS_RULE, allowed: {} }
    merged.rules.push(rule)
  }
  rule.allowed ||= {}
  const union = (left, right) => [...new Set([...(left || []), ...right])]
  rule.allowed.origins = union(rule.allowed.origins, origins)
  rule.allowed.methods = union(rule.allowed.methods, ['GET', 'HEAD', 'PUT'])
  rule.allowed.headers = union(rule.allowed.headers, ['Content-Type', 'Range'])
  rule.exposeHeaders = union(rule.exposeHeaders, [
    'ETag',
    'Content-Length',
    'Content-Range',
    'Accept-Ranges'
  ])
  rule.maxAgeSeconds ??= 3600
  return merged
}

export function createSetupConfig(root, databaseId, origins) {
  if (!UUID.test(databaseId || '') || !path.isAbsolute(root))
    throw new Error('临时部署配置的路径或D1 ID无效')
  parseAllowedOrigins(origins.join(','))
  return {
    name: WORKER,
    main: path.join(root, 'worker/video/index.mjs'),
    compatibility_date: '2026-11-12',
    workers_dev: true,
    vars: {
      GITHUB_OWNER: 'IT-NuanxinPro',
      IMAGE_REPO: 'nuanXinProPic',
      WORKFLOW_REPO: 'wallpaper-gallery-workflow',
      STAGING_BUCKET_NAME: STAGING,
      PUBLIC_BUCKET_NAME: PUBLIC,
      ALLOWED_ORIGINS: origins.join(',')
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: DATABASE,
        database_id: databaseId,
        migrations_dir: path.join(root, 'worker/video/migrations')
      }
    ],
    r2_buckets: [
      { binding: 'VIDEO_STAGING', bucket_name: STAGING },
      { binding: 'VIDEO_PUBLIC', bucket_name: PUBLIC }
    ],
    triggers: { crons: ['*/5 * * * *'] }
  }
}

export function redactSetupDiagnostic(output, env = process.env) {
  let text = String(output || '')
  const secrets = Object.entries(env)
    .filter(
      ([key, value]) => /TOKEN|KEY|SECRET/i.test(key) && typeof value === 'string' && value.length
    )
    .map(([, value]) => value)
    .sort((left, right) => right.length - left.length)
  for (const secret of secrets) text = text.replaceAll(secret, '[凭据已隐藏]')
  text = text
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [凭据已隐藏]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, url =>
      url.replace(/\?.*$/, '?[查询已隐藏]').replace(/\/\/[^/@]+:[^/@]+@/, '//[凭据已隐藏]@')
    )
    .split('\n')
    .map(line => (/"[^"]*(?:TOKEN|KEY|SECRET)[^"]*"\s*:/i.test(line) ? '[敏感配置行已隐藏]' : line))
    .join('\n')
  return text.slice(-1200)
}

export function executeSetupCommand(
  command,
  args,
  { input, env = process.env, cwd = process.cwd(), stage = '本地命令', sensitiveValues = [] } = {}
) {
  const result = spawnSync(command, args, {
    input,
    env,
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 600000
  })
  if (result.error || result.status !== 0) {
    const redactions = {
      ...env,
      ...Object.fromEntries(sensitiveValues.map((value, index) => [`SETUP_SECRET_${index}`, value]))
    }
    const diagnostic = redactSetupDiagnostic(
      result.stderr || result.stdout || result.error?.code || '',
      redactions
    )
    throw new Error(
      `${stage}失败（退出码${result.status ?? 'unknown'}）${diagnostic ? `：\n${diagnostic}` : ''}`
    )
  }
  return result.stdout
}

export async function setupVideoService({
  env = process.env,
  fetchImpl = fetch,
  run = executeSetupCommand,
  root = process.cwd()
} = {}) {
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_REPOSITORY !== GALLERY_REPOSITORY
  )
    throw new Error('服务配置仅允许从gallery受信main手动执行')
  const required = [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_R2_ACCESS_KEY',
    'CLOUDFLARE_R2_SECRET_KEY',
    'VIDEO_CONFIG_TOKEN',
    'VIDEO_SETUP_TEMP_DIR',
    'STUDIO_REF'
  ]
  for (const key of required) if (!env[key]) throw new Error(`缺少部署配置：${key}`)
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID) || !/^[a-f0-9]{40}$/.test(env.STUDIO_REF))
    throw new Error('Cloudflare账户或Studio完整SHA格式无效')
  const actualRef = run('git', ['rev-parse', 'HEAD'], { cwd: root }).trim()
  if (actualRef !== env.STUDIO_REF) throw new Error('Studio checkout与批准的完整SHA不一致')
  const origins = parseAllowedOrigins(env.ALLOWED_ORIGINS)
  const enable = env.ENABLE_CONSUMERS === 'true'
  const scratch = path.resolve(env.VIDEO_SETUP_TEMP_DIR)
  if (
    !env.RUNNER_TEMP ||
    !scratch.startsWith(`${path.resolve(env.RUNNER_TEMP)}${path.sep}`) ||
    !path.basename(scratch).startsWith('video-service-setup.')
  )
    throw new Error('临时配置必须位于本次runner专用目录')
  const account = env.CLOUDFLARE_ACCOUNT_ID
  const ghEnvironment = { ...env, GH_TOKEN: env.VIDEO_CONFIG_TOKEN }
  const cfBase = `https://api.cloudflare.com/client/v4/accounts/${account}`
  async function request(
    url,
    token,
    { method = 'GET', body, allow404 = false, stage = '配置API' } = {}
  ) {
    let response
    try {
      response = await fetchImpl(url, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(120000),
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    } catch {
      throw new Error(`${stage}网络请求失败，未输出请求地址或凭据`)
    }
    if (allow404 && response.status === 404) return null
    const data = await response.json().catch(() => null)
    if (!response.ok || !data || data.success === false) {
      const codes = (Array.isArray(data?.errors) ? data.errors : [])
        .map(error => error?.code)
        .filter(code => /^\d+$/.test(String(code)))
      throw new Error(
        `${stage}请求失败（HTTP ${response.status}${codes.length ? `，错误码${codes.join(',')}` : ''}），未输出响应正文`
      )
    }
    return data
  }
  const cf = (route, options = {}) => {
    const stage = route.startsWith('/d1/database')
      ? options.method === 'POST'
        ? 'Cloudflare D1创建'
        : 'Cloudflare D1列表'
      : route.endsWith('/cors')
        ? options.method === 'PUT'
          ? 'Cloudflare 暂存CORS合并'
          : 'Cloudflare 暂存CORS读取'
        : route.startsWith('/r2/buckets')
          ? options.method === 'POST'
            ? 'Cloudflare 暂存桶创建'
            : 'Cloudflare R2桶列表'
          : 'Cloudflare Worker子域读取'
    return request(`${cfBase}${route}`, env.CLOUDFLARE_API_TOKEN, { ...options, stage })
  }
  const gh = route =>
    request(`https://api.github.com/repos/${route}`, env.VIDEO_CONFIG_TOKEN, {
      stage: route.includes('/actions/variables/')
        ? 'GitHub 消费者开关读取'
        : route.includes('/runs?')
          ? 'GitHub 视频Runner列表'
          : 'GitHub Gallery部署工作流读取'
    })
  const variable = (name, value) =>
    run('gh', ['variable', 'set', name, '--body', value, '--repo', WORKFLOW_REPOSITORY], {
      env: ghEnvironment
    })
  const wrangler = (stage, args, sensitiveValues = []) =>
    run('npx', ['--yes', 'wrangler@4.160.1', ...args], {
      env: { ...env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
      cwd: root,
      stage,
      sensitiveValues
    })

  async function confirmConsumersDisabled() {
    // 写入可能已成功但响应丢失，因此最终以独立读取结果确认。
    try {
      variable('VIDEO_INGEST_ENABLED', 'false')
    } catch {
      /* 仍继续读回核验。 */
    }
    const current = await gh(`${WORKFLOW_REPOSITORY}/actions/variables/VIDEO_INGEST_ENABLED`)
    return current.value === 'false'
  }

  try {
    // 先关闭新任务消费，再确认没有仍在运行的旧Runner，避免服务密钥轮换打断任务。
    variable('VIDEO_INGEST_ENABLED', 'false')
    for (const workflow of ['video-process.yml', 'video-publish.yml']) {
      for (const status of ['in_progress', 'queued', 'waiting', 'pending', 'requested']) {
        const data = await gh(
          `${WORKFLOW_REPOSITORY}/actions/workflows/${workflow}/runs?status=${status}&per_page=1`
        )
        if (!Array.isArray(data.workflow_runs) || data.workflow_runs.length)
          throw new Error('视频Runner仍在运行或排队，请待完成后重新配置')
      }
    }
    const galleryWorkflow = await gh(`${GALLERY_REPOSITORY}/actions/workflows/deploy.yml`)
    if (galleryWorkflow.state !== 'active') throw new Error('gallery部署工作流尚未启用')

    const databases = []
    for (let page = 1; ; page++) {
      const data = await cf(`/d1/database?per_page=100&page=${page}`)
      if (!Array.isArray(data.result)) throw new Error('D1列表响应无效')
      databases.push(...data.result)
      if (page >= (data.result_info?.total_pages || 1)) break
      if (page > 100) throw new Error('D1分页异常')
    }
    let database = findSetupResource('d1', DATABASE, { result: databases })
    if (!database) {
      const created = await cf('/d1/database', { method: 'POST', body: { name: DATABASE } })
      database = findSetupResource('d1', DATABASE, { result: [created.result] })
      if (!database) throw new Error('新独立D1返回结果不匹配')
    }
    const buckets = []
    let cursor = ''
    const cursors = new Set()
    do {
      const data = await cf(
        `/r2/buckets?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      )
      if (!Array.isArray(data.result?.buckets)) throw new Error('R2桶列表响应无效')
      buckets.push(...data.result.buckets)
      cursor = data.result.cursor || ''
      if (cursor && cursors.has(cursor)) throw new Error('R2分页异常')
      cursors.add(cursor)
    } while (cursor)
    if (!buckets.some(bucket => bucket.name === PUBLIC))
      throw new Error('既有正式wallpaper-images桶不存在，拒绝创建或替换')
    if (!findSetupResource('r2', STAGING, { result: { buckets } })) {
      const created = await cf('/r2/buckets', { method: 'POST', body: { name: STAGING } })
      if (created.result?.name !== STAGING) throw new Error('新暂存桶返回结果不匹配')
    }
    const previous = await cf(`/r2/buckets/${STAGING}/cors`, { allow404: true })
    const cors = mergeStagingCors(previous?.result || { rules: [] }, origins)
    await cf(`/r2/buckets/${STAGING}/cors`, { method: 'PUT', body: cors })

    const configPath = path.join(scratch, 'wrangler.video.setup.json')
    const secretsPath = path.join(scratch, 'worker-secrets.json')
    fs.writeFileSync(configPath, JSON.stringify(createSetupConfig(root, database.uuid, origins)), {
      mode: 0o600
    })
    const serviceToken = crypto.randomBytes(48).toString('base64url')
    fs.writeFileSync(
      secretsPath,
      JSON.stringify({
        R2_ACCOUNT_ID: account,
        R2_ACCESS_KEY_ID: env.CLOUDFLARE_R2_ACCESS_KEY,
        R2_SECRET_ACCESS_KEY: env.CLOUDFLARE_R2_SECRET_KEY,
        VIDEO_SERVICE_TOKEN: serviceToken,
        GITHUB_DISPATCH_TOKEN: env.VIDEO_CONFIG_TOKEN
      }),
      { mode: 0o600 }
    )
    try {
      wrangler('独立D1迁移', [
        'd1',
        'migrations',
        'apply',
        DATABASE,
        '--remote',
        '--config',
        configPath
      ])
      // 先发布代码再批量配置secrets；Actions gate保持关闭，任何失败均不启用消费者。
      wrangler('Worker部署', ['deploy', '--config', configPath])
      wrangler(
        'Worker密钥写入',
        ['secret', 'bulk', secretsPath, '--config', configPath],
        [serviceToken]
      )
      run('gh', ['secret', 'set', 'VIDEO_SERVICE_TOKEN', '--repo', WORKFLOW_REPOSITORY], {
        input: serviceToken,
        env: ghEnvironment
      })
      const subdomain = (await cf('/workers/subdomain')).result?.subdomain
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain || ''))
        throw new Error('Worker账户公开子域无效')
      const url = `https://${WORKER}.${subdomain}.workers.dev`
      const signedEnv = {
        R2_ACCOUNT_ID: account,
        R2_ACCESS_KEY_ID: env.CLOUDFLARE_R2_ACCESS_KEY,
        R2_SECRET_ACCESS_KEY: env.CLOUDFLARE_R2_SECRET_KEY
      }
      for (const bucket of [STAGING, PUBLIC]) {
        const signed = await presign(
          signedEnv,
          bucket,
          `video-setup-probe-${crypto.randomUUID()}`,
          'HEAD',
          {},
          60
        )
        let response
        try {
          response = await fetchImpl(signed, {
            method: 'HEAD',
            redirect: 'error',
            signal: AbortSignal.timeout(30000)
          })
        } catch {
          throw new Error('R2只读签名HEAD自检网络失败')
        }
        if (![200, 404].includes(response.status))
          throw new Error(
            `R2签名HEAD自检失败（HTTP ${response.status}）：现有密钥可能仅覆盖正式桶，请人工配置同时覆盖暂存/正式两桶的密钥；不读取或自动扩大既有授权`
          )
      }
      let healthy = false
      for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 5000))
        try {
          const response = await fetchImpl(`${url}/health`, {
            redirect: 'error',
            signal: AbortSignal.timeout(30000)
          })
          const data = await response.json()
          healthy = response.ok && data.service === 'video-ingest' && data.configured === true
        } catch {
          healthy = false
        }
        if (healthy) break
      }
      if (!healthy) throw new Error('Worker健康检查未通过，消费者保持关闭')
      const jobs = await fetchImpl(`${url}/video/jobs`, {
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${env.VIDEO_CONFIG_TOKEN}` }
      })
      const jobList = await jobs.json().catch(() => null)
      if (!jobs.ok || !Array.isArray(jobList?.jobs))
        throw new Error(
          `业务只读自检失败（HTTP ${jobs.status}）：请核对专用token图床写权限和D1迁移；消费者保持关闭`
        )
      const internal = await fetchImpl(`${url}/internal/video/jobs/setup-probe/source`, {
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: { 'X-Video-Service-Token': serviceToken }
      })
      if (internal.status !== 404) throw new Error('内部服务鉴权/路由自检未通过，消费者保持关闭')
      for (const origin of origins) {
        const response = await fetchImpl(`${url}/video/jobs`, {
          method: 'OPTIONS',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'authorization'
          }
        })
        if (
          response.status !== 204 ||
          response.headers.get('Access-Control-Allow-Origin') !== origin
        )
          throw new Error('Worker来源自检未通过，消费者保持关闭')
      }
      variable('VIDEO_API_URL', url)
      variable('VIDEO_GALLERY_WORKFLOW', 'deploy.yml')
      if (enable) variable('VIDEO_INGEST_ENABLED', 'true')
      // 返回值不含密钥、签名URL或响应正文，允许写入公开运行摘要。
      return {
        workerUrl: url,
        databaseId: database.uuid,
        stagingBucket: STAGING,
        publicBucket: PUBLIC
      }
    } finally {
      for (const file of [secretsPath, configPath]) if (fs.existsSync(file)) fs.rmSync(file)
    }
  } catch (failure) {
    let disabled = false
    try {
      disabled = await confirmConsumersDisabled()
    } catch {
      /* 不能把网络失败当成已关闭。 */
    }
    if (!disabled)
      throw new Error(
        `${failure.message}；无法确认消费者已关闭，必须人工确认执行器仓库 VIDEO_INGEST_ENABLED=false`
      )
    throw new Error(`${failure.message}；消费者已关闭并读回确认`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  setupVideoService()
    .then(result => {
      console.log(JSON.stringify(result))
      if (process.env.GITHUB_STEP_SUMMARY)
        fs.appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `视频Worker公开地址：${result.workerUrl}\n\nD1：${result.databaseId}\n\n暂存桶：${result.stagingBucket}\n\n正式桶（仅复用）：${result.publicBucket}\n`
        )
    })
    .catch(error => {
      console.error(error.message)
      process.exitCode = 1
    })
}
