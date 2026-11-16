import { fetchRepositories } from './repository-discovery'

const ROLES = ['workflow', 'frontend']
function check(signal) {
  if (signal?.aborted) throw new globalThis.DOMException('关联识别已取消', 'AbortError')
}
export async function readRepositoryFile(owner, repo, path, branch, { token, signal }) {
  const parts = [owner, repo].map(encodeURIComponent)
  const file = path.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(
    `https://api.github.com/repos/${parts.join('/')}/contents/${file}?ref=${encodeURIComponent(branch)}`,
    {
      signal,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  )
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`无法读取仓库关联（HTTP ${response.status}），请检查授权或稍后重试`)
  const content = await response.text()
  if (content.length > 1000000) throw new Error('关联配置过大，已停止读取')
  check(signal)
  return content
}
function yamlReferences(text, target) {
  const values = [
    ...(text || '').matchAll(
      /^\s*(?:IMAGE_REPO|VIDEO_DATA_REPOSITORY|repository):\s*['"]?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)['"]?\s*(?:#.*)?$/gm
    )
  ]
  return values.some(match => match[1].toLowerCase() === target.toLowerCase())
}
function scriptReferences(text, target) {
  const source = (text || '').replace(
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match, literal) => literal || ''
  )
  const values = [
    ...source.matchAll(/\brepository\s*=\s*['"]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)['"]/g)
  ]
  return values.length > 0 && values.every(match => match[1].toLowerCase() === target.toLowerCase())
}
export async function discoverRepositoryConnections({
  config,
  token,
  signal,
  list = fetchRepositories,
  read = readRepositoryFile
}) {
  check(signal)
  if (!token) throw new Error('请先登录 GitHub，再读取关联仓库')
  const missing = ROLES.filter(role => !config[role + 'Owner'] || !config[role + 'Repo'])
  const result = {
    connections: {},
    candidates: { workflow: [], frontend: [] },
    repositories: [],
    complete: true
  }
  if (!missing.length) return result
  const source = await read(
    config.owner,
    config.repo,
    '.studio/repositories.json',
    config.branch || 'main',
    { token, signal }
  )
  let manifest
  if (source) {
    try {
      manifest = JSON.parse(source)
      if (
        manifest.version !== 1 ||
        manifest.data?.owner?.toLowerCase() !== config.owner.toLowerCase() ||
        manifest.data?.repo?.toLowerCase() !== config.repo.toLowerCase()
      )
        throw new Error()
    } catch {
      throw new Error('仓库关联清单无效，请检查 .studio/repositories.json')
    }
  }
  for (let page = 1; page <= 20; page++) {
    const response = await list({ token, page, signal })
    result.repositories.push(...response.repositories)
    check(signal)
    if (!response.hasMore) break
    if (page === 20) result.complete = false
  }
  result.repositories = [
    ...new Map(result.repositories.map(repo => [repo.fullName.toLowerCase(), repo])).values()
  ]
  const target = config.owner + '/' + config.repo
  for (const role of missing) {
    if (manifest?.[role]) {
      const ref = manifest[role]
      const match = result.repositories.find(
        repo =>
          repo.fullName.toLowerCase() === `${ref.owner}/${ref.repo}`.toLowerCase() && !repo.archived
      )
      if (!match) throw new Error('关联清单中的仓库不可访问或已归档，请检查 GitHub 授权')
      result.candidates[role] = [match]
      result.connections[role + 'Owner'] = match.owner
      result.connections[role + 'Repo'] = match.name
    }
  }
  const inspect = result.repositories.filter(
    repo =>
      !repo.archived &&
      repo.owner.toLowerCase() === config.owner.toLowerCase() &&
      /wallpaper|workflow|pipeline|gallery/i.test(repo.name)
  )
  if (inspect.length > 40) result.complete = false
  for (const repo of inspect.slice(0, 40)) {
    check(signal)
    const file = path => read(repo.owner, repo.name, path, repo.defaultBranch, { token, signal })
    if (
      missing.includes('workflow') &&
      !manifest?.workflow &&
      /workflow|pipeline/i.test(repo.name)
    ) {
      const content = await file('.github/workflows/process-wallpapers.yml')
      if (yamlReferences(content, target)) result.candidates.workflow.push(repo)
    }
    if (
      missing.includes('frontend') &&
      !manifest?.frontend &&
      /gallery/i.test(repo.name) &&
      !/studio|workflow/i.test(repo.name)
    ) {
      const content = await file('.github/workflows/deploy.yml')
      if (!content) continue
      const script = content.includes('scripts/prepare-deploy-data.js')
        ? await file('scripts/prepare-deploy-data.js')
        : null
      if (yamlReferences(content, target) || scriptReferences(script, target))
        result.candidates.frontend.push(repo)
    }
  }
  check(signal)
  for (const role of missing) {
    if (result.complete && result.candidates[role].length === 1) {
      const repo = result.candidates[role][0]
      result.connections[role + 'Owner'] = repo.owner
      result.connections[role + 'Repo'] = repo.name
    }
  }
  return result
}
