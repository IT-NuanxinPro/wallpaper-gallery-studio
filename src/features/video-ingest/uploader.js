import { abortError, hashVideoFile, validateVideoFile } from './domain'

function createLimiter(limit) {
  let active = 0
  const waiting = []
  return async function run(task, signal) {
    if (active >= limit) await new Promise(resolve => waiting.push(resolve))
    active++
    try {
      if (signal?.aborted) throw abortError()
      return await task()
    } finally {
      active--
      waiting.shift()?.()
    }
  }
}

// 签名对象请求不能携带 GitHub token；对象存储必须通过 CORS 暴露 ETag。
export function putVideoPart(url, blob, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const xhr = new globalThis.XMLHttpRequest()
    const onAbort = () => xhr.abort()
    const finish = callback => value => {
      signal?.removeEventListener('abort', onAbort)
      callback(value)
    }
    const fail = finish(reject)
    xhr.open('PUT', url)
    xhr.timeout = 120000
    xhr.upload.onprogress = event => onProgress?.(event.loaded)
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300)
        return fail(new Error(`分块上传失败（${xhr.status}）`))
      const etag = xhr.getResponseHeader('ETag')
      if (!etag) return fail(new Error('对象存储未返回可读取的 ETag，请检查视频桶 CORS 配置'))
      finish(resolve)(etag)
    }
    xhr.onerror = () => fail(new Error('分块上传网络中断，请重选源文件继续'))
    xhr.ontimeout = () => fail(new Error('分块上传超时，请重选源文件继续'))
    xhr.onabort = () => fail(abortError())
    signal?.addEventListener('abort', onAbort, { once: true })
    xhr.send(blob)
  })
}

export function createVideoUploader({ api, putPart = putVideoPart, hashFile = hashVideoFile }) {
  const withFile = createLimiter(2)
  const withPart = createLimiter(3)

  async function upload(file, options = {}) {
    const { signal: externalSignal, onProgress, onJob } = options
    validateVideoFile(file)
    return withFile(async () => {
      const controller = new globalThis.AbortController()
      const signal = controller.signal
      const stop = () => controller.abort()
      externalSignal?.addEventListener('abort', stop, { once: true })
      if (externalSignal?.aborted) controller.abort()
      try {
        onProgress?.({ stage: 'hashing', percent: 0 })
        const sha256 = await hashFile(file, {
          signal,
          onProgress: (loaded, total) => {
            onProgress?.({ stage: 'hashing', percent: Math.round((loaded / total) * 100) })
          }
        })
        let job = options.job
        if (job && (job.size !== file.size || job.sha256 !== sha256)) {
          throw new Error('重选的文件内容与原任务不一致，请选择原始视频')
        }
        if (!job) {
          job = await api.createJob(
            {
              filename: file.name,
              size: file.size,
              sha256,
              contentType: file.type || 'application/octet-stream',
              idempotencyKey: options.idempotencyKey || globalThis.crypto.randomUUID()
            },
            signal
          )
        }
        onJob?.(job)
        if (job.status !== 'uploading') return job
        const uploadState = await api.getUpload(job.id, signal)
        if (!Number.isInteger(uploadState.partSize) || uploadState.partSize <= 0)
          throw new Error('服务端返回了无效分块大小')
        const count = Math.ceil(file.size / uploadState.partSize)
        const completed = new Map()
        const loaded = new Map()
        for (const part of uploadState.parts || []) {
          const expected = Math.min(
            uploadState.partSize,
            file.size - (part.partNumber - 1) * uploadState.partSize
          )
          if (
            !Number.isInteger(part.partNumber) ||
            part.partNumber < 1 ||
            part.partNumber > count ||
            part.size !== expected ||
            !part.etag
          ) {
            throw new Error('服务端分块记录不完整，请刷新任务后重试')
          }
          completed.set(part.partNumber, { partNumber: part.partNumber, etag: part.etag })
          loaded.set(part.partNumber, part.size)
        }
        const report = () =>
          onProgress?.({
            stage: 'uploading',
            percent: Math.round(([...loaded.values()].reduce((a, b) => a + b, 0) / file.size) * 100)
          })
        report()
        const missing = Array.from({ length: count }, (_, index) => index + 1).filter(
          number => !completed.has(number)
        )
        const results = await Promise.allSettled(
          missing.map(partNumber =>
            withPart(async () => {
              const start = (partNumber - 1) * uploadState.partSize
              const blob = file.slice(start, Math.min(start + uploadState.partSize, file.size))
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  if (signal.aborted) throw abortError()
                  // 每次重试重新领取短期 URL，避免重用过期签名。
                  const signed = await api.getPartUrls(job.id, [partNumber], signal)
                  const url = signed.parts?.find(part => part.partNumber === partNumber)?.url
                  if (!url) throw new Error('未取得分块上传地址')
                  const etag = await putPart(url, blob, {
                    signal,
                    onProgress: size => {
                      loaded.set(partNumber, Math.min(size, blob.size))
                      report()
                    }
                  })
                  completed.set(partNumber, { partNumber, etag })
                  loaded.set(partNumber, blob.size)
                  report()
                  return
                } catch (error) {
                  loaded.set(partNumber, 0)
                  if (signal.aborted || attempt === 2) throw error
                }
              }
            }, signal).catch(error => {
              controller.abort()
              throw error
            })
          )
        )
        const failure =
          results.find(
            result => result.status === 'rejected' && result.reason?.name !== 'AbortError'
          ) || results.find(result => result.status === 'rejected')
        if (failure) throw failure.reason
        if (signal.aborted) throw abortError()
        onProgress?.({ stage: 'completing', percent: 100 })
        job = await api.completeUpload(
          job.id,
          [...completed.values()].sort((a, b) => a.partNumber - b.partNumber),
          signal
        )
        onJob?.(job)
        onProgress?.({ stage: 'done', percent: 100 })
        return job
      } finally {
        externalSignal?.removeEventListener('abort', stop)
      }
    }, externalSignal)
  }

  return { upload }
}
