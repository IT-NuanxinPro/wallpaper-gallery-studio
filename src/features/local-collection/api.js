const ROOT = '/__local-collector'
export function createCollectorApi({ fetchImpl = (...args) => fetch(...args) } = {}) {
  const query = params =>
    new URLSearchParams(
      Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== '')
    ).toString()
  async function request(path, { body, token, signal, binary = false } = {}) {
    let response
    try {
      response = await fetchImpl(ROOT + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'X-Studio-Local': '1',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { 'X-GitHub-Token': token } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal
      })
    } catch (error) {
      if (error.name === 'AbortError') throw error
      throw new Error('无法连接本地采集服务，请检查配置后重试')
    }
    if (response.ok && binary) return response.blob()
    const data = await response.json().catch(() => null)
    if (!response.ok || data?.ok === false)
      throw new Error(data?.msg || '本地采集服务响应异常，请重试')
    return data
  }
  return {
    health: () => request('/health'),
    platforms: () => request('/platforms'),
    sources: platform => request('/sources?' + query({ platform })),
    status: () => request('/status'),
    files: params => request('/files?' + query(params)),
    runs: params => request('/runs?' + query(params)),
    batches: params => request('/batches?' + query(params)),
    async batch(id) {
      const data = await request('/batches?' + query({ batchId: id }))
      const batch = data.batch || data.batches?.find(item => item.id === id)
      if (!batch) throw new Error('本地批次不存在，请返回素材采集刷新')
      return { ok: true, batch }
    },
    reserveImport: body => request('/batches/import', { body }),
    start: body => request('/start', { body }),
    stop: () => request('/stop', { body: {} }),
    createBatch: body => request('/batches/create', { body }),
    receipt: (body, token) => request('/batches/receipt', { body, token }),
    deleteItems: body => request('/batches/items/delete', { body }),
    discard: (body, token) => request('/batches/discard', { body, token }),
    clean: (body, token) => request('/batches/clean', { body, token }),
    image: (params, signal) => request('/image?' + query(params), { binary: true, signal }),
    imageUrl: params => ROOT + '/image?' + query(params),
    thumbnailUrl: params => ROOT + '/thumbnail?' + query(params)
  }
}
