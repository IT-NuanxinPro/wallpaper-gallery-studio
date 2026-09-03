import { defineStore, storeToRefs } from 'pinia'
import { githubService } from '@/services/github'
import { resolveAppConfig } from '@/app/config/app-config'
import { createUploadFileLifecycleService } from '@/features/upload-workspace/application/create-upload-file-lifecycle-service'
import { createUploadSessionService } from '@/features/upload-workspace/application/create-upload-session-service'
import { createGitHubUploadWorkspaceRepository } from '@/features/upload-workspace/infrastructure/create-github-upload-workspace-repository'
import { createUploadSessionCache } from '@/features/upload-workspace/infrastructure/create-upload-session-cache'
import { useConfigStore } from './config'
import { useHistoryStore } from './history'
import { useUploadSessionStore } from './upload-session'
import { useUploadWorkspaceStore } from './upload-workspace'
import { useCredentialsStore } from './credentials'
import { useAiTasksStore } from './ai-tasks'
import { AI_PROVIDERS } from '@/services/ai/core'
import { previewManager } from '@/utils/previewManager'
import { hashWorker } from '@/utils/hashWorker'
import { imageCompressor } from '@/utils/imageCompressor'
import {
  analyzeImage as classifierAnalyze,
  CLASSIFIER_CONFIG,
  getModelList,
  getRecommendedModel
} from '@/services/ai/classifier'

// 允许的文件类型
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const UPLOAD_DELAY = 500 // 上传间隔 500ms，避免触发限流
const BATCH_WARNING_THRESHOLD = 50 // 超过 50 张提示警告

/**
 * Upload facade store
 *
 * 这是上传页的兼容层：
 * - 工作台选择状态由 `useUploadWorkspaceStore()` 持有
 * - 上传会话状态由 `useUploadSessionStore()` 持有
 * - 文件准备 / AI 分析 / 上传 / metadata 编排由 feature services 处理
 *
 * 现阶段保留该 facade 是为了避免一次性修改所有页面与组件调用点。
 * 新代码应优先面向 workspace/session store 与 upload-workspace feature services。
 */
