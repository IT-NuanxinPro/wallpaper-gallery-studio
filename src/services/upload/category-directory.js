import { CATEGORIES } from '@/config/categories'
import { SUBCATEGORIES } from '@/config/subcategories'
import { githubService } from '@/services/github'
import { resolveAppConfig } from '@/app/config/app-config'
import { createGitHubUploadWorkspaceRepository } from '@/features/upload-workspace/infrastructure/create-github-upload-workspace-repository'
import { createCategoryTreeFromManifest } from '@/features/upload-workspace/domain/upload-workspace-manifest'
import { useConfigStore } from '@/stores/config'

const SERIES_KEYS = ['desktop', 'mobile', 'avatar']
const CACHE_TTL = 5 * 60 * 1000

const categoryDirectoryCache = new Map()

function sortCategoryNames(items = []) {
  return [...items].sort((first, second) =>
    first.localeCompare(second, 'zh-Hans-CN', {
      numeric: true,
      sensitivity: 'base'
    })
  )
}

export function getFallbackUploadCategoryTree() {
  const result = {}

  SERIES_KEYS.forEach(seriesKey => {
    const secondary = (CATEGORIES[seriesKey]?.subcategories || []).map(item => item.value)
    const third = {}

    secondary.forEach(category => {
      const thirdCategories = SUBCATEGORIES[seriesKey]?.[category] || []
      if (thirdCategories.length > 0) {
        third[category] = [...thirdCategories]
      }
    })

    result[seriesKey] = {
      secondary,
      third
    }
  })

  return result
}

function cloneCategoryTree(tree) {
  return JSON.parse(JSON.stringify(tree))
}

function emptyCategoryTree() {
  return Object.fromEntries(SERIES_KEYS.map(series => [series, { secondary: [], third: {} }]))
}

export function mergeCategoryTrees(...trees) {
  const result = emptyCategoryTree()
  for (const series of SERIES_KEYS) {
    result[series].secondary = sortCategoryNames([
      ...new Set(trees.flatMap(tree => tree?.[series]?.secondary || []))
    ])
    for (const category of result[series].secondary) {
      result[series].third[category] = sortCategoryNames([
        ...new Set(trees.flatMap(tree => tree?.[series]?.third?.[category] || []))
      ])
    }
  }
  return result
}

async function fetchDirectoryTree({ owner, repo, branch, wallpaperRoot }, force) {
  // 一次读取 Git 树，避免每个分类单独请求；大仓库截断时再逐层读取。
  try {
    const response = await githubService.getTree(owner, repo, branch)
    if (!response.truncated && Array.isArray(response.tree)) {
      const result = emptyCategoryTree()
      for (const item of response.tree) {
        if (item.type !== 'tree' || !item.path.startsWith(`${wallpaperRoot}/`)) continue
        const [series, secondary, third, ...rest] = item.path
          .slice(wallpaperRoot.length + 1)
          .split('/')
        if (!SERIES_KEYS.includes(series) || !secondary || rest.length) continue
        const target = result[series]
        if (!target.secondary.includes(secondary)) target.secondary.push(secondary)
        if (third) (target.third[secondary] ||= []).push(third)
      }
      return result
    }
  } catch (error) {
    console.warn('[CategoryDirectory] Git tree unavailable, reading directories:', error)
  }

  const result = emptyCategoryTree()
  for (const series of SERIES_KEYS) {
    let contents
    try {
      contents = await githubService.getContents(
        owner,
        repo,
        `${wallpaperRoot}/${series}`,
        branch,
        {
          forceRefresh: force
        }
      )
    } catch (error) {
      if (error.status === 404 || error.type === 'NOT_FOUND') continue
      throw error
    }
    const target = result[series]
    target.secondary = contents.filter(item => item.type === 'dir').map(item => item.name)
    for (const secondary of target.secondary) {
      const children = await githubService.getContents(
        owner,
        repo,
        `${wallpaperRoot}/${series}/${secondary}`,
        branch,
        { forceRefresh: force }
      )
      target.third[secondary] = children.filter(item => item.type === 'dir').map(item => item.name)
    }
  }
  return result
}

async function fetchUploadCategoryTree(config, force = false) {
  const appConfig = resolveAppConfig({ repository: config })
  const { owner, repo, branch } = appConfig.repository

  if (!owner || !repo || !branch) {
    return { tree: getFallbackUploadCategoryTree(), cacheable: false }
  }

  const repository = createGitHubUploadWorkspaceRepository({
    githubClient: githubService,
    getRepositoryConfig: () => config,
    getAppConfig: () => appConfig
  })

  const [manifestResult, directoryResult] = await Promise.allSettled([
    repository.getCategoryManifest({ forceRefresh: force }),
    fetchDirectoryTree(appConfig.repository, force)
  ])
  const manifestTree =
    manifestResult.status === 'fulfilled' && manifestResult.value
      ? createCategoryTreeFromManifest(manifestResult.value)
      : null
  if (manifestResult.status === 'rejected') {
    console.warn('[CategoryDirectory] Failed to load manifest:', manifestResult.reason)
  }
  if (directoryResult.status === 'rejected') {
    console.warn('[CategoryDirectory] Using fallback categories:', directoryResult.reason)
    return { tree: manifestTree || getFallbackUploadCategoryTree(), cacheable: false }
  }
  return {
    tree: mergeCategoryTrees(manifestTree, directoryResult.value),
    cacheable: manifestResult.status === 'fulfilled'
  }
}

export async function getUploadCategoryTree({ force = false } = {}) {
  const config = { ...useConfigStore().config }
  const key = JSON.stringify(resolveAppConfig({ repository: config }).repository)
  const cached = categoryDirectoryCache.get(key)
  if (!force && cached?.tree && Date.now() - cached.timestamp < CACHE_TTL) {
    return cloneCategoryTree(cached.tree)
  }
  if (cached?.pending && (!force || cached.force)) {
    return cached.pending.then(cloneCategoryTree)
  }

  const entry = { force }
  categoryDirectoryCache.set(key, entry)
  entry.pending = fetchUploadCategoryTree(config, force)
    .then(({ tree, cacheable }) => {
      // 清缓存或强制刷新后，旧请求不能覆盖新结果。
      if (categoryDirectoryCache.get(key) === entry) {
        if (cacheable) {
          entry.tree = cloneCategoryTree(tree)
          entry.timestamp = Date.now()
        } else {
          categoryDirectoryCache.delete(key)
        }
      }
      return tree
    })
    .finally(() => {
      entry.pending = null
    })
  return entry.pending.then(cloneCategoryTree)
}

export function clearUploadCategoryTreeCache() {
  categoryDirectoryCache.clear()
}

export async function getUploadCategoryNodes(series, parent = '', options = {}) {
  const tree = await getUploadCategoryTree(options)
  const root = resolveAppConfig({ repository: useConfigStore().config }).repository.wallpaperRoot
  const names = parent ? tree[series]?.third?.[parent] || [] : tree[series]?.secondary || []
  return names.map(name => ({
    name,
    path: [root, series, parent, name].filter(Boolean).join('/'),
    type: parent ? 'l2' : 'l1',
    ...(parent ? {} : { children: [], loaded: false })
  }))
}
