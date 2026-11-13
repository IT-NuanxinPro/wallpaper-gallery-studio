import { describe, expect, it, vi } from 'vitest'
import { hashVideoFile, validateVideoFile, validateReview } from './domain'
import { createVideoUploader } from './uploader'
import { createVideoApi, VideoApiError } from './api'
import { analyzeVideoFrame, chooseVideoTopic, frameToBase64 } from './review-service'

function sourceFile(bytes, name = 'source.mp4') {
  const data = new Uint8Array(bytes)
  const reads = []
  return {
    name,
    size: data.length,
    type: 'video/mp4',
    reads,
    arrayBuffer() {
      throw new Error('禁止整文件读取')
    },
    slice(start, end) {
      reads.push([start, end])
      const chunk = data.slice(start, end)
      return { size: chunk.length, arrayBuffer: async () => chunk.buffer }
    }
  }
}

const review = {
  selectedFrameId: 'frame-1',
  usage: 'desktop',
  topic: '动漫',
  filename: '月光.mp4',
  displayTitle: '月光',
  description: '月光下的场景',
  keywords: ['月光']
}

describe('视频文件约束与流式散列', () => {
  it('只读取有界切片，SHA-256 与标准测试向量一致', async () => {
    const file = sourceFile([97, 98, 99])
    expect(await hashVideoFile(file, { chunkSize: 2 })).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(file.reads).toEqual([
      [0, 2],
      [2, 3]
    ])
  })

  it('拒绝空文件与超过250MB的源文件', () => {
    expect(() => validateVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 0 })).toThrow()
    expect(() => validateVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 250000001 })).toThrow()
    expect(() => validateVideoFile({ name: 'a.jpg', type: 'image/jpeg', size: 5 })).toThrow()
    expect(() =>
      validateVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 250000000 })
    ).not.toThrow()
  })

  it('按服务端扩展名接受无MIME的FLV，拒绝伪装视频MIME的exe', () => {
    expect(() => validateVideoFile({ name: 'a.flv', type: '', size: 8 })).not.toThrow()
    expect(() => validateVideoFile({ name: 'a.exe', type: 'video/mp4', size: 8 })).toThrow()
    expect(() => validateVideoFile({ name: 'a.ts', type: 'video/mp2t', size: 8 })).toThrow()
  })

  it('审核必须选择当前任务中的帧，并拒绝目录穿越文件名', () => {
    expect(validateReview(review, [{ id: 'frame-1' }])).toEqual([])
    expect(
      validateReview({ ...review, selectedFrameId: 'other' }, [{ id: 'frame-1' }])
    ).not.toEqual([])
    expect(
      validateReview({ ...review, filename: '../video.mp4' }, [{ id: 'frame-1' }])
    ).not.toEqual([])
  })
})

