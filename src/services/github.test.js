import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeGitHubContentPath, githubService } from './github'

const IMAGE_PATH = 'wallpaper/desktop/风景/城市/7713_wallhaven壁纸_#7753.jpeg'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('encodeGitHubContentPath', () => {
  it('按路径段编码 URL 保留字符', () => {
    const encodedPath = encodeGitHubContentPath(IMAGE_PATH)
    const url = new URL(`https://api.github.com/repos/owner/repo/contents/${encodedPath}`)

    expect(encodedPath).toContain('%23')
    expect(url.hash).toBe('')
    expect(decodeURIComponent(url.pathname)).toBe(`/repos/owner/repo/contents/${IMAGE_PATH}`)
  })
})

describe('GitHubService.uploadImage', () => {
  it('使用编码后的路径上传并校验返回路径', async () => {
    vi.spyOn(githubService, 'fileToBase64').mockResolvedValue('base64-content')
    vi.spyOn(githubService, 'ensureDirectoryExists').mockResolvedValue()
    const request = vi
      .spyOn(githubService, 'request')
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ content: { path: IMAGE_PATH } })

    await githubService.uploadImage(
      'IT-NuanxinPro',
      'nuanXinProPic',
      IMAGE_PATH,
      {},
      'Upload test',
      'main'
    )

    const endpoint = `/repos/IT-NuanxinPro/nuanXinProPic/contents/${encodeGitHubContentPath(IMAGE_PATH)}`
    expect(request).toHaveBeenNthCalledWith(1, `${endpoint}?ref=main`)
    expect(request).toHaveBeenNthCalledWith(2, endpoint, expect.objectContaining({ method: 'PUT' }))
  })

  it('返回路径不一致时不能标记上传成功', async () => {
    vi.spyOn(githubService, 'fileToBase64').mockResolvedValue('base64-content')
    vi.spyOn(githubService, 'ensureDirectoryExists').mockResolvedValue()
    vi.spyOn(githubService, 'request')
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ content: { path: 'wallpaper/desktop/7713_wallhaven壁纸_' } })

    await expect(
      githubService.uploadImage(
        'IT-NuanxinPro',
        'nuanXinProPic',
        IMAGE_PATH,
        {},
        'Upload test',
        'main'
      )
    ).rejects.toMatchObject({
      type: 'UPLOAD_PATH_MISMATCH',
      expectedPath: IMAGE_PATH
    })
  })
})
