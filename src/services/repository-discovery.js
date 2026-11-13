export async function fetchRepositories({ token, page = 1, signal }) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('请先登录 GitHub')
  if (!Number.isInteger(page) || page < 1) throw new Error('仓库分页无效')
  const params = new URLSearchParams({
    visibility: 'all',
    affiliation: 'owner,collaborator,organization_member',
    sort: 'pushed',
    direction: 'desc',
    per_page: '100',
    page: String(page)
  })
  let response
  try {
    response = await fetch(`https://api.github.com/user/repos?${params}`, {
      signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
  } catch {
    if (signal?.aborted) throw Object.assign(new Error('仓库读取已取消'), { name: 'AbortError' })
    throw new Error('无法连接 GitHub，请检查网络后重试')
  }
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? 'GitHub 登录已失效，请重新登录'
        : response.status === 403
          ? 'GitHub 暂时拒绝仓库读取，请检查授权范围、组织授权或访问频率'
          : `仓库列表读取失败（HTTP ${response.status}），请重试`
    )
  }
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('GitHub 返回了无效仓库列表')
  }
  if (signal?.aborted) throw Object.assign(new Error('仓库读取已取消'), { name: 'AbortError' })
  if (!Array.isArray(data)) throw new Error('GitHub 返回了无效仓库列表')
  const repositories = data
    .filter(
      repo =>
        Number.isInteger(repo.id) &&
        typeof repo.name === 'string' &&
        typeof repo.owner?.login === 'string'
    )
    .map(repo => ({
      id: repo.id,
      owner: repo.owner.login,
      name: repo.name,
      fullName: `${repo.owner.login}/${repo.name}`,
      defaultBranch: repo.default_branch || 'main',
      private: !!repo.private,
      archived: !!repo.archived,
      permission:
        repo.permissions?.admin || repo.permissions?.maintain
          ? 'admin'
          : repo.permissions?.push
            ? 'write'
            : 'read'
    }))
  return { repositories, hasMore: /rel="next"/.test(response.headers.get('Link') || '') }
}
