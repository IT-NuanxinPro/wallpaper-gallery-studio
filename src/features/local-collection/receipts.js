import { createCollectorApi } from './api'

const PREFIX = 'studio-local-receipt:'
export function createReceiptQueue({
  storage = globalThis.localStorage,
  api = createCollectorApi()
} = {}) {
  const memory = new Map()
  let flushing
  function entries() {
    const result = new Map(memory)
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (!key?.startsWith(PREFIX)) continue
      try {
        result.set(key, JSON.parse(storage.getItem(key)))
      } catch {
        /* 无效记录不发送。 */
      }
    }
    return result
  }
  function enqueue(files, metadata) {
    if (!metadata?.success) return 0
    const groups = new Map()
    for (const file of files.filter(item => item.localSource)) {
      if (!/^[a-f0-9]{40}$/.test(metadata.commitSha || ''))
        throw new Error('缺少远端提交标识，本地文件保留，请重试元数据提交')
      const source = file.localSource
      const repository = file.uploadedRepository
      const groupKey = JSON.stringify([
        source.collectorId,
        source.batchId,
        repository.owner,
        repository.repo,
        repository.branch,
        metadata.commitSha,
        metadata.path
      ])
      if (!groups.has(groupKey))
        groups.set(groupKey, {
          batchId: source.batchId,
          collectorId: source.collectorId,
          repository: { owner: repository.owner, repo: repository.repo, branch: repository.branch },
          metadata: { path: metadata.path, commitSha: metadata.commitSha },
          items: []
        })
      groups.get(groupKey).items.push({
        sourceItemId: source.sourceItemId,
        sourceSha256: source.sha256,
        uploadedSha256: file.fileHash,
        uploadedPath: file.uploadedPath
      })
    }
    let count = 0
    for (const [id, body] of groups) {
      for (let offset = 0; offset < body.items.length; offset += 30) {
        const chunk = { ...body, items: body.items.slice(offset, offset + 30) }
        const key =
          PREFIX +
          encodeURIComponent(JSON.stringify([id, chunk.items.map(item => item.sourceItemId)]))
        memory.set(key, chunk)
        storage.setItem(key, JSON.stringify(chunk))
        count++
      }
    }
    return count
  }
  function discard(files) {
    let count = 0
    for (const file of files) {
      const source = file.localSource
      if (
        !source ||
        file.uploadedPath ||
        file.metadataPending ||
        !['pending', 'error'].includes(file.status)
      )
        continue
      const body = {
        batchId: source.batchId,
        collectorId: source.collectorId,
        items: [source.sourceItemId],
        confirmed: true
      }
      const key =
        PREFIX +
        'discard:' +
        encodeURIComponent(
          JSON.stringify([source.collectorId, source.batchId, source.sourceItemId])
        )
      memory.set(key, body)
      storage.setItem(key, JSON.stringify(body))
      count++
    }
    return count
  }
  function pendingDiscards(files) {
    const pending = entries()
    return files.some(file => {
      const source = file.localSource
      if (!source) return false
      const key =
        PREFIX +
        'discard:' +
        encodeURIComponent(
          JSON.stringify([source.collectorId, source.batchId, source.sourceItemId])
        )
      return pending.has(key)
    })
  }
  async function flush({ token } = {}) {
    if (flushing) return flushing
    flushing = (async () => {
      let synced = 0
      const errors = []
      if (!entries().size || !token) return { pending: entries().size, synced, errors }
      let collector
      try {
        collector = await api.health()
      } catch (error) {
        return { pending: entries().size, synced, errors: [error.message] }
      }
      const attempted = new Set()
      while (true) {
        const next = [...entries()].find(
          ([key, body]) => !attempted.has(key) && body?.collectorId === collector.collectorId
        )
        if (!next) break
        const [key, body] = next
        attempted.add(key)
        try {
          if (key.startsWith(PREFIX + 'discard:')) await api.discard(body, token)
          else await api.receipt(body, token)
          storage.removeItem(key)
          memory.delete(key)
          synced++
        } catch (error) {
          errors.push(error.message)
        }
      }
      return { pending: entries().size, synced, errors }
    })().finally(() => {
      flushing = null
    })
    return flushing
  }
  return { enqueue, discard, pendingDiscards, flush, pending: () => entries().size }
}
let queue
function sharedQueue() {
  return (queue ||= createReceiptQueue())
}
export function queueCollectorReceipts(files, metadata) {
  return sharedQueue().enqueue(files, metadata)
}
export function flushCollectorReceipts(options) {
  return sharedQueue().flush(options)
}
export function pendingCollectorReceipts() {
  return sharedQueue().pending()
}

export function queueCollectorDiscards(files) {
  return sharedQueue().discard(files)
}
export function hasPendingCollectorDiscards(files) {
  return sharedQueue().pendingDiscards(files)
}
