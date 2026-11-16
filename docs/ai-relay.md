# Studio AI HTTPS 转发

公开地址为 https://api.061129.xyz/v1，仅转发 GET /v1/models 与 POST /v1/chat/completions。浏览器使用当前标签页的 API Key；Worker 不保存 Key，并限制工作台 Origin。

回源链路：

Studio → ai-proxy Worker 路由 → 同域名的 Cloudflare Tunnel 源站 → 服务器 127.0.0.1:8052 → Sub2API。

这里使用 Worker Route（不是 Custom Domain）：对同 zone 的 fetch 访问该域名源站，不再次调用同一路由 Worker。不要把回源改成 Worker 自己的 workers.dev 地址。

隧道使用已有 sub2api-openai，配置为仅接收这两个精确路径，其他路径返回404。服务器由 studio-ai-tunnel.service 管理，开机启动、失败重启；cloudflared 位于 /opt/studio-ai-tunnel/cloudflared。隧道凭据使用服务器权限0600文件，不能提交仓库。

旧的 studio-ai-origin.061129.xyz:8052 域名 HTTP 回源曾返回 Non-compliance ICP Filing 403 HTML 页面，而同一服务器 IP 请求正常。显式设置 Host 在实际 Worker 回源中未解决，因此改用现有 Tunnel。Worker 将 HTML 上游响应转换为安全502 JSON，客户端区分401认证失败、403访问拒绝与502网关异常，不把全部403都解释为Key无效。

验证：

- node --test worker/tests/openai-relay.test.mjs
- npx vitest run src/services/ai/remote-models.test.js
- 线上读取模型列表确认200和CORS。
- 空聊天请求应返回400 model is required，可验证路由而不调用模型。