export const useUploadStore = defineStore('upload', () => {
  const historyStore = useHistoryStore()
  const workspaceStore = useUploadWorkspaceStore()
  const sessionStore = useUploadSessionStore()
  const repository = createGitHubUploadWorkspaceRepository({
    githubClient: githubService,
    getRepositoryConfig: () => useConfigStore().config,
    getAppConfig: () =>
      resolveAppConfig({
        repository: useConfigStore().config
      })
  })
  const sessionCache = createUploadSessionCache()
  const uploadFileLifecycleService = createUploadFileLifecycleService({
    sessionCache,
    classifierAnalyze,
    imageCompressor,
    previewManager,
    hashComputer: async file => computeFileHash(file)
  })
  const uploadSessionService = createUploadSessionService({
    repository,
    sessionCache,
    historyStore
  })

  const { uploadMode, selectedModelKey, series, categoryL1, categoryL2, targetPath } =
    storeToRefs(workspaceStore)
  const {
    files,
    uploading,
    currentFileIndex,
    aiAnalyzing,
    aiAnalyzingCount,
    metadataStatus,
    metadataError,
    metadataPendingPath,
    metadataRetryFileIds,
    totalProgress,
    pendingFiles,
    uploadingFiles,
    successFiles,
    errorFiles
  } = storeToRefs(sessionStore)

  // 计算属性
  function getUploadModelList(credentialsStore = useCredentialsStore()) {
    const providerPriority = {
      [AI_PROVIDERS.ZHIPU]: 0,
      [AI_PROVIDERS.GROQ]: 1,
      [AI_PROVIDERS.SUB2API]: 2
    }

    const supportedProviders = [AI_PROVIDERS.SUB2API, AI_PROVIDERS.ZHIPU, AI_PROVIDERS.GROQ]
    const availableProviderKeys = credentialsStore.availableProviders
      .map(provider => provider.key)
      .filter(provider => supportedProviders.includes(provider))
    const visibleProviderKeys = new Set([AI_PROVIDERS.SUB2API, ...availableProviderKeys])

    return getModelList()
      .filter(model => {
        if (availableProviderKeys.length > 0) {
          return visibleProviderKeys.has(model.provider)
        }
        return supportedProviders.includes(model.provider)
      })
      .sort((a, b) => {
        const providerDiff =
          (providerPriority[a.provider] ?? 99) - (providerPriority[b.provider] ?? 99)
        if (providerDiff !== 0) return providerDiff
        if (a.recommended !== b.recommended) return Number(b.recommended) - Number(a.recommended)
        return 0
      })
  }

  function getPreferredUploadModel(credentialsStore = useCredentialsStore()) {
    const availableModels = getUploadModelList(credentialsStore)
    return availableModels[0] || getRecommendedModel(AI_PROVIDERS.ZHIPU)
  }

  // 生成唯一 ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
  }

  // 获取文件扩展名
  function getExtension(filename) {
    return filename.split('.').pop().toLowerCase()
  }

  // 验证文件
  function validateFile(file) {
    // 检查文件类型
    const ext = getExtension(file.name)
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `不支持的文件格式: ${ext}` }
    }

    // 检查 MIME 类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { valid: false, error: `不支持的文件类型: ${file.type}` }
    }

    // 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `文件大小超过限制 (最大 25MB)` }
    }

    return { valid: true }
  }

  // ✅ P2优化：添加文件时自动压缩大图片
  async function addFiles(newFiles) {
    const validFiles = await uploadFileLifecycleService.prepareFiles(newFiles, {
      uploadMode: uploadMode.value,
      target: {
        series: series.value,
        l1: categoryL1.value,
        l2: categoryL2.value
      },
      validateFile,
      generateId
    })

    sessionStore.appendFiles(validFiles)

    await Promise.all(
      validFiles.map(file =>
        file.aiMetadata ? setFileAiMetadata(file.id, file.aiMetadata) : Promise.resolve()
      )
    )

    // AI 模式下自动触发分析
    if (uploadMode.value === 'ai' && validFiles.length > 0) {
      // 等任务记录落盘后再返回，实际 AI 队列继续在后台运行。
      await triggerAiAnalysis(validFiles)
    }

    return validFiles
  }

  // AI 智能分析：为文件自动生成分类
  async function triggerAiAnalysis(filesToAnalyze) {
    const credentialsStore = useCredentialsStore()

    const availableModels = getUploadModelList(credentialsStore)
    let selectedModel = availableModels.find(model => model.key === selectedModelKey.value)

    if (!selectedModel) {
      selectedModel = getPreferredUploadModel(credentialsStore)
      if (selectedModel?.key) {
        selectedModelKey.value = selectedModel.key
      }
    }

    const provider = selectedModel?.provider || credentialsStore.defaultProvider
    const credentials = credentialsStore.getCredentialsByProvider(provider)
    const hasProviderCredentials = credentialsStore.availableProviders.some(
      availableProvider => availableProvider.key === provider
    )

    if (!hasProviderCredentials) {
      // 仍然创建并持久化 queued 任务；配置凭证后可直接续跑。
      console.warn(`AI 分析：未找到 ${provider} 的凭证，任务将保留在队列中`)
    }

    const modelKey = selectedModel?.key || CLASSIFIER_CONFIG.defaultModel

    // sub2api 由账号池调度，适度提高并发以减少批量识图总耗时。
    const concurrency = provider === AI_PROVIDERS.SUB2API ? 4 : 3

    const filesNeedingAnalysis = filesToAnalyze
      .map(file => files.value.find(candidate => candidate.id === file.id))
      .filter(file => file && !file.aiMetadata)

    if (filesNeedingAnalysis.length === 0) {
      aiAnalyzing.value = false
      aiAnalyzingCount.value = 0
      return
    }

    aiAnalyzing.value = true
    aiAnalyzingCount.value = filesNeedingAnalysis.length
    try {
      const result = await uploadFileLifecycleService.analyzeFiles(filesNeedingAnalysis, {
        series: series.value,
        provider,
        credentials,
        modelKey,
        concurrency
      })
      result.completion.then(
        () => {
          aiAnalyzingCount.value = 0
          aiAnalyzing.value = false
        },
        error => {
          console.warn('[UploadStore] AI 任务队列执行失败:', error)
          aiAnalyzingCount.value = 0
          aiAnalyzing.value = false
        }
      )
      return result
    } catch (error) {
      aiAnalyzingCount.value = 0
      aiAnalyzing.value = false
      throw error
    }
  }

  // 更新单个文件的目标路径
  async function updateFileTarget(fileId, newSeries, l1, l2 = '') {
    const file = uploadFileLifecycleService.updateFileTarget(files.value, fileId, newSeries, l1, l2)
    if (!file) return null

    await useAiTasksStore().saveManualTarget(fileId, {
      series: newSeries,
      l1,
      l2,
      path: file.targetPath
    })
    return file
  }

  // 批量更新文件目标路径（选中的文件）
  async function updateFilesTarget(fileIds, newSeries, l1, l2 = '') {
    const updatedFiles = fileIds
      .map(fileId =>
        uploadFileLifecycleService.updateFileTarget(files.value, fileId, newSeries, l1, l2)
      )
      .filter(Boolean)

    await Promise.all(
      updatedFiles.map(file =>
        useAiTasksStore().saveManualTarget(file.id, {
          series: newSeries,
          l1,
          l2,
          path: file.targetPath
        })
      )
    )
    return updatedFiles
  }

  // 设置单个文件的 AI 元数据
  // autoApply: 是否自动应用 AI 推荐的分类到文件的 targetPath（默认 true）
  async function setFileAiMetadata(fileId, aiMetadata, autoApply = true) {
    const file = files.value.find(f => f.id === fileId)
    if (file) {
      uploadFileLifecycleService.applyAiMetadata(file, aiMetadata, autoApply)
      await useAiTasksStore().updateTaskByFileId(fileId, { result: aiMetadata })
    }
    return file || null
  }

  // 批量设置文件的 AI 元数据
  async function setFilesAiMetadata(metadataMap) {
    await Promise.all(
      Object.entries(metadataMap).map(([fileId, aiMetadata]) =>
        setFileAiMetadata(fileId, aiMetadata)
      )
    )
  }

  // 移除文件
  async function removeFile(id) {
    const index = files.value.findIndex(f => f.id === id)
    if (index > -1) {
      await sessionStore.removeFile(id)
      // 释放预览 URL（使用PreviewManager）
      previewManager.revokePreview(id)
      return true
    }
    return false
  }

  // 批量移除文件
  async function removeFiles(ids) {
    const removedCount = await sessionStore.removeFiles(ids)
    // 批量释放预览URL
    previewManager.revokePreviews(ids)
    return removedCount
  }

  // 清空所有文件
  async function clearFiles() {
    const fileIds = files.value.map(file => file.id)
    const removedCount = await sessionStore.clearFiles()
    // 释放所有预览URL
    previewManager.revokePreviews(fileIds)
    return removedCount
  }

  // 清理成功上传的文件（释放内存）
  async function clearSuccessFiles() {
    const successIds = files.value.filter(f => f.status === 'success').map(f => f.id)
    const removedCount = await sessionStore.clearSuccessFiles()
    // 批量释放预览URL
    previewManager.revokePreviews(successIds)
    return removedCount
  }

  // 检查文件是否存在
  async function checkDuplicate(filename) {
    const path = `${targetPath.value}/${filename}`

    return repository.checkFileExists(path)
  }

  // 批量检查重复文件
  async function checkDuplicates(filenames) {
    const duplicates = []

    for (const filename of filenames) {
      const path = `${targetPath.value}/${filename}`
      const exists = await repository.checkFileExists(path)
      if (exists) {
        duplicates.push(filename)
      }
    }

    return duplicates
  }

  // 计算文件内容 Hash（用于检测内容重复）
  // ✅ P1优化：使用Web Worker在后台线程计算，避免阻塞主线程
  async function computeFileHash(file) {
    try {
      return await hashWorker.computeHash(file)
    } catch (error) {
      console.error('Hash计算失败，回退到主线程:', error)
      // 回退方案：主线程计算
      const buffer = await file.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }
  }

  function isHashUploaded(hash) {
    return sessionCache.isHashUploaded(hash)
  }

  function markHashesMetadataCommitted(uploadedFiles) {
    sessionCache.markHashesMetadataCommitted(uploadedFiles)
  }

  // 清除上传记录（手动清理）
  function clearUploadedHashes() {
    sessionCache.clearUploadedHashes()
  }

  function getCachedAiMetadata(hash) {
    return sessionCache.getCachedAiMetadata(hash)
  }

  // 上传单个文件
  async function uploadFile(uploadFile) {
    return uploadSessionService.uploadFile(uploadFile, {
      targetPath: uploadFile.targetPath || targetPath.value,
      series: uploadFile.targetSeries || series.value,
      computeFileHash
    })
  }

  // 上传所有待上传文件
  async function uploadAll() {
    if (uploading.value || pendingFiles.value.length === 0) return

    // 检查是否所有待上传文件都有目标路径
    const filesWithoutTarget = pendingFiles.value.filter(f => !f.targetPath)
    if (filesWithoutTarget.length > 0) {
      throw new Error(`有 ${filesWithoutTarget.length} 个文件未设置上传目录`)
    }

    uploading.value = true
    metadataStatus.value = 'idle'
    metadataError.value = null
    const pending = files.value.filter(file => file.status === 'pending')
    const { results, uploadedFiles, permissionError } =
      await uploadSessionService.uploadPendingFiles(pending, {
        uploadDelayMs: UPLOAD_DELAY,
        targetPath: targetPath.value,
        series: series.value,
        computeFileHash,
        onBeforeUpload: file => {
          currentFileIndex.value = files.value.findIndex(candidate => candidate.id === file.id)
        }
      })

    currentFileIndex.value = -1
    uploading.value = false

    // 如果有成功上传的文件，生成 metadata-pending
    let metadataResult = null
    if (uploadedFiles.length > 0 && !permissionError) {
      metadataStatus.value = 'uploading'
      metadataResult = await generatePendingMetadata(uploadedFiles)

      if (metadataResult?.success) {
        markHashesMetadataCommitted(uploadedFiles)
        metadataStatus.value = 'success'
        metadataError.value = null
        metadataPendingPath.value = metadataResult.path || ''
        metadataRetryFileIds.value = []
      } else {
        metadataStatus.value = 'error'
        metadataError.value = metadataResult?.error || 'metadata 生成失败'
        metadataPendingPath.value = ''
        metadataRetryFileIds.value = uploadedFiles.map(file => file.id)
      }
    } else if (!permissionError) {
      metadataStatus.value = 'idle'
    }

    // 返回结果，包含权限错误标记和 metadata 生成结果
    return { results, permissionError, metadataResult }
  }

  // 获取 API 配额信息
  function getRateLimit() {
    return repository.getRateLimit()
  }

  // 检查批量上传是否需要警告
  function shouldWarnBatchUpload(count) {
    return count > BATCH_WARNING_THRESHOLD
  }

  // 估算上传时间（秒）
  function estimateUploadTime(count) {
    // 每个文件约 2-3 秒（包含间隔）
    return Math.ceil(count * 2.5)
  }

  // 重试失败的文件
  async function retryFailed() {
    const failedFiles = errorFiles.value
    failedFiles.forEach(f => {
      f.status = 'pending'
      f.progress = 0
      f.error = null
    })

    return uploadAll()
  }

  async function retryPendingMetadata() {
    if (metadataStatus.value === 'uploading') return null

    const retryFiles = metadataRetryFileIds.value
      .map(id => files.value.find(file => file.id === id))
      .filter(Boolean)

    if (retryFiles.length === 0) {
      throw new Error('没有可重试的元数据文件')
    }

    metadataStatus.value = 'uploading'
    metadataError.value = null

    const result = await generatePendingMetadata(retryFiles)

    if (result?.success) {
      markHashesMetadataCommitted(retryFiles)
      metadataStatus.value = 'success'
      metadataPendingPath.value = result.path || ''
      metadataRetryFileIds.value = []
    } else {
      metadataStatus.value = 'error'
      metadataError.value = result?.error || 'metadata 生成失败'
    }

    return result
  }

  // 生成并上传 metadata-pending 文件
  // 在批量上传完成后调用，将成功上传的图片信息写入 metadata-pending/{timestamp}.json
  async function generatePendingMetadata(uploadedFiles) {
    return uploadSessionService.generatePendingMetadata(uploadedFiles, {
      targetPath: targetPath.value,
      series: series.value,
      getExtension,
      extractKeywordsFromFilename
    })
  }

  // 从文件名提取关键词（用于非 AI 上传的回退方案）
  function extractKeywordsFromFilename(filename) {
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '')
    const separators = /[-_\s、，,&]+/
    const parts = nameWithoutExt
      .split(separators)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 20)
      .filter(s => !/^\d+$/.test(s))
      .filter(s => !/^(jpg|png|webp|gif|jpeg)$/i.test(s))
    return [...new Set(parts)]
  }

  // 设置目标分类
  function setTarget(newSeries, l1, l2 = '') {
    workspaceStore.setTarget(newSeries, l1, l2)
  }

  function setSeries(newSeries) {
    workspaceStore.setSeries(newSeries)
  }

  // 设置上传模式
  function setUploadMode(mode) {
    workspaceStore.setUploadMode(mode)
  }

  // 应用 AI 推荐的分类到文件
  async function applyAiRecommendation(fileId) {
    const file = uploadFileLifecycleService.applyAiRecommendation(files.value, fileId)
    if (file) await useAiTasksStore().saveManualTarget(fileId, null)
    return file
  }

  // 批量应用 AI 推荐
  async function applyAllAiRecommendations() {
    const fileIds = files.value
      .filter(
        file => file.status === 'pending' && file.aiMetadata && file.targetSource !== 'manual'
      )
      .map(file => file.id)
    const count = uploadFileLifecycleService.applyAllAiRecommendations(files.value)
    await Promise.all(fileIds.map(fileId => useAiTasksStore().saveManualTarget(fileId, null)))
    return count
  }

  // 检查是否所有待上传文件都已设置目标路径（AI模式下需要等AI分析完成）
  function canStartUpload() {
    const pending = pendingFiles.value
    if (pending.length === 0) return false
    return pending.every(f => f.targetPath)
  }

  function setAiModel(modelKey) {
    workspaceStore.setAiModel(modelKey)
  }

  // 获取当前 AI 配置信息
  function getCurrentAiConfig() {
    const credentialsStore = useCredentialsStore()
    const availableModels = getUploadModelList(credentialsStore)
    let model = availableModels.find(item => item.key === selectedModelKey.value)

    if (!model) {
      model = getPreferredUploadModel(credentialsStore)
      if (model?.key) {
        selectedModelKey.value = model.key
      }
    }

    const provider = model?.provider || credentialsStore.defaultProvider
    const modelKey = model?.key || CLASSIFIER_CONFIG.defaultModel

    const providerDisplay = {
      groq: { name: 'Groq AI', icon: '⚡' },
      zhipu: { name: '智谱 GLM', icon: '🧠' },
      cloudflare: { name: 'Cloudflare AI', icon: '☁️' },
      sub2api: { name: 'Grok', icon: '🤖' }
    }
    const display = providerDisplay[provider] || { name: provider, icon: '🤖' }

    return {
      provider,
      providerName: display.name,
      providerIcon: display.icon,
      modelKey,
      modelName: model?.name || modelKey,
      availableModels
    }
  }

  // ✅ P1优化：添加清理方法，释放所有资源
  function cleanup() {
    // 路由离开只刷新缓存；文件、预览、哈希任务与 AI 队列继续保留。
    sessionCache.cleanup()
  }

  return {
    // 状态
    files,
    uploading,
    currentFileIndex,
    uploadMode,
    series,
    categoryL1,
    categoryL2,
    // AI 分析状态
    aiAnalyzing,
    aiAnalyzingCount,
    metadataStatus,
    metadataError,
    metadataPendingPath,
    metadataRetryFileIds,
    selectedModelKey,
    // 计算属性
    targetPath,
    totalProgress,
    pendingFiles,
    uploadingFiles,
    successFiles,
    errorFiles,
    // 方法
    validateFile,
    addFiles,
    triggerAiAnalysis,
    removeFile,
    removeFiles,
    clearFiles,
    checkDuplicate,
    uploadFile,
    uploadAll,
    retryFailed,
    retryPendingMetadata,
    setTarget,
    setSeries,
    setUploadMode,
    setAiModel,
    getCurrentAiConfig,
    getUploadModelList,
    updateFileTarget,
    updateFilesTarget,
    setFileAiMetadata,
    setFilesAiMetadata,
    applyAiRecommendation,
    applyAllAiRecommendations,
    canStartUpload,
    generatePendingMetadata,
    getRateLimit,
    shouldWarnBatchUpload,
    estimateUploadTime,
    clearSuccessFiles,
    checkDuplicates,
    computeFileHash,
    isHashUploaded,
    clearUploadedHashes,
    getCachedAiMetadata,
    cleanup
  }
})

// 导出常量供外部使用
export { ALLOWED_EXTENSIONS, MAX_FILE_SIZE, BATCH_WARNING_THRESHOLD }
