const DB_NAME = 'wallpaper-gallery-studio'
const DB_VERSION = 1
const STORE_NAME = 'ai-analysis-tasks'

let databasePromise = null

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
  })
}

function openDatabase() {
  if (databasePromise) return databasePromise

  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('当前浏览器不支持 IndexedDB，任务无法跨刷新恢复'))
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
        store.createIndex('fileId', 'fileId', { unique: false })
        store.createIndex('status', 'status', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('打开 AI 任务数据库失败'))
  })

  return databasePromise
}

async function withStore(mode, callback) {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, mode)
  const store = transaction.objectStore(STORE_NAME)
  return callback(store)
}

export async function listAiTaskRecords() {
  const records = await withStore('readonly', store => requestToPromise(store.getAll()))
  return (records || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

export async function getAiTaskRecord(id) {
  return withStore('readonly', store => requestToPromise(store.get(id)))
}

export async function putAiTaskRecord(record) {
  return withStore('readwrite', store => requestToPromise(store.put(record)))
}

export async function patchAiTaskRecord(id, patch) {
  const current = await getAiTaskRecord(id)
  if (!current) return null

  const next = {
    ...current,
    ...patch,
    id,
    updatedAt: patch.updatedAt || Date.now()
  }
  await putAiTaskRecord(next)
  return next
}

export async function deleteAiTaskRecord(id) {
  return withStore('readwrite', store => requestToPromise(store.delete(id)))
}

export async function clearAiTaskRecords() {
  return withStore('readwrite', store => requestToPromise(store.clear()))
}

export function formatTaskStorageError(error) {
  if (error?.name === 'QuotaExceededError') {
    return '浏览器本地存储空间不足，新增任务仍可在当前页面继续，但刷新后可能无法恢复。'
  }

  return error?.message || 'AI 任务持久化失败'
}
