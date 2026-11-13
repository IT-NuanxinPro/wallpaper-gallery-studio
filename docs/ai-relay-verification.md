# HTTPS AI 转发验收

2026-11-13。

- 公共 API Base：`https://api.061129.xyz/v1`。
- 固定上游：`http://studio-ai-origin.061129.xyz:8052`，DNS-only A记录指向 `39.102.124.66`。
- 复用 ai-proxy Worker，仅新增 models 和 chat/completions 两条路由；原 api 隧道和旧 Cloudflare 代理入口保留。
- Worker版本：`c6c1e0c9-a1cc-4432-bf43-fe4d6b0b60f0`。
- 单测10项通过，覆盖固定上游、Authorization与JSON透传、CORS、流式首块、取消、重定向和安全错误。
- 正式域名 models/chat预检均204，准确返回允许的工作台Origin。
- 虚构Key请求模型列表及分析接口均收到上游401/INVALID_API_KEY，确认已到达上游；未授权Origin返回403。
- 用户随后在本地5174工作台保存配置并确认成功获取远程模型。
- 此次未调用真实模型生成，不产生素材或壁纸发布；未读取或保存用户真实AI Key。
- HTTPS覆盖浏览器到Worker，上游链路保持用户指定的HTTP。
