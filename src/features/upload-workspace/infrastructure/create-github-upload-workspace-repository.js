import { normalizeUploadWorkspaceManifest } from '../domain/upload-workspace-manifest'

const DEFAULT_SERIES = ['desktop', 'mobile', 'avatar']

export function createGitHubUploadWorkspaceRepository({
  githubClient,
  getRepositoryConfig,
  getAppConfig
}) {
  function getContext() {
    const repositoryConfig = getRepositoryConfig()
    const appConfig = getAppConfig()

    return {
      owner: repositoryConfig.owner,
      repo: repositoryConfig.repo,
      branch: repositoryConfig.branch || appConfig.repository.branch,
      wallpaperRoot: appConfig.repository.wallpaperRoot,
      metadataPendingDir: appConfig.upload.metadataPendingDir
    }
  }

  async function getDirectoryContents(path, options = {}) {
    const { owner, repo, branch } = getContext()
    return githubClient.getContents(owner, repo, path, branch, options)
  }

  return {
    githubClient,
    getContext,
    getRateLimit() {
      return githubClient.getRateLimit()
    },
    clearDirectoryCache() {
      githubClient.clearDirectoryCache?.()
    },
    getDirectoryContents,
    async getSeriesDirectories(series, options = {}) {
      const { wallpaperRoot } = getContext()
      return getDirectoryContents(`${wallpaperRoot}/${series}`, options)
    },
    async getCategoryManifest(options = {}) {
      const { owner, repo, branch } = getContext()
      const manifestPath = getAppConfig().repository.manifestPath

      if (!manifestPath) {
        return null
      }

      try {
        const file = await githubClient.getContents(owner, repo, manifestPath, branch, options)
        const raw = typeof file.content === 'string' ? file.content.replace(/\n/g, '') : ''
        const bytes = Uint8Array.from(atob(raw), character => character.charCodeAt(0))
        const content = new globalThis.TextDecoder().decode(bytes)
        return normalizeUploadWorkspaceManifest(JSON.parse(content))
      } catch (error) {
        if (error.status === 404 || error.type === 'NOT_FOUND') {
          return null
        }
        if (error.type === 'MANIFEST_INVALID') {
          throw error
        }
        throw error
      }
    },
    async checkFileExists(path) {
      const { owner, repo, branch } = getContext()
      return githubClient.checkFileExists(owner, repo, path, branch)
    },
    async uploadImage(path, file, message) {
      const { owner, repo, branch } = getContext()
      return githubClient.uploadImage(owner, repo, path, file, message, branch)
    },
    async createFile(path, content, message) {
      const { owner, repo, branch } = getContext()
      return githubClient.createFile(owner, repo, path, content, message, branch)
    },
    async deleteFile(path, sha, message) {
      const { owner, repo, branch } = getContext()
      return githubClient.deleteFile(owner, repo, path, sha, message, branch)
    },
    async createCategoryPlaceholder({ series, parentCategory = '', name, level = 'l1' }) {
      const { wallpaperRoot } = getContext()
      let categoryPath = `${wallpaperRoot}/${series}`

      if (level === 'l2' && parentCategory) {
        categoryPath += `/${parentCategory}`
      }

      categoryPath += `/${name}`

      await this.createFile(`${categoryPath}/.gitkeep`, '', `Create category: ${name}`)
      return categoryPath
    },
    async waitForDirectorySync(path, { shouldExist, attempts = 8, delay = 700 } = {}) {
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          await getDirectoryContents(path, { forceRefresh: true })
          if (shouldExist) {
            return true
          }
        } catch (error) {
          if (!shouldExist && (error.status === 404 || error.type === 'NOT_FOUND')) {
            return true
          }
        }

        if (attempt < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }

      return false
    },
    async getCategoryCounts(seriesKeys = DEFAULT_SERIES) {
      const counts = {}

      for (const series of seriesKeys) {
        try {
          const contents = await this.getSeriesDirectories(series)
          counts[series] = contents.filter(item => item.type === 'dir').length
        } catch {
          counts[series] = 0
        }
      }

      counts.total = Object.values(counts).reduce((sum, value) => sum + value, 0)
      return counts
    }
  }
}
