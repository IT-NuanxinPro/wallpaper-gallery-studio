const DB_NAME = 'wallpaper-gallery-studio'
const DB_VERSION = 1
const STORE_NAME = 'ai-analysis-tasks'

let databasePromise = null

function openDatabase() {
  if (databasePromise) return databasePromise

  if (typeof globalThis.indexedDB === 'undefined') {
    return Promise.reject(new Error('当前浏览器不支持 IndexedDB，任务无法跨刷新恢复'))
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
        store.createIndex('fileId', 'fileId', { unique: false })
        store.createIndex('status', 'status', { unique: false })
      }
    }

    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = null
      }
      resolve(database)
    }
    request.onerror = () => {
      databasePromise = null
      reject(request.error || new Error('打开 AI 任务数据库失败'))
    }
  })

  return databasePromise
}

async function runTransaction(mode, operation) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    let result
    let operationError = null

    const setResult = value => {
      result = value
    }

    try {
      operation(store, setResult)
    } catch (error) {
      operationError = error
      transaction.abort()
    }

    transaction.oncomplete = () => resolve(result)
    transaction.onabort = () =>
      reject(operationError || transaction.error || new Error('AI 任务数据库事务已中止'))
    transaction.onerror = () => {
      operationError ||= transaction.error || new Error('AI 任务数据库事务失败')
    }
  })
}

export async function listAiTaskRecords() {
  const records = await runTransaction('readonly', (store, setResult) => {
    const request = store.getAll()
    request.onsuccess = () => setResult(request.result)
  })
  return (records || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

export async function getAiTaskRecord(id) {
  return runTransaction('readonly', (store, setResult) => {
    const request = store.get(id)
    request.onsuccess = () => setResult(request.result)
  })
}

export async function putAiTaskRecord(record) {
  const records = await putAiTaskRecords([record])
  return records[0]
}

export async function putAiTaskRecords(records) {
  if (!records.length) return []

  return runTransaction('readwrite', (store, setResult) => {
    records.forEach(record => store.put(record))
    setResult(records)
  })
}

export async function patchAiTaskRecord(id, patch) {
  return runTransaction('readwrite', (store, setResult) => {
    const getRequest = store.get(id)
    getRequest.onsuccess = () => {
      const current = getRequest.result
      if (!current) {
        setResult(null)
        return
      }

      const next = {
        ...current,
        ...patch,
        id,
        updatedAt: patch.updatedAt || Date.now()
      }
      const putRequest = store.put(next)
      putRequest.onsuccess = () => setResult(next)
    }
  })
}

export async function deleteAiTaskRecord(id) {
  return deleteAiTaskRecords([id])
}

export async function deleteAiTaskRecords(ids) {
  if (!ids.length) return []

  return runTransaction('readwrite', (store, setResult) => {
    ids.forEach(id => store.delete(id))
    setResult(ids)
  })
}

export async function clearAiTaskRecords() {
  return runTransaction('readwrite', (store, setResult) => {
    const request = store.clear()
    request.onsuccess = () => setResult(true)
  })
}

export function formatTaskStorageError(error) {
  if (error?.name === 'QuotaExceededError') {
    return '浏览器本地存储空间不足，新增任务仍可在当前页面继续，但刷新后可能无法恢复。'
  }

  return error?.message || 'AI 任务持久化失败'
}
