import { beforeEach, describe, expect, it } from 'vitest'
import { createUploadSessionService } from './create-upload-session-service'
import { createGitHubUploadWorkspaceRepository } from '../infrastructure/create-github-upload-workspace-repository'
import { createUploadSessionCache } from '../infrastructure/create-upload-session-cache'

function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })
  return { promise, resolve }
}

function fixture() {
  const state = {
    target: { owner: 'owner-a', repo: 'repo-a', branch: 'main' },
    writes: [],
    gate: null,
    beforeRequest: null
  }
  const client = {
    token: 'token-a',
    async request(endpoint, options) {
      state.writes.push({ endpoint, token: this.token, body: JSON.parse(options.body) })
      if (state.gate) {
        const gate = state.gate
        state.gate = null
        await gate.promise
      }
      return {}
    },
    async uploadImage(owner, repo, path, _file, _message, branch) {
      if (state.beforeRequest) await state.beforeRequest()
      return this.request(`/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({ branch })
      })
    },
    async createFile(owner, repo, path, content, _message, branch) {
      return this.request(`/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({ branch, content })
      })
    }
  }
  const repository = createGitHubUploadWorkspaceRepository({
    githubClient: client,
    getRepositoryConfig: () => state.target,
    getAppConfig: () => ({
      repository: { branch: 'main', wallpaperRoot: 'wallpaper' },
      upload: { metadataPendingDir: 'metadata-pending' }
    })
  })
  const cache = createUploadSessionCache({
    getRepositoryContext: repository.getContext,
    debounceMs: 0
  })
  const service = createUploadSessionService({
    repository,
    sessionCache: cache,
    historyStore: { addRecord: () => {} },
    wait: async () => {}
  })
  const files = ['a', 'b'].map(id => ({
    id,
    name: `${id}.png`,
    file: new globalThis.File([id], `${id}.png`),
    fileHash: id,
    size: 1,
    status: 'pending',
    targetSeries: 'desktop',
    targetPath: 'wallpaper/desktop/风景',
    aiMetadata: { description: id }
  }))
  return { state, client, repository, cache, service, files }
}

beforeEach(() => localStorage.clear())

describe('图片批次仓库与身份隔离', () => {
  it('首图在途切到B后停止后续图片和metadata，返回A可补元数据', async () => {
    const { state, cache, service, files } = fixture()
    const gate = deferred()
    state.gate = gate
    const uploading = service.uploadPendingFiles(files, {
      uploadDelayMs: 0,
      computeFileHash: async () => 'unused'
    })
    await Promise.resolve()
    const originalTarget = { ...state.target }
    state.target = { owner: 'owner-b', repo: 'repo-b', branch: 'other' }
    gate.resolve()
    const batch = await uploading
    expect(state.writes.map(write => write.endpoint)).toEqual([
      '/repos/owner-a/repo-a/contents/wallpaper/desktop/风景/a.png'
    ])
    expect(batch.uploadedFiles).toHaveLength(1)
    expect(files[1].uploadRepository).toEqual(originalTarget)
    expect(files[0]).toMatchObject({ uploadedRepository: originalTarget, metadataPending: true })
    const metadata = await service.generatePendingMetadata(batch.uploadedFiles, {
      getExtension: () => 'png',
      writeSession: batch.writeSession
    })
    expect(metadata).toMatchObject({ success: false, errorType: 'UPLOAD_CONTEXT_CHANGED' })
    const wrongTargetRetry = await service.generatePendingMetadata(batch.uploadedFiles, {
      getExtension: () => 'png'
    })
    expect(wrongTargetRetry).toMatchObject({ success: false, errorType: 'UPLOAD_CONTEXT_CHANGED' })
    expect(state.writes).toHaveLength(1)
    expect(cache.getPendingUploadedHash('a')).toBeNull()
    state.target = originalTarget
    expect(cache.getPendingUploadedHash('a')).toMatchObject({
      filename: 'a.png',
      repository: originalTarget
    })
    expect(JSON.stringify(localStorage)).not.toContain('token-a')
    const retry = await service.generatePendingMetadata(batch.uploadedFiles, {
      getExtension: () => 'png'
    })
    expect(retry.success).toBe(true)
    expect(state.writes[1].endpoint).toContain('/repos/owner-a/repo-a/contents/metadata-pending/')
  })

  it('图片全部成功后再切B，metadata也不能用B目标写出', async () => {
    const { state, service, files } = fixture()
    const batch = await service.uploadPendingFiles(files, {
      uploadDelayMs: 0,
      computeFileHash: async () => 'unused'
    })
    state.target = { owner: 'owner-b', repo: 'repo-b', branch: 'main' }
    const result = await service.generatePendingMetadata(batch.uploadedFiles, {
      getExtension: () => 'png',
      writeSession: batch.writeSession
    })
    expect(result).toMatchObject({ success: false, errorType: 'UPLOAD_CONTEXT_CHANGED' })
    expect(state.writes).toHaveLength(2)
  })

  it('图片编码等待期间换token，request边界阻止旧批次借新token写出', async () => {
    const { state, client, service, files } = fixture()
    state.beforeRequest = async () => {
      client.token = 'token-b'
    }
    const result = await service.uploadPendingFiles(files, {
      uploadDelayMs: 0,
      computeFileHash: async () => 'unused'
    })
    expect(result.results[0]).toMatchObject({ success: false, errorType: 'UPLOAD_CONTEXT_CHANGED' })
    expect(state.writes).toHaveLength(0)
  })

  it('A已有同hash未提交记录不让B跳过实际图片上传', async () => {
    const { state, service, files } = fixture()
    await service.uploadPendingFiles([files[0]], {
      uploadDelayMs: 0,
      computeFileHash: async () => 'unused'
    })
    state.target = { owner: 'owner-b', repo: 'repo-b', branch: 'main' }
    const freshFile = { ...files[1], fileHash: 'a' }
    await service.uploadPendingFiles([freshFile], {
      uploadDelayMs: 0,
      computeFileHash: async () => 'unused'
    })
    expect(state.writes).toHaveLength(2)
    expect(state.writes[1].endpoint).toBe(
      '/repos/owner-b/repo-b/contents/wallpaper/desktop/风景/b.png'
    )
    expect(freshFile.reusedExisting).toBe(false)
  })
})
