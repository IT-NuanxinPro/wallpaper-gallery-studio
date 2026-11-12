export class VideoApiError extends Error {
  constructor(message, status = 0, code = 'REQUEST_FAILED') {
    super(message)
    this.name = 'VideoApiError'
    this.status = status
    this.code = code
  }
}

export function createVideoApi({
  baseUrl = '',
  getToken,
  fetchImpl = (...args) => fetch(...args)
}) {
  const root = baseUrl.trim().replace(/\/+$/, '')
  const jobPath = id => `/video/jobs/${encodeURIComponent(id)}`
  const publicationPath = id => `/video/publications/${encodeURIComponent(id)}`

  async function request(path, { method = 'GET', body, signal } = {}) {
    if (!root) throw new VideoApiError('尚未配置视频服务地址', 0, 'NOT_CONFIGURED')
    const token = getToken?.()
    if (!token) throw new VideoApiError('登录已失效，请重新登录', 401, 'UNAUTHORIZED')
    let response
    try {
      response = await fetchImpl(`${root}${path}`, {
        method,
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    } catch (error) {
      if (error.name === 'AbortError') throw error
      throw new VideoApiError('无法连接视频服务，请检查网络后重试', 0, 'NETWORK_ERROR')
    }
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new VideoApiError(
        data?.error?.message || `视频服务请求失败（${response.status}）`,
        response.status,
        data?.error?.code
      )
    }
    if (!data)
      throw new VideoApiError('视频服务返回了无效数据', response.status, 'INVALID_RESPONSE')
    return data
  }

  return {
    configured: !!root,
    getTopics: signal => request('/video/topics', { signal }),
    createJob: (body, signal) => request('/video/jobs', { method: 'POST', body, signal }),
    listJobs: signal => request('/video/jobs', { signal }),
    getJob: id => request(jobPath(id)),
    getUpload: (id, signal) => request(`${jobPath(id)}/upload`, { signal }),
    getPartUrls: (id, partNumbers, signal) =>
      request(`${jobPath(id)}/upload/parts`, { method: 'POST', body: { partNumbers }, signal }),
    completeUpload: (id, parts, signal) =>
      request(`${jobPath(id)}/upload/complete`, { method: 'POST', body: { parts }, signal }),
    claimAi: (id, revision) =>
      request(`${jobPath(id)}/ai/claim`, { method: 'POST', body: { revision } }),
    releaseAi: (id, leaseToken) =>
      request(`${jobPath(id)}/ai/release`, { method: 'POST', body: { leaseToken } }),
    saveReview: (id, body) => request(`${jobPath(id)}/review`, { method: 'PATCH', body }),
    retryJob: id => request(`${jobPath(id)}/retry`, { method: 'POST' }),
    publish: jobs => request('/video/publications', { method: 'POST', body: { jobs } }),
    getPublication: id => request(publicationPath(id)),
    retryPublication: id => request(`${publicationPath(id)}/retry`, { method: 'POST' })
  }
}
