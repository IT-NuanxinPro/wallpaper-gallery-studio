import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AI_TASK_STATUS, useAiTasksStore } from './ai-tasks'
import { previewManager } from '@/utils/previewManager'

function buildTargetPath(task) {
  const metadata = task.result
  if (!metadata || metadata.error) return ''

  const category = metadata.category || metadata.secondary
  const subcategory = metadata.subcategory || metadata.third || ''
  if (!task.series || !category) return ''

  return ['wallpaper', task.series, category, subcategory].filter(Boolean).join('/')
}

function restoreFileFromTask(task) {
  if (!task.blob) return null

  const restoredFile =
    task.blob instanceof File
      ? task.blob
      : new File([task.blob], task.fileName, {
          type: task.fileType || task.blob.type || 'image/jpeg',
          lastModified: task.fileLastModified || Date.now()
        })

  const metadata = task.status === AI_TASK_STATUS.COMPLETED ? task.result : null

  return {
    id: task.fileId,
    file: restoredFile,
    fileHash: null,
    name: task.fileName,
    size: restoredFile.size,
    originalSize: restoredFile.size,
    compressed: false,
    preview: previewManager.createPreview(task.fileId, restoredFile),
    status: 'pending',
    progress: 0,
    error: null,
    targetPath: buildTargetPath(task),
    targetSeries: task.series,
    targetL1: metadata?.category || metadata?.secondary || '',
    targetL2: metadata?.subcategory || metadata?.third || '',
    aiMetadata: metadata,
    aiTaskId: task.id,
    aiTaskStatus: task.status,
    aiTaskAttempts: task.attempts || 0,
    restoredFromTask: true
  }
}

export const useUploadSessionStore = defineStore('upload-session', () => {
  const files = ref([])
  const uploading = ref(false)
  const currentFileIndex = ref(-1)
  const aiAnalyzing = ref(false)
  const aiAnalyzingCount = ref(0)
  const metadataStatus = ref('idle')
  const metadataError = ref(null)
  const metadataPendingPath = ref('')
  const metadataRetryFileIds = ref([])
  const tasksRestored = ref(false)

  const totalProgress = computed(() => {
    if (files.value.length === 0) return 0
    const total = files.value.reduce((sum, file) => sum + file.progress, 0)
    return Math.round(total / files.value.length)
  })

  const pendingFiles = computed(() => files.value.filter(file => file.status === 'pending'))
  const uploadingFiles = computed(() => files.value.filter(file => file.status === 'uploading'))
  const successFiles = computed(() => files.value.filter(file => file.status === 'success'))
  const errorFiles = computed(() => files.value.filter(file => file.status === 'error'))

  function setFiles(nextFiles) {
    files.value = nextFiles
  }

  function appendFiles(nextFiles) {
    files.value.push(...nextFiles)
  }

  function removeFile(id) {
    const index = files.value.findIndex(file => file.id === id)
    if (index > -1) {
      files.value.splice(index, 1)
    }
  }

  function removeFiles(ids) {
    files.value = files.value.filter(file => !ids.includes(file.id))
  }

  function clearFiles() {
    files.value = []
  }

  function clearSuccessFiles() {
    const successIds = files.value.filter(file => file.status === 'success').map(file => file.id)
    files.value = files.value.filter(file => file.status !== 'success')
    return successIds.length
  }

  async function restoreAiTaskFiles() {
    if (tasksRestored.value) return []

    const taskStore = useAiTasksStore()
    await taskStore.initialize()

    const restored = []
    for (const task of taskStore.tasks) {
      if (!task.fileId || files.value.some(file => file.id === task.fileId)) continue

      const uploadFile = restoreFileFromTask(task)
      if (!uploadFile) continue
      files.value.push(uploadFile)
      restored.push(uploadFile)
    }

    tasksRestored.value = true
    return restored
  }

  return {
    files,
    uploading,
    currentFileIndex,
    aiAnalyzing,
    aiAnalyzingCount,
    metadataStatus,
    metadataError,
    metadataPendingPath,
    metadataRetryFileIds,
    tasksRestored,
    totalProgress,
    pendingFiles,
    uploadingFiles,
    successFiles,
    errorFiles,
    setFiles,
    appendFiles,
    removeFile,
    removeFiles,
    clearFiles,
    clearSuccessFiles,
    restoreAiTaskFiles
  }
})
