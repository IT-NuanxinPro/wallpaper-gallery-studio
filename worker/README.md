# AI 转发 Worker

`ai-proxy.js` 保留原 Cloudflare AI 代理入口，并为工作台提供 OpenAI 兼容接口的 HTTPS 转发。

## 当前转发

工作台填写 API 地址：

```text
https://api.061129.xyz/v1
```

代理只开放：

- `GET /v1/models`
- `POST /v1/chat/completions`
- 对应路径的 `OPTIONS` 预检

固定上游为 `http://studio-ai-origin.061129.xyz:8052`，该DNS-only A记录指向 `39.102.124.66`；避免Worker直接fetch IP产生1003，路径原样追加。API Key 必须使用这个上游服务签发的 Key；代理不替换或保存 Key，不修改模型和请求体。

域名仅给这两个路径配置 Worker Route，其他路径仍由原域名配置处理。旧 Cloudflare 代理根路径保存在 `legacy-cloudflare-proxy.js`，现有调用保持兼容。

## 部署与测试

```sh
node --test worker/tests/openai-relay.test.mjs
npx wrangler deploy --config wrangler.ai-proxy.toml
```

配置中的账号、域名与允许来源是本实例值。自行部署时修改 `wrangler.ai-proxy.toml` 和固定上游；不要建立接受任意 target/url 的开放代理。

## 边界

- 浏览器到 Worker 是 HTTPS，Worker 到指定上游仍为 HTTP。
- 只允许配置中的工作台 Origin。命令行无 Origin 请求仍必须携带 Bearer Key。
- 成功 JSON 和 SSE 响应直接透传；不缓存、不读取完整流，客户端取消信号传给上游。
- Worker 用 manual 模式处理重定向，任何 3xx 拒绝，不把 Authorization 带到新目标。
- 不转发 Cookie/Origin 等无关请求头，不返回 Set-Cookie；日志观测默认关闭。
- 上游401/429等状态保留，Worker内部异常只返回固定提示。
