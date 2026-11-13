import legacyProxy from './legacy-cloudflare-proxy.js'
import { createOpenAIRelay } from './openai-relay.mjs'

const relay = createOpenAIRelay()

export default {
  fetch(request, env) {
    const path = new URL(request.url).pathname
    return path === '/v1' || path.startsWith('/v1/')
      ? relay.fetch(request, env)
      : legacyProxy.fetch(request, env)
  }
}
