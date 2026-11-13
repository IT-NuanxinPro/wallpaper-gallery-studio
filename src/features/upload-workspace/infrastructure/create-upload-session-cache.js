const DEFAULT_OPTIONS = {
  hashStorageKey: 'uploaded_hashes',
  pendingStorageKey: 'pending_uploaded_hashes',
  aiMetadataStorageKey: 'upload_ai_metadata_cache',
  maxCount: 500,
  expireDays: 30,
  debounceMs: 1000
}

export function createUploadSessionCache({ getRepositoryContext = () => ({}), ...options } = {}) {
  const scopes = new Map()
  function forContext(context) {
    const namespace = JSON.stringify([
      context.owner || '',
      context.repo || '',
      context.branch || ''
    ])
    if (!scopes.has(namespace)) {
      scopes.set(namespace, createScopedSessionCache({ ...options, namespace }))
    }
    return scopes.get(namespace)
  }

  const scoped = forContext(getRepositoryContext())
  return {
    ...Object.fromEntries(
      Object.keys(scoped).map(method => [
        method,
        (...args) => forContext(getRepositoryContext())[method](...args)
      ])
    ),
    forContext,
    flush() {
      scopes.forEach(cache => cache.flush())
    },
    cleanup() {
      scopes.forEach(cache => cache.cleanup())
    }
  }
}

