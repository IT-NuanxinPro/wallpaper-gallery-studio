import { localStorageService } from '@/services/localStorage'
import { githubService } from '@/services/github'
import { useConfigStore } from '@/stores/config'
import { resolveAppConfig } from '@/app/config/app-config'
import { createUploadWorkspaceService } from '../application/create-upload-workspace-service'
import { createGitHubUploadWorkspaceRepository } from '../infrastructure/create-github-upload-workspace-repository'

import {
  clearUploadCategoryTreeCache,
  getUploadCategoryNodes
} from '@/services/upload/category-directory'

export function useUploadWorkspaceInfrastructure() {
  const configStore = useConfigStore()

  function getAppConfig() {
    return resolveAppConfig({
      repository: configStore.config
    })
  }

  const repository = createGitHubUploadWorkspaceRepository({
    githubClient: githubService,
    getRepositoryConfig: () => configStore.config,
    getAppConfig
  })

  const service = createUploadWorkspaceService({ repository })

  function clearCategoryCaches() {
    clearUploadCategoryTreeCache()
    repository.clearDirectoryCache()
  }

  async function loadRootCategories(series, forceRefresh = false) {
    return getUploadCategoryNodes(series, '', { force: forceRefresh })
  }

  async function loadChildCategories(path, forceRefresh = false) {
    const parts = path.split('/').filter(Boolean)
    const series = parts.at(-2)
    return getUploadCategoryNodes(series, parts.at(-1), { force: forceRefresh })
  }

  async function refreshStats() {
    return service.loadStats()
  }

  async function createCategory({ series, selectedL1, form }) {
    const result = await service.createCategory({
      series,
      parentCategory: form.level === 'l2' ? selectedL1 : '',
      name: form.name,
      level: form.level
    })
    clearCategoryCaches()
    return result
  }

  async function inspectCategory(path) {
    return service.inspectCategory(path)
  }

  async function deleteCategory(path) {
    const result = await service.deleteCategory(path)
    clearCategoryCaches()
    return result
  }

  function persistSuccessfulUploads(results, files, fallbackSeries) {
    if (!localStorageService.isInitialized()) {
      return
    }

    const successFiles = results
      .filter(result => result.success)
      .map(result => {
        const file = files.find(item => item.id === result.id)
        return {
          fileName: file?.name || result.id,
          series: file?.targetSeries || fallbackSeries,
          category: file?.targetPath || '',
          size: file?.size || 0
        }
      })

    if (successFiles.length > 0) {
      localStorageService.addUploadRecords(successFiles)
    }
  }

  async function refreshWorkflowPending(workflowStore) {
    const { owner, repo, branch } = configStore.config
    await workflowStore.refreshPendingInfo(owner, repo, branch)

    if (workflowStore.pendingInfo.pendingCount === 0) {
      setTimeout(() => {
        workflowStore.refreshPendingInfo(owner, repo, branch)
      }, 2000)
    }
  }

  return {
    repository,
    clearCategoryCaches,
    loadRootCategories,
    loadChildCategories,
    refreshStats,
    createCategory,
    inspectCategory,
    deleteCategory,
    persistSuccessfulUploads,
    refreshWorkflowPending
  }
}
