function normalizeUploadError(error) {
  if (error.type === 'PERMISSION_DENIED') {
    return '权限不足：您没有该仓库的写入权限'
  }
  if (error.type === 'RATE_LIMITED') {
    return 'API 请求过于频繁，请稍后重试'
  }
  if (error.type === 'TOKEN_EXPIRED') {
    return '登录已过期，请重新登录'
  }
  if (error.type === 'NETWORK_ERROR') {
    return '网络连接失败，请检查网络'
  }
  if (error.message?.includes('sha') || error.message?.includes('already exists')) {
    return '文件已存在，请勿重复上传'
  }
  return error.message || '上传失败'
}

function repositoryTarget(context) {
  return { owner: context.owner, repo: context.repo, branch: context.branch }
}

function assertSameRepository(target, context) {
  if (!target || ['owner', 'repo', 'branch'].some(key => target[key] !== context[key])) {
    throw Object.assign(new Error('上传目标已变更，请切回图片原仓库后重试元数据'), {
      type: 'UPLOAD_CONTEXT_CHANGED'
    })
  }
}

export function createUploadSessionService({
  repository,
  sessionCache,
  historyStore,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => Date.now(),
  random = Math.random
}) {
  return {
    async uploadFile(
      uploadFile,
      { targetPath, series, computeFileHash, writeSession = repository.createWriteSession() }
    ) {
      if (!uploadFile.aiMetadata || uploadFile.aiMetadata.error) {
        uploadFile.error = '请先完成 AI 分析并确认分类'
        return { success: false, errorType: 'AI_REQUIRED', error: uploadFile.error }
      }

      if (!targetPath) {
        uploadFile.status = 'error'
        uploadFile.error = '未设置上传目录'
        return { success: false, errorType: 'NO_TARGET', error: uploadFile.error }
      }

      uploadFile.status = 'uploading'
      uploadFile.progress = 0

      try {
        writeSession.assertCurrent()
        const context = writeSession.context
        if (uploadFile.uploadedRepository || uploadFile.uploadRepository) {
          assertSameRepository(
            uploadFile.uploadedRepository || uploadFile.uploadRepository,
            context
          )
        }
        uploadFile.uploadRepository = repositoryTarget(context)
        const cache = sessionCache.forContext(context)
        const path = `${targetPath}/${uploadFile.name}`
        const message = `Upload: ${uploadFile.name}`
        const hash = uploadFile.fileHash || (await computeFileHash(uploadFile.file))
        uploadFile.fileHash = hash
        writeSession.assertCurrent()

        const existingUpload = cache.isHashUploaded(hash)
        if (existingUpload) {
          uploadFile.reusedExisting = false
          uploadFile.status = 'error'
          uploadFile.error = `该图片已完整上传，请勿重复上传（${existingUpload.path}）`
          return { success: false, errorType: 'DUPLICATE', error: uploadFile.error }
        }

        const pendingUpload = cache.getPendingUploadedHash(hash)
        if (pendingUpload) {
          uploadFile.progress = 100
          uploadFile.status = 'success'
          uploadFile.error = null
          uploadFile.reusedExisting = true
          uploadFile.uploadedRepository = repositoryTarget(context)
          uploadFile.uploadedPath = pendingUpload.path
          uploadFile.metadataPending = true
          return {
            success: true,
            reusedExisting: true,
            existingPath: pendingUpload.path
          }
        }

        await writeSession.uploadImage(path, uploadFile.file, message)
        uploadFile.progress = 100
        uploadFile.status = 'success'
        uploadFile.reusedExisting = false
        uploadFile.uploadedRepository = repositoryTarget(context)
        uploadFile.uploadedPath = path
        uploadFile.metadataPending = true
        cache.addPendingUploadedHash(hash, uploadFile.name, path, {
          repository: uploadFile.uploadedRepository,
          series,
          size: uploadFile.size,
          aiMetadata: uploadFile.aiMetadata
        })
        cache.flush()

        historyStore.addRecord({
          filename: uploadFile.name,
          category: targetPath,
          series,
          status: 'success'
        })

        return { success: true }
      } catch (error) {
        uploadFile.status = 'error'
        uploadFile.error = normalizeUploadError(error)

        historyStore.addRecord({
          filename: uploadFile.name,
          category: targetPath,
          series,
          status: 'error'
        })

        return { success: false, errorType: error.type, error: uploadFile.error }
      }
    },

    async uploadPendingFiles(
      files,
      {
        uploadDelayMs,
        targetPath,
        series,
        computeFileHash,
        onBeforeUpload = null,
        writeSession = repository.createWriteSession()
      }
    ) {
      const results = []
      const uploadedFiles = []
      let permissionError = false
      files.forEach(file => {
        if (file.status === 'pending' && !file.uploadRepository) {
          file.uploadRepository = repositoryTarget(writeSession.context)
        }
      })

      for (let index = 0; index < files.length; index++) {
        const file = files[index]
        if (file.status !== 'pending') continue
        onBeforeUpload?.(file, index)

        const result = await this.uploadFile(file, {
          targetPath: file.targetPath || targetPath,
          series: file.targetSeries || series,
          computeFileHash,
          writeSession
        })
        results.push({ file, ...result })

        if (result.success) {
          uploadedFiles.push(file)
        }
        if (result.errorType === 'UPLOAD_CONTEXT_CHANGED') break

        if (result.errorType === 'PERMISSION_DENIED') {
          permissionError = true
          files.forEach(candidate => {
            if (candidate.status === 'pending') {
              candidate.status = 'error'
              candidate.error = '权限不足：您没有该仓库的写入权限'
            }
          })
          break
        }

        if (index < files.length - 1) {
          await wait(uploadDelayMs)
        }
      }

      return { results, uploadedFiles, permissionError, writeSession }
    },

    async generatePendingMetadata(
      uploadedFiles,
      { targetPath, series, getExtension, writeSession = repository.createWriteSession() }
    ) {
      if (!uploadedFiles?.length) return null
      if (uploadedFiles.some(file => !file.aiMetadata || file.aiMetadata.error)) {
        return { success: false, error: '图片缺少 AI 分析结果，请完成分析后重试' }
      }

      try {
        writeSession.assertCurrent()
        uploadedFiles.forEach(file =>
          assertSameRepository(file.uploadedRepository, writeSession.context)
        )
      } catch (error) {
        return { success: false, errorType: error.type, error: error.message }
      }

      const { owner, repo, branch, metadataPendingDir = 'metadata-pending' } = writeSession.context

      const pendingData = {
        version: 1,
        createdAt: new Date(now()).toISOString(),
        source: 'studio',
        targetRepo: { owner, repo, branch },
        images: uploadedFiles.map(file => {
          const fileTargetPath =
            file.uploadedPath?.split('/').slice(0, -1).join('/') || file.targetPath || targetPath
          const fileSeries = file.targetSeries || series
          const pathParts = fileTargetPath.split('/')

          return {
            series: fileSeries,
            relativePath: file.uploadedPath || `${fileTargetPath}/${file.name}`,
            category: pathParts[2] || '',
            subcategory: pathParts[3] || '',
            filename: file.name,
            createdAt: new Date(now()).toISOString(),
            size: file.size,
            format: getExtension(file.name),
            ai: file.aiMetadata
          }
        })
      }

      const pendingFilename = `${now()}-${random().toString(36).substring(2, 8)}.json`
      const pendingPath = `${metadataPendingDir}/${pendingFilename}`

      try {
        await writeSession.createFile(
          pendingPath,
          JSON.stringify(pendingData, null, 2),
          `Add pending metadata: ${pendingFilename}`
        )
        const cache = sessionCache.forContext(writeSession.context)
        cache.markHashesMetadataCommitted(uploadedFiles)
        cache.flush()
        uploadedFiles.forEach(file => {
          file.metadataPending = false
        })
        return { success: true, path: pendingPath, count: uploadedFiles.length }
      } catch (error) {
        return { success: false, errorType: error.type, error: error.message }
      }
    }
  }
}
