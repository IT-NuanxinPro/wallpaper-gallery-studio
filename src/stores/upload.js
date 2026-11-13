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
import { AI_PROVIDER } from '@/services/ai/model'
import { useCredentialsStore } from './credentials'
import { previewManager } from '@/utils/previewManager'
import { hashWorker } from '@/utils/hashWorker'
import { sha256Hex } from '@/utils/file-hash'
import { imageCompressor } from '@/utils/imageCompressor'
import { getModelByKey } from '@/services/ai/classifier'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
const MAX_FILE_SIZE = 25 * 1024 * 1024
const UPLOAD_DELAY = 500
const BATCH_WARNING_THRESHOLD = 50

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
  const sessionCache = createUploadSessionCache({ getRepositoryContext: repository.getContext })
  const uploadFileLifecycleService = createUploadFileLifecycleService({
    sessionCache,
    imageCompressor,
    previewManager,
    hashComputer: async file => computeFileHash(file)
  })
  const uploadSessionService = createUploadSessionService({
    repository,
    sessionCache,
    historyStore
  })

  const { selectedModelKey, series, categoryL1, categoryL2, targetPath } =
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

  function getUploadModelList() {
    return useCredentialsStore()
      .models.map(model => getModelByKey(model.id))
      .filter(Boolean)
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
  }

  function getExtension(filename) {
    return filename.split('.').pop().toLowerCase()
  }

  function validateFile(file) {
    const ext = getExtension(file.name)
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `不支持的文件格式: ${ext}` }
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { valid: false, error: `不支持的文件类型: ${file.type}` }
    }

    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `文件大小超过限制 (最大 25MB)` }
    }

    return { valid: true }
  }

  async function addFiles(newFiles) {
    const validFiles = await uploadFileLifecycleService.prepareFiles(newFiles, {
      target: {
        series: series.value
      },
      validateFile,
      generateId
    })

    sessionStore.appendFiles(validFiles)

    validFiles.forEach(file => {
      if (file.aiMetadata) {
        setFileAiMetadata(file.id, file.aiMetadata)
      }
    })

    if (validFiles.length > 0) {
      triggerAiAnalysis(validFiles)
    }

    return validFiles
  }

  async function triggerAiAnalysis(filesToAnalyze) {
    const filesNeedingAnalysis = filesToAnalyze
      .map(file => files.value.find(candidate => candidate.id === file.id))
      .filter(file => file && (!file.aiMetadata || file.aiMetadata.error))

    if (filesNeedingAnalysis.length === 0) {
      aiAnalyzing.value = false
      aiAnalyzingCount.value = 0
      return
    }

    aiAnalyzing.value = true
    aiAnalyzingCount.value = filesNeedingAnalysis.length
    try {
      await uploadFileLifecycleService.analyzeFiles(filesNeedingAnalysis, {
        series: series.value
      })
    } finally {
      aiAnalyzingCount.value = 0
      aiAnalyzing.value = false
    }
  }

  function updateFileTarget(fileId, newSeries, l1, l2 = '') {
    uploadFileLifecycleService.updateFileTarget(files.value, fileId, newSeries, l1, l2)
  }

  function updateFilesTarget(fileIds, newSeries, l1, l2 = '') {
    uploadFileLifecycleService.updateFilesTarget(files.value, fileIds, newSeries, l1, l2)
  }

  function setFileAiMetadata(fileId, aiMetadata, autoApply = true) {
    const file = files.value.find(f => f.id === fileId)
    if (file) {
      uploadFileLifecycleService.applyAiMetadata(file, aiMetadata, autoApply)
    }
  }

  function setFilesAiMetadata(metadataMap) {
    for (const [fileId, aiMetadata] of Object.entries(metadataMap)) {
      setFileAiMetadata(fileId, aiMetadata)
    }
  }

  function removeFile(id) {
    const index = files.value.findIndex(f => f.id === id)
    if (index > -1) {
      previewManager.revokePreview(id)

      sessionStore.removeFile(id)
    }
  }

  function removeFiles(ids) {
    previewManager.revokePreviews(ids)

    sessionStore.removeFiles(ids)
  }

  function clearFiles() {
    previewManager.revokeAll()

    sessionStore.clearFiles()
  }

  function clearSuccessFiles() {
    const successIds = files.value.filter(f => f.status === 'success').map(f => f.id)

    previewManager.revokePreviews(successIds)

    return sessionStore.clearSuccessFiles()
  }

  async function checkDuplicate(filename) {
    const path = `${targetPath.value}/${filename}`

    return repository.checkFileExists(path)
  }

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

  async function computeFileHash(file) {
    try {
      return await hashWorker.computeHash(file)
    } catch (error) {
      console.error('Hash计算失败，回退到主线程:', error)

      const buffer = await file.arrayBuffer()
      return sha256Hex(buffer)
    }
  }

  function isHashUploaded(hash) {
    return sessionCache.isHashUploaded(hash)
  }

  function clearUploadedHashes() {
    sessionCache.clearUploadedHashes()
  }

  function getCachedAiMetadata(hash) {
    return sessionCache.getCachedAiMetadata(hash)
  }

  async function uploadFile(uploadFile) {
    return uploadSessionService.uploadFile(uploadFile, {
      targetPath: uploadFile.targetPath || targetPath.value,
      series: uploadFile.targetSeries || series.value,
      computeFileHash
    })
  }

  async function uploadAll() {
    if (uploading.value || pendingFiles.value.length === 0) return

    const filesWithoutAnalysis = pendingFiles.value.filter(f => !f.aiMetadata || f.aiMetadata.error)
    if (filesWithoutAnalysis.length > 0) {
      throw new Error(`有 ${filesWithoutAnalysis.length} 个文件尚未完成 AI 分析`)
    }

    const filesWithoutTarget = pendingFiles.value.filter(f => !f.targetPath)
    if (filesWithoutTarget.length > 0) {
      throw new Error(`有 ${filesWithoutTarget.length} 个文件未设置上传目录`)
    }

    uploading.value = true
    metadataStatus.value = 'idle'
    metadataError.value = null
    const pending = files.value.filter(file => file.status === 'pending')
    const { results, uploadedFiles, permissionError, writeSession } =
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
    let metadataResult = null
    if (uploadedFiles.length > 0 && !permissionError) {
      metadataStatus.value = 'uploading'
      metadataResult = await generatePendingMetadata(uploadedFiles, writeSession)

      if (metadataResult?.success) {
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
    uploading.value = false

    return { results, permissionError, metadataResult }
  }

  function getRateLimit() {
    return repository.getRateLimit()
  }

  function shouldWarnBatchUpload(count) {
    return count > BATCH_WARNING_THRESHOLD
  }

  function estimateUploadTime(count) {
    return Math.ceil(count * 2.5)
  }

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
      metadataStatus.value = 'success'
      metadataPendingPath.value = result.path || ''
      metadataRetryFileIds.value = []
    } else {
      metadataStatus.value = 'error'
      metadataError.value = result?.error || 'metadata 生成失败'
    }

    return result
  }

  async function generatePendingMetadata(uploadedFiles, writeSession) {
    return uploadSessionService.generatePendingMetadata(uploadedFiles, {
      targetPath: targetPath.value,
      series: series.value,
      getExtension,
      writeSession
    })
  }

  function setTarget(newSeries, l1, l2 = '') {
    workspaceStore.setTarget(newSeries, l1, l2)
  }

  function setSeries(newSeries) {
    workspaceStore.setSeries(newSeries)
  }

  function applyAiRecommendation(fileId) {
    return uploadFileLifecycleService.applyAiRecommendation(files.value, fileId)
  }

  function applyAllAiRecommendations() {
    return uploadFileLifecycleService.applyAllAiRecommendations(files.value)
  }

  function canStartUpload() {
    const pending = pendingFiles.value
    if (pending.length === 0) return false
    return pending.every(f => f.aiMetadata && !f.aiMetadata.error && f.targetPath)
  }

  function getCurrentAiConfig() {
    const availableModels = getUploadModelList()
    return {
      provider: AI_PROVIDER,
      providerName: 'OpenAI 兼容服务',
      providerIcon: '🤖',
      modelKey: selectedModelKey.value,
      modelName: selectedModelKey.value || '未选择模型',
      availableModels
    }
  }

  function cleanup() {
    if (
      uploading.value ||
      metadataStatus.value === 'uploading' ||
      metadataRetryFileIds.value.length > 0
    ) {
      sessionCache.flush()
      return
    }
    previewManager.revokeAll()

    hashWorker.terminate()
    sessionCache.cleanup()

    sessionStore.clearFiles()
  }

  return {
    files,
    uploading,
    currentFileIndex,
    series,
    categoryL1,
    categoryL2,

    aiAnalyzing,
    aiAnalyzingCount,
    metadataStatus,
    metadataError,
    metadataPendingPath,
    metadataRetryFileIds,
    selectedModelKey,

    targetPath,
    totalProgress,
    pendingFiles,
    uploadingFiles,
    successFiles,
    errorFiles,

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

export { ALLOWED_EXTENSIONS, MAX_FILE_SIZE, BATCH_WARNING_THRESHOLD }