function createScopedSessionCache({
  namespace,
  storage = localStorage,
  now = () => Date.now(),
  debounceMs = DEFAULT_OPTIONS.debounceMs,
  options = {}
} = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options, debounceMs }
  for (const key of ['hashStorageKey', 'pendingStorageKey', 'aiMetadataStorageKey']) {
    config[key] = `${config[key]}:repository:${namespace}`
  }
  const expireMs = config.expireDays * 24 * 60 * 60 * 1000

  let uploadedHashes = null
  let pendingHashes = null
  let aiMetadataCache = null
  let uploadedDirty = false
  let pendingDirty = false
  let aiDirty = false
  let uploadedTimer = null
  let pendingTimer = null
  let aiTimer = null

  function createTimerRef(getter, setter) {
    return {
      get value() {
        return getter()
      },
      set value(nextValue) {
        setter(nextValue)
      }
    }
  }

  function schedule(save, currentTimerRef) {
    if (currentTimerRef.value) {
      clearTimeout(currentTimerRef.value)
    }

    if (config.debounceMs <= 0) {
      save()
      currentTimerRef.value = null
      return
    }

    currentTimerRef.value = setTimeout(() => {
      currentTimerRef.value = null
      save()
    }, config.debounceMs)
  }

  function pruneEntries(entries, predicate) {
    const valid = {}
    for (const [key, value] of Object.entries(entries || {})) {
      if (predicate(value)) {
        valid[key] = value
      }
    }
    return valid
  }

  function limitEntries(entries) {
    const pairs = Object.entries(entries)
    if (pairs.length <= config.maxCount) {
      return entries
    }

    pairs.sort((a, b) => (b[1]?.time || 0) - (a[1]?.time || 0))
    return Object.fromEntries(pairs.slice(0, config.maxCount))
  }

  function loadUploadedHashes() {
    if (uploadedHashes) return uploadedHashes
    try {
      const stored = storage.getItem(config.hashStorageKey)
      const parsed = stored ? JSON.parse(stored) : {}
      uploadedHashes = pruneEntries(parsed, value => {
        return now() - value.time < expireMs && value.metadataCommitted !== false
      })
    } catch {
      uploadedHashes = {}
    }
    return uploadedHashes
  }

  function loadPendingHashes() {
    if (pendingHashes) return pendingHashes
    try {
      const stored = storage.getItem(config.pendingStorageKey)
      const parsed = stored ? JSON.parse(stored) : {}
      pendingHashes = pruneEntries(parsed, value => now() - value.time < expireMs)
    } catch {
      pendingHashes = {}
    }
    return pendingHashes
  }

  function loadAiMetadata() {
    if (aiMetadataCache) return aiMetadataCache
    try {
      const stored = storage.getItem(config.aiMetadataStorageKey)
      const parsed = stored ? JSON.parse(stored) : {}
      aiMetadataCache = pruneEntries(
        parsed,
        value => now() - value.time < expireMs && value.aiMetadata
      )
    } catch {
      aiMetadataCache = {}
    }
    return aiMetadataCache
  }

  function flushUploadedHashes() {
    if (!uploadedDirty || !uploadedHashes) return
    storage.setItem(config.hashStorageKey, JSON.stringify(limitEntries(uploadedHashes)))
    uploadedDirty = false
  }

  function flushPendingHashes() {
    if (!pendingDirty || !pendingHashes) return
    storage.setItem(config.pendingStorageKey, JSON.stringify(limitEntries(pendingHashes)))
    pendingDirty = false
  }

  function flushAiMetadata() {
    if (!aiDirty || !aiMetadataCache) return
    storage.setItem(config.aiMetadataStorageKey, JSON.stringify(limitEntries(aiMetadataCache)))
    aiDirty = false
  }

  return {
    getUploadedHashes: loadUploadedHashes,
    getPendingUploadedHashes: loadPendingHashes,
    getCachedAiMetadataMap: loadAiMetadata,
    isHashUploaded(hash) {
      return loadUploadedHashes()[hash] || null
    },
    getPendingUploadedHash(hash) {
      return loadPendingHashes()[hash] || null
    },
    addUploadedHash(hash, filename, path) {
      const hashes = loadUploadedHashes()
      hashes[hash] = { filename, path, time: now(), metadataCommitted: true }
      uploadedDirty = true
      schedule(
        flushUploadedHashes,
        createTimerRef(
          () => uploadedTimer,
          value => {
            uploadedTimer = value
          }
        )
      )
    },
    addPendingUploadedHash(hash, filename, path, recovery = {}) {
      const hashes = loadPendingHashes()
      hashes[hash] = { ...recovery, filename, path, time: now() }
      pendingDirty = true
      schedule(
        flushPendingHashes,
        createTimerRef(
          () => pendingTimer,
          value => {
            pendingTimer = value
          }
        )
      )
    },
    markHashesMetadataCommitted(uploadedFiles) {
      if (!uploadedFiles?.length) return
      const pending = loadPendingHashes()
      let changed = false

      uploadedFiles.forEach(file => {
        if (file.fileHash && pending[file.fileHash]) {
          this.addUploadedHash(file.fileHash, file.name, pending[file.fileHash].path)
          delete pending[file.fileHash]
          changed = true
        }
      })

      if (changed) {
        pendingDirty = true
        schedule(
          flushPendingHashes,
          createTimerRef(
            () => pendingTimer,
            value => {
              pendingTimer = value
            }
          )
        )
      }
    },
    clearUploadedHashes() {
      uploadedHashes = {}
      pendingHashes = {}
      uploadedDirty = false
      pendingDirty = false
      if (uploadedTimer) clearTimeout(uploadedTimer)
      if (pendingTimer) clearTimeout(pendingTimer)
      storage.removeItem(config.hashStorageKey)
      storage.removeItem(config.pendingStorageKey)
    },
    getCachedAiMetadata(hash) {
      if (!hash) return null
      return loadAiMetadata()[hash]?.aiMetadata || null
    },
    setCachedAiMetadata(hash, aiMetadata) {
      if (!hash || !aiMetadata) return
      const cache = loadAiMetadata()
      cache[hash] = { aiMetadata, time: now() }
      aiDirty = true
      schedule(
        flushAiMetadata,
        createTimerRef(
          () => aiTimer,
          value => {
            aiTimer = value
          }
        )
      )
    },
    flush() {
      flushUploadedHashes()
      flushPendingHashes()
      flushAiMetadata()
    },
    cleanup() {
      if (uploadedTimer) clearTimeout(uploadedTimer)
      if (pendingTimer) clearTimeout(pendingTimer)
      if (aiTimer) clearTimeout(aiTimer)
      uploadedTimer = null
      pendingTimer = null
      aiTimer = null
      this.flush()
    }
  }
}
