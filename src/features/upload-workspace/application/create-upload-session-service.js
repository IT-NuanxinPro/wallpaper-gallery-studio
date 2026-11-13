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

export function createUploadSessionService({
  repository,
  sessionCache,
  historyStore,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => Date.now(),
  random = Math.random
}) {
  return {
    async uploadFile(uploadFile, { targetPath, series, computeFileHash }) {
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
        const path = `${targetPath}/${uploadFile.name}`
        const message = `Upload: ${uploadFile.name}`
        const hash = uploadFile.fileHash || (await computeFileHash(uploadFile.file))
        uploadFile.fileHash = hash

        const existingUpload = sessionCache.isHashUploaded(hash)
        if (existingUpload) {
          uploadFile.reusedExisting = false
          uploadFile.status = 'error'
          uploadFile.error = `该图片已完整上传，请勿重复上传（${existingUpload.path}）`
          return { success: false, errorType: 'DUPLICATE', error: uploadFile.error }
        }

        const pendingUpload = sessionCache.getPendingUploadedHash(hash)
        if (pendingUpload) {
          uploadFile.progress = 100
          uploadFile.status = 'success'
          uploadFile.error = null
          uploadFile.reusedExisting = true
          return {
            success: true,
            reusedExisting: true,
            existingPath: pendingUpload.path
          }
        }

        await repository.uploadImage(path, uploadFile.file, message)
        uploadFile.progress = 100
        uploadFile.status = 'success'
        uploadFile.reusedExisting = false
        sessionCache.addPendingUploadedHash(hash, uploadFile.name, path)

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
      { uploadDelayMs, targetPath, series, computeFileHash, onBeforeUpload = null }
    ) {
      const results = []
      const uploadedFiles = []
      let permissionError = false

      for (let index = 0; index < files.length; index++) {
        const file = files[index]
        if (file.status !== 'pending') continue
        onBeforeUpload?.(file, index)

        const result = await this.uploadFile(file, {
          targetPath: file.targetPath || targetPath,
          series: file.targetSeries || series,
          computeFileHash
        })
        results.push({ file, ...result })

        if (result.success) {
          uploadedFiles.push(file)
        }

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

      return { results, uploadedFiles, permissionError }
    },

    async generatePendingMetadata(uploadedFiles, { targetPath, series, getExtension }) {
      if (!uploadedFiles?.length) return null
      if (uploadedFiles.some(file => !file.aiMetadata || file.aiMetadata.error)) {
        return { success: false, error: '图片缺少 AI 分析结果，请完成分析后重试' }
      }

      const {
        owner,
        repo,
        branch,
        metadataPendingDir = 'metadata-pending'
      } = repository.getContext()

      const pendingData = {
        version: 1,
        createdAt: new Date(now()).toISOString(),
        source: 'studio',
        targetRepo: { owner, repo, branch },
        images: uploadedFiles.map(file => {
          const fileTargetPath = file.targetPath || targetPath
          const fileSeries = file.targetSeries || series
          const pathParts = fileTargetPath.split('/')

          return {
            series: fileSeries,
            relativePath: `${fileTargetPath}/${file.name}`,
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
        await repository.createFile(
          pendingPath,
          JSON.stringify(pendingData, null, 2),
          `Add pending metadata: ${pendingFilename}`
        )
        return { success: true, path: pendingPath, count: uploadedFiles.length }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
  }
}