describe('可恢复视频上传', () => {
  it('完成响应丢失后续传先读取远端，已排队任务按成功接管而不重传', async () => {
    const file = sourceFile([1, 2, 3])
    const sha256 = await hashVideoFile(file)
    let remote = { id: 'lost-complete', size: file.size, sha256, status: 'uploading' }
    const api = {
      getJob: async () => remote,
      createJob: async () => remote,
      getUpload: async () => {
        if (remote.status !== 'uploading') throw new Error('当前任务已不需要上传')
        return { partSize: 4, parts: [] }
      },
      getPartUrls: async () => ({ parts: [{ partNumber: 1, url: 'part' }] }),
      completeUpload: async () => {
        remote = { ...remote, status: 'queued' }
        throw new Error('完成响应丢失')
      }
    }
    const uploader = createVideoUploader({ api, putPart: async () => 'etag' })
    await expect(uploader.upload(file)).rejects.toThrow('完成响应丢失')
    await expect(
      uploader.upload(file, { job: { ...remote, status: 'uploading' } })
    ).resolves.toMatchObject({ id: 'lost-complete', status: 'queued' })
  })

  it.each(['failed', 'expired'])('续传远端已为%s时不误报上传成功', async status => {
    const file = sourceFile([1, 2, 3])
    const sha256 = await hashVideoFile(file)
    const uploader = createVideoUploader({
      api: {
        getJob: async () => ({ id: 'terminal', size: file.size, sha256, status })
      }
    })
    await expect(
      uploader.upload(file, {
        job: { id: 'terminal', size: file.size, sha256, status: 'uploading' }
      })
    ).rejects.toThrow(status === 'expired' ? '过期' : '云端处理失败')
  })

  it('复用服务端已完成分块，只上传缺失分块后按序完成', async () => {
    const file = sourceFile([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const sha256 = await hashVideoFile(file)
    const uploaded = []
    let completed
    const api = {
      getJob: async () => ({ id: 'resume', size: 9, sha256, status: 'uploading' }),
      getUpload: async () => ({ partSize: 4, parts: [{ partNumber: 1, etag: 'saved', size: 4 }] }),
      getPartUrls: async (_id, numbers) => ({
        parts: numbers.map(partNumber => ({ partNumber, url: `part/${partNumber}` }))
      }),
      completeUpload: async (_id, parts) => {
        completed = parts
        return { id: 'resume', status: 'queued' }
      }
    }
    const uploader = createVideoUploader({
      api,
      putPart: async (url, blob) => {
        uploaded.push([url, blob.size])
        return `etag-${url.split('/')[1]}`
      }
    })
    const result = await uploader.upload(file, {
      job: { id: 'resume', size: 9, sha256, status: 'uploading' }
    })
    expect(result.status).toBe('queued')
    expect(uploaded).toEqual([
      ['part/2', 4],
      ['part/3', 1]
    ])
    expect(completed).toEqual([
      { partNumber: 1, etag: 'saved' },
      { partNumber: 2, etag: 'etag-2' },
      { partNumber: 3, etag: 'etag-3' }
    ])
  })

  it('重选文件内容不匹配时，拒绝发送分块', async () => {
    const api = { getUpload: vi.fn() }
    const uploader = createVideoUploader({ api })
    await expect(
      uploader.upload(sourceFile([9]), {
        job: { id: 'resume', size: 1, sha256: 'wrong', status: 'uploading' }
      })
    ).rejects.toThrow('文件内容')
    expect(api.getUpload).not.toHaveBeenCalled()
  })

  it('跨文件始终最多2个源文件、3个分块并行', async () => {
    let files = 0
    let maxFiles = 0
    let parts = 0
    let maxParts = 0
    let sequence = 0
    const api = {
      createJob: async body => {
        files++
        maxFiles = Math.max(maxFiles, files)
        return { ...body, id: `job-${++sequence}`, status: 'uploading' }
      },
      getUpload: async () => ({ partSize: 2, parts: [] }),
      getPartUrls: async (id, numbers) => ({
        parts: numbers.map(partNumber => ({ partNumber, url: `${id}/${partNumber}` }))
      }),
      completeUpload: async id => {
        files--
        return { id, status: 'queued' }
      }
    }
    const uploader = createVideoUploader({
      api,
      putPart: async () => {
        parts++
        maxParts = Math.max(maxParts, parts)
        await new Promise(resolve => setTimeout(resolve, 3))
        parts--
        return 'etag'
      }
    })
    await Promise.all([1, 2, 3, 4].map(n => uploader.upload(sourceFile([n, 2, 3, 4, 5, 6]))))
    expect(maxFiles).toBe(2)
    expect(maxParts).toBe(3)
    expect(parts).toBe(0)
  })
})

describe('视频接口与 AI 审核租约', () => {
  it('AI帧以无凭据CORS和no-store读取，保留签名查询并交给1024长边压缩器', async () => {
    const frame = new Blob(['high-resolution-frame'], { type: 'image/jpeg' })
    let request
    let compression
    const result = await frameToBase64(
      { url: 'https://frame.test/signed?X-Amz-Signature=fixture-signature' },
      {
        fetchImpl: async (...args) => {
          request = args
          return { ok: true, blob: async () => frame }
        },
        compress: async (blob, config) => {
          compression = { blob, config }
          return 'data:image/jpeg;base64,COMPRESSED'
        }
      }
    )
    expect(request).toEqual([
      'https://frame.test/signed?X-Amz-Signature=fixture-signature',
      { mode: 'cors', credentials: 'omit', cache: 'no-store' }
    ])
    expect(compression.blob).toBe(frame)
    expect(compression.config).toEqual({ maxSize: 1024, quality: 0.9, format: 'image/jpeg' })
    expect(result).toBe('data:image/jpeg;base64,COMPRESSED')
  })

  it('从视频主题接口读取已有分类，并复用当前鉴权', async () => {
    let request
    const api = createVideoApi({
      baseUrl: 'https://video.test',
      getToken: () => 'existing-token',
      fetchImpl: async (url, init) => {
        request = { url, init }
        return { ok: true, json: async () => ({ topics: ['动漫', '游戏', '宝可梦'] }) }
      }
    })
    expect(await api.getTopics()).toEqual({ topics: ['动漫', '游戏', '宝可梦'] })
    expect(request.url).toBe('https://video.test/video/topics')
    expect(request.init.headers.Authorization).toBe('Bearer existing-token')
  })

  it('AI优先匹配现有具体主题，无法匹配时保留原主题避免新增猜测分类', () => {
    expect(
      chooseVideoTopic({ secondary: '动漫', third: '宝可梦' }, '通用', ['动漫', '宝可梦'])
    ).toBe('宝可梦')
    expect(
      chooseVideoTopic({ secondary: '风景', third: '未知作品' }, '用户分类', ['动漫', '游戏'])
    ).toBe('用户分类')
    expect(chooseVideoTopic({ secondary: '动漫' }, '用户分类', [])).toBe('用户分类')
    expect(chooseVideoTopic({ secondary: '风景' }, '', [])).toBe('风景')
    expect(chooseVideoTopic({ secondary: '风景' }, '', ['动漫'])).toBe('')
  })

  it('业务请求携带现有 token，409保留明确冲突类型', async () => {
    let request
    const api = createVideoApi({
      baseUrl: 'https://video.test/',
      getToken: () => 'existing-token',
      fetchImpl: async (url, init) => {
        request = { url, init }
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: { code: 'REVISION_CONFLICT', message: '版本已更新' } })
        }
      }
    })
    const error = await api.saveReview('job-1', { revision: 2, review }).catch(value => value)
    expect(request.url).toBe('https://video.test/video/jobs/job-1/review')
    expect(request.init.headers.Authorization).toBe('Bearer existing-token')
    expect(JSON.parse(request.init.body)).toEqual({ revision: 2, review })
    expect(error).toBeInstanceOf(VideoApiError)
    expect(error.status).toBe(409)
    expect(error.code).toBe('REVISION_CONFLICT')
  })

  it('AI仅分析所选帧，以领取的版本写回并释放租约', async () => {
    let saved
    let released
    let input
    const api = {
      claimAi: async (_id, revision) => ({ leaseToken: 'lease', revision: revision + 1 }),
      saveReview: async (_id, body) => {
        saved = body
        return { id: 'job', review: body.review, status: 'awaiting_review' }
      },
      releaseAi: async (_id, leaseToken) => {
        released = leaseToken
      }
    }
    const job = {
      id: 'job',
      revision: 4,
      review,
      result: { frames: [{ id: 'frame-1', url: 'https://frame.test/signed' }] }
    }
    await analyzeVideoFrame({
      api,
      job,
      review,
      modelKey: 'existing-model',
      providerType: 'sub2api',
      credentials: { apiKey: 'existing-key' },
      topics: ['风景', '宝可梦'],
      frameToBase64: async () => 'data:image/webp;base64,AA',
      analyzeImage: async args => {
        input = args
        return {
          secondary: '风景',
          filenameSuggestions: ['星空.jpg'],
          displayTitle: '星空',
          description: '星空描述',
          keywords: ['星空'],
          confidence: 0.9
        }
      }
    })
    expect(input.imageBase64).toBe('data:image/webp;base64,AA')
    expect(input.file).toBeUndefined()
    expect(saved.revision).toBe(5)
    expect(saved.leaseToken).toBe('lease')
    expect(saved.review.filename).toBe('星空.mp4')
    expect(saved.review.topic).toBe('风景')
    expect(saved.review.ai).toMatchObject({
      frameId: 'frame-1',
      model: 'existing-model',
      confidence: 0.9
    })
    expect(released).toBe('lease')
  })

  it('分析途中清除或更换 Key 后不保存旧结果，并释放 AI 租约', async () => {
    const controller = new globalThis.AbortController()
    const saveReview = vi.fn()
    const releaseAi = vi.fn().mockResolvedValue(undefined)
    const api = {
      claimAi: async () => ({ leaseToken: 'lease', revision: 2 }),
      saveReview,
      releaseAi
    }
    await expect(
      analyzeVideoFrame({
        api,
        job: { id: 'job', revision: 1, result: { frames: [{ id: 'frame-1', url: 'signed' }] } },
        review,
        credentials: { apiKey: 'session-key', signal: controller.signal },
        frameToBase64: async () => 'data:image/webp;base64,AA',
        analyzeImage: async () => {
          controller.abort()
          return { filenameSuggestions: ['不应保存.jpg'] }
        }
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(saveReview).not.toHaveBeenCalled()
    expect(releaseAi).toHaveBeenCalledWith('job', 'lease')
  })

  it('分析失败仍释放AI租约，避免审核被长期锁住', async () => {
    const releaseAi = vi.fn().mockResolvedValue(undefined)
    const api = { claimAi: async () => ({ leaseToken: 'lease', revision: 2 }), releaseAi }
    await expect(
      analyzeVideoFrame({
        api,
        job: { id: 'job', revision: 1, result: { frames: [{ id: 'frame-1', url: 'signed' }] } },
        review,
        frameToBase64: async () => {
          throw new Error('封面下载失败')
        }
      })
    ).rejects.toThrow('封面下载失败')
    expect(releaseAi).toHaveBeenCalledWith('job', 'lease')
  })
})
