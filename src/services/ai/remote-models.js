import { normalizeAiBaseUrl, normalizeAiKey, aiConnectionError } from './session-credentials'
import { normalizeModelList } from './model-catalog'

export async function fetchRemoteModels({ apiKey, baseUrl, signal, timeoutMs = 20000 }) {
  const key = normalizeAiKey(apiKey)
  const url = normalizeAiBaseUrl(baseUrl)
  const controller = new globalThis.AbortController()
  const cancel = () => controller.abort()
  const cancelled = () => Object.assign(new Error('模型列表获取已取消'), { name: 'AbortError' })
  if (signal?.aborted) throw cancelled()
  signal?.addEventListener('abort', cancel, { once: true })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store'
    })
    if (signal?.aborted) throw cancelled()
    const isHtml = /\b(?:text\/html|application\/xhtml\+xml)\b/i.test(
      response.headers?.get('Content-Type') || ''
    )
    if (!response.ok || isHtml) {
      const message = isHtml
        ? `服务返回了网页而非模型数据（HTTP ${response.status}），请检查网关或代理配置`
        : response.status === 401
          ? 'API 认证失败（HTTP 401），请确认 Key 与 API 地址属于同一服务'
          : response.status === 403
            ? '模型接口访问被拒绝（HTTP 403），请检查网关限制和模型访问权限'
            : response.status === 502
              ? '上游网关异常（HTTP 502），请检查代理路由和服务可用性'
              : response.status === 404
                ? '此地址没有 models 接口，请确认 API 地址包含正确的 /v1 路径'
                : response.status === 429
                  ? '获取模型过于频繁，请稍后重试'
                  : `模型列表获取失败（HTTP ${response.status}），请重试`
      throw Object.assign(new Error(message), { code: 'MODEL_LIST_ERROR' })
    }
    const data = await response.json()
    if (signal?.aborted) throw cancelled()
    if (!Array.isArray(data?.data)) {
      throw Object.assign(new Error('模型列表格式无效，请确认这是 OpenAI 兼容接口'), {
        code: 'MODEL_LIST_ERROR'
      })
    }
    const models = normalizeModelList(data.data, key)
    if (!models.length) {
      throw Object.assign(new Error('此 API Key 暂无可用模型，请检查网关授权后重试'), {
        code: 'MODEL_LIST_ERROR'
      })
    }
    return models
  } catch (error) {
    if (signal?.aborted) throw cancelled()
    if (timedOut) throw new Error('获取模型列表超时，请重试')
    if (error.code === 'MODEL_LIST_ERROR') throw error
    throw new Error(aiConnectionError(url))
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}
