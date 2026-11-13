import { describe, expect, it } from 'vitest'
import { createVideoUploadManager } from './upload-manager'
import { createVideoUploader } from './uploader'

const source = () => new globalThis.File(['video-source'], 'video.mp4', { type: 'video/mp4' })

describe('视频上传源文件生命周期', () => {
  it('完成响应丢失后的重试从远端接管排队任务并释放本地源', async () => {
    const file = source()
    let remote = {
      id: 'lost-response',
      size: file.size,
      sha256: 'fixture-hash',
      status: 'uploading'
    }
    const uploader = createVideoUploader({
      hashFile: async () => 'fixture-hash',
      putPart: async () => 'etag',
      api: {
        createJob: async () => remote,
        getJob: async () => remote,
        getUpload: async () => ({ partSize: file.size, parts: [] }),
        getPartUrls: async () => ({ parts: [{ partNumber: 1, url: 'part' }] }),
        completeUpload: async () => {
          remote = { ...remote, status: 'queued' }
          throw new Error('完成响应丢失')
        }
      }
    })
    const manager = createVideoUploadManager({ uploader })
    await manager.addFiles([file])
    const id = manager.transfers.value[0].id
    expect(manager.canRetry(id)).toBe(true)
    await expect(manager.retry(id)).resolves.toMatchObject({ status: 'queued' })
    expect(manager.transfers.value).toEqual([])
    expect(manager.canRetry(id)).toBe(false)
  })

  it('成功后清除传输项与原File引用，收尾刷新失败不把成功误标为失败', async () => {
    let settled
    const manager = createVideoUploadManager({
      uploader: {
        upload: async (_file, options) => {
          options.onJob({ id: 'job-1', status: 'uploading' })
          return { id: 'job-1', status: 'queued' }
        }
      },
      onSettled: event => {
        settled = event
        throw new Error('列表刷新中断')
      }
    })
    const outcomes = await manager.addFiles([source()])
    expect(outcomes[0].status).toBe('fulfilled')
    expect(settled.status).toBe('done')
    expect(manager.transfers.value).toEqual([])
    expect(manager.canRetry(settled.id)).toBe(false)
    expect(manager.hasActiveTransfers.value).toBe(false)
  })

  it('失败保留同一源文件及服务端任务用于重试，成功后释放', async () => {
    const file = source()
    const seen = []
    let attempts = 0
    const manager = createVideoUploadManager({
      uploader: {
        upload: async (value, options) => {
          seen.push({ file: value, job: options.job })
          options.onJob({ id: 'job-1', status: 'uploading' })
          if (++attempts === 1) throw new Error('分块网络中断')
          return { id: 'job-1', status: 'queued' }
        }
      }
    })
    const first = await manager.addFiles([file])
    expect(first[0].status).toBe('rejected')
    const id = manager.transfers.value[0].id
    expect(manager.canRetry(id)).toBe(true)
    expect(manager.transfers.value[0].stage).toBe('error')
    expect(Object.values(manager.transfers.value[0])).not.toContain(file)
    await manager.retry(id)
    expect(seen[0].file).toBe(file)
    expect(seen[1]).toEqual({ file, job: { id: 'job-1', status: 'uploading' } })
    expect(manager.canRetry(id)).toBe(false)
    expect(manager.transfers.value).toEqual([])
  })

  it('暂停保留源并可重试，dispose终止并清空所有本地资源', async () => {
    let attempts = 0
    const manager = createVideoUploadManager({
      uploader: {
        upload: (_file, options) => {
          options.onJob({ id: 'job-1', status: 'uploading' })
          if (++attempts > 1) return Promise.resolve({ id: 'job-1', status: 'queued' })
          return new Promise((_, reject) =>
            options.signal.addEventListener(
              'abort',
              () => {
                const error = new Error('已暂停')
                error.name = 'AbortError'
                reject(error)
              },
              { once: true }
            )
          )
        }
      }
    })
    const result = manager.addFiles([source()])
    const id = manager.transfers.value[0].id
    expect(manager.hasActive('job-1')).toBe(true)
    manager.pause(id)
    await result
    expect(manager.transfers.value[0].stage).toBe('paused')
    expect(manager.canRetry(id)).toBe(true)
    await manager.retry(id)
    expect(manager.transfers.value).toEqual([])
    manager.dispose()
    expect(manager.activeCount.value).toBe(0)
    expect(manager.canRetry(id)).toBe(false)
  })

  it('一个文件成功后立即离开本地队列，不等待同批另一个文件失败或暂停', async () => {
    let releaseSlow
    let firstSettled
    const firstDone = new Promise(resolve => {
      firstSettled = resolve
    })
    const manager = createVideoUploadManager({
      uploader: {
        upload: async file => {
          if (file.name === 'slow.mp4')
            return new Promise(resolve => {
              releaseSlow = resolve
            })
          return { id: 'fast-job', status: 'queued' }
        }
      },
      onSettled: event => {
        if (event.jobId === 'fast-job') firstSettled(event)
      }
    })
    const batch = manager.addFiles([
      source(),
      new globalThis.File(['slow'], 'slow.mp4', { type: 'video/mp4' })
    ])
    const completed = await firstDone
    expect(manager.canRetry(completed.id)).toBe(false)
    expect(manager.transfers.value.map(item => item.filename)).toEqual(['slow.mp4'])
    expect(manager.activeCount.value).toBe(1)
    releaseSlow({ id: 'slow-job', status: 'queued' })
    await batch
    expect(manager.transfers.value).toEqual([])
  })

  it('dispose立即中止在途任务，释放可恢复源并忽略晚到回调', async () => {
    let signal
    let settle
    let notifications = 0
    const manager = createVideoUploadManager({
      uploader: {
        upload: (_file, options) => {
          signal = options.signal
          return new Promise(resolve => {
            settle = () => {
              options.onJob({ id: 'late-job' })
              resolve({ id: 'late-job', status: 'queued' })
            }
          })
        }
      },
      onJob: () => {
        notifications++
      },
      onSettled: () => {
        notifications++
      }
    })
    const batch = manager.addFiles([source()])
    const id = manager.transfers.value[0].id
    manager.dispose()
    expect(signal.aborted).toBe(true)
    expect(manager.canRetry(id)).toBe(false)
    expect(manager.transfers.value).toEqual([])
    settle()
    await batch
    expect(notifications).toBe(0)
    expect(manager.transfers.value).toEqual([])
  })

  it('重选源文件恢复同一任务成功后，也清除原暂停项的文件引用', async () => {
    let attempts = 0
    const manager = createVideoUploadManager({
      uploader: {
        upload: async (_file, options) => {
          options.onJob({ id: 'same-job', status: 'uploading' })
          if (++attempts === 1) {
            const error = new Error('已暂停')
            error.name = 'AbortError'
            throw error
          }
          return { id: 'same-job', status: 'queued' }
        }
      }
    })
    await manager.addFiles([source()])
    const pausedId = manager.transfers.value[0].id
    expect(manager.canRetry(pausedId)).toBe(true)
    await manager.addFiles([source()], { resumeJob: { id: 'same-job', status: 'uploading' } })
    expect(manager.transfers.value).toEqual([])
    expect(manager.canRetry(pausedId)).toBe(false)
  })
})
