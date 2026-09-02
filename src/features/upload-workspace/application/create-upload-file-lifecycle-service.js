import { AI_TASK_STATUS, useAiTasksStore } from '@/stores/ai-tasks'

function buildTargetPath(series, l1, l2 = '') {
  const parts = ['wallpaper', series, l1]
  if (l2) {
    parts.push(l2)
  }
  return parts.join('/')
}

function buildAiMetadata(series, result, error = null) {
  return {
    series,
    category: result?.secondary || '通用',
    subcategory: result?.third || '',
    primary: series,
    secondary: result?.secondary || '通用',
    third: result?.third || '',
    keywords: result?.keywords || [],
    description: result?.description || '',
    filenameSuggestions: result?.filenameSuggestions || [],
    displayTitle: result?.displayTitle || null,
    confidence: result?.confidence || 0,
    reasoning: result?.reasoning || null,
    ...(error ? { error } : {})
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createUploadFileLifecycleService({
  sessionCache,
  classifierAnalyze,
  imageCompressor,
  previewManager,
  hashComputer
}) {
  return {
    async prepareFiles(
      newFiles,
      { uploadMode, target, validateFile, generateId, compressionThreshold = 20 * 1024 * 1024 }
    ) {
      const validFiles = []

      for (const file of newFiles) {
        const validation = validateFile(file)
        if (!validation.valid) {
          continue
        }

        const id = generateId()
        let processedFile = file
        let compressed = false
        const originalSize = file.size

        if (file.size > compressionThreshold) {
          const result = await imageCompressor.compress(file, {
            maxWidth: 7680,
            maxHeight: 4320,
            maxPixels: 33177600,
            quality: 0.95,
            maxSizeMB: 20
          })

          if (result.compressed) {
            processedFile = result.file
            compressed = true
          }
        }

        let fileHash = null
        let cachedAiMetadata = null

        if (uploadMode === 'ai') {
          fileHash = await hashComputer(processedFile)
          cachedAiMetadata = sessionCache.getCachedAiMetadata(fileHash)
          if (cachedAiMetadata?.error) {
            cachedAiMetadata = null
          }
        }

        validFiles.push({
          id,
          file: processedFile,
          fileHash,
          name: file.name,
          size: processedFile.size,
          originalSize,
          compressed,
          preview: previewManager.createPreview(id, processedFile),
          status: 'pending',
          progress: 0,
          error: null,
          targetPath: target.l1 ? buildTargetPath(target.series, target.l1, target.l2) : '',
          targetSeries: target.series,
          targetL1: target.l1,
          targetL2: target.l2,
          aiMetadata: cachedAiMetadata,
          aiTaskId: null,
          aiTaskStatus: cachedAiMetadata ? AI_TASK_STATUS.COMPLETED : null,
          aiTaskAttempts: 0
        })
      }

      return validFiles
    },

    applyAiMetadata(uploadFile, aiMetadata, autoApply = true) {
      uploadFile.aiMetadata = aiMetadata

      if (uploadFile.fileHash && aiMetadata && !aiMetadata.error) {
        sessionCache.setCachedAiMetadata(uploadFile.fileHash, aiMetadata)
      }

      if (!autoApply || !aiMetadata || uploadFile.status !== 'pending') {
        return uploadFile
      }

      const aiSeries = aiMetadata.series || aiMetadata.primary
      const category = aiMetadata.category || aiMetadata.secondary
      const subcategory = aiMetadata.subcategory || aiMetadata.third || ''

      if (aiSeries && category && !aiMetadata.error) {
        uploadFile.targetSeries = aiSeries
        uploadFile.targetL1 = category
        uploadFile.targetL2 = subcategory
        uploadFile.targetPath = buildTargetPath(aiSeries, category, subcategory)

        if (!aiMetadata.series) aiMetadata.series = aiSeries
        if (!aiMetadata.category) aiMetadata.category = category
        if (!aiMetadata.subcategory) aiMetadata.subcategory = subcategory
      }

      return uploadFile
    },

    updateFileTarget(uploadFiles, fileId, newSeries, l1, l2 = '') {
      const file = uploadFiles.find(item => item.id === fileId)
      if (!file || file.status !== 'pending') {
        return null
      }

      file.targetSeries = newSeries
      file.targetL1 = l1
      file.targetL2 = l2
      file.targetPath = buildTargetPath(newSeries, l1, l2)
      return file
    },

    updateFilesTarget(uploadFiles, fileIds, newSeries, l1, l2 = '') {
      fileIds.forEach(fileId => {
        this.updateFileTarget(uploadFiles, fileId, newSeries, l1, l2)
      })
    },

    applyAiRecommendation(uploadFiles, fileId) {
      const file = uploadFiles.find(item => item.id === fileId)
      if (!file || !file.aiMetadata || file.status !== 'pending') {
        return null
      }

      return this.applyAiMetadata(file, file.aiMetadata, true)
    },

    applyAllAiRecommendations(uploadFiles) {
      const pendingFiles = uploadFiles.filter(file => file.status === 'pending' && file.aiMetadata)
      pendingFiles.forEach(file => {
        this.applyAiMetadata(file, file.aiMetadata, true)
      })
      return pendingFiles.length
    },

    async analyzeFiles(uploadFiles, { series, provider, credentials, modelKey }) {
      const taskStore = useAiTasksStore()
      await taskStore.initialize()

      const queue = uploadFiles.filter(file => !file.aiMetadata)
      let analyzedCount = 0

      for (const uploadFile of queue) {
        let task = taskStore.getTaskByFileId(uploadFile.id)
        if (!task) {
          task = await taskStore.createTask({
            fileId: uploadFile.id,
            file: uploadFile.file,
            series,
            provider,
            modelKey
          })
        }

        uploadFile.aiTaskId = task.id
        uploadFile.aiTaskStatus = task.status
        uploadFile.aiTaskAttempts = task.attempts || 0
      }

      // 任务中心统一串行执行。Provider 自身仍保留底层限流保护。
      for (const uploadFile of queue) {
        const task = taskStore.getTaskByFileId(uploadFile.id)
        if (!task || task.status === AI_TASK_STATUS.COMPLETED) {
          continue
        }

        const maxAttempts = task.maxAttempts || 3
        let completed = false
        let lastError = null

        for (let attempt = task.attempts || 0; attempt < maxAttempts && !completed; attempt++) {
          uploadFile.aiTaskStatus = AI_TASK_STATUS.ANALYZING
          uploadFile.aiTaskAttempts = attempt + 1
          await taskStore.updateTask(task.id, {
            status: AI_TASK_STATUS.ANALYZING,
            attempts: attempt + 1,
            startedAt: task.startedAt || Date.now(),
            retryAt: null,
            error: null
          })

          try {
            const result = await classifierAnalyze({
              file: uploadFile.file,
              series: task.series || series,
              providerType: task.provider || provider,
              credentials,
              modelKey: task.modelKey || modelKey
            })

            const aiMetadata = buildAiMetadata(task.series || series, result)
            this.applyAiMetadata(uploadFile, aiMetadata)
            uploadFile.aiTaskStatus = AI_TASK_STATUS.COMPLETED

            await taskStore.updateTask(task.id, {
              status: AI_TASK_STATUS.COMPLETED,
              result: aiMetadata,
              error: null,
              retryAt: null,
              finishedAt: Date.now()
            })
            completed = true
          } catch (error) {
            lastError = error
            const isLastAttempt = attempt + 1 >= maxAttempts

            if (!isLastAttempt) {
              const retryDelay = Math.min(30000, 2000 * 2 ** attempt)
              const retryAt = Date.now() + retryDelay
              uploadFile.aiTaskStatus = AI_TASK_STATUS.RETRYING
              await taskStore.updateTask(task.id, {
                status: AI_TASK_STATUS.RETRYING,
                error: error.message,
                retryAt
              })
              await sleep(retryDelay)
            }
          }
        }

        if (!completed) {
          const message = lastError?.message || 'AI 分析失败'
          uploadFile.aiTaskStatus = AI_TASK_STATUS.FAILED
          this.applyAiMetadata(uploadFile, buildAiMetadata(task.series || series, null, message), false)
          await taskStore.updateTask(task.id, {
            status: AI_TASK_STATUS.FAILED,
            error: message,
            retryAt: null,
            finishedAt: Date.now()
          })
        }

        analyzedCount += 1
      }

      return { analyzedCount }
    }
  }
}
