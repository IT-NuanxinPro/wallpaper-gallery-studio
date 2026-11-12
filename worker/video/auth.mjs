import { ensure, HttpError } from './domain.mjs'

export async function githubRequest(env, path, options = {}, token = env.GITHUB_DISPATCH_TOKEN, request = fetch) {
  ensure(token, 'GitHub服务凭据尚未配置', 503, 'NOT_CONFIGURED')
  const response = await request(`https://api.github.com${path}`, { ...options, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'wallpaper-video-ingest', Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  if (!response.ok) throw new HttpError(response.status === 401 ? 401 : 502, 'GITHUB_REQUEST', `GitHub请求失败（${response.status}）`)
  return response.status === 204 ? null : response.json()
}
export async function authorize(request, env, githubFetch = fetch) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]
  ensure(token, '请先登录GitHub', 401, 'UNAUTHORIZED')
  const [user, repo] = await Promise.all([
    githubRequest(env, '/user', {}, token, githubFetch),
    githubRequest(env, `/repos/${env.GITHUB_OWNER}/${env.IMAGE_REPO}`, {}, token, githubFetch)
  ])
  ensure(repo.permissions?.push || repo.permissions?.admin || repo.permissions?.maintain, '当前账号没有目标仓库写权限', 403, 'FORBIDDEN')
  return user.login
}
export function serviceAuthorized(request, env) {
  const supplied = request.headers.get('X-Video-Service-Token') || ''
  const expected = env.VIDEO_SERVICE_TOKEN || ''
  if (!expected || supplied.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
export async function dispatch(env, kind, request = fetch) {
  return githubRequest(env, `/repos/${env.GITHUB_OWNER}/${env.WORKFLOW_REPO}/dispatches`, { method: 'POST', body: JSON.stringify({ event_type: kind === 'publish' ? 'publish-videos' : 'process-videos', client_payload: {} }) }, env.GITHUB_DISPATCH_TOKEN, request)
}
