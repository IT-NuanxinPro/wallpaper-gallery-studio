/**
 * Cloudflare Worker - AI 分析代理
 * 部署到 Cloudflare Workers 解决 CORS 问题
 * 支持多个 AI 视觉模型
 */

export default {
  async fetch(request, env) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      })
    }

    // 只允许 POST 请求
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    try {
      // 解析请求体
      const {
        accountId,
        aiToken,
        image,
        prompt,
        model = '@cf/meta/llama-3.2-11b-vision-instruct', // 默认模型
        maxTokens = 10000,
        temperature = 0.3
      } = await request.json()

      // 验证必需参数
      if (!accountId || !aiToken || !image || !prompt) {
        return new Response(
          JSON.stringify({
            error: '缺少必要参数',
            required: ['accountId', 'aiToken', 'image', 'prompt'],
            optional: ['model', 'maxTokens', 'temperature']
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        )
      }

      // 验证模型参数
      const supportedModels = [
        '@cf/meta/llama-3.2-11b-vision-instruct',
        '@cf/llava-hf/llava-1.5-7b-hf',
        '@cf/uform-gen2-qwen-500m'
      ]

      if (!supportedModels.includes(model)) {
        return new Response(
          JSON.stringify({
            error: '不支持的模型',
            model: model,
            supported: supportedModels
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        )
      }

      // 将 base64 转换为 data URI 格式
      const imageDataUri = `data:image/jpeg;base64,${image}`

      // 调用 Cloudflare AI API
      const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageDataUri
                  }
                }
              ]
            }
          ],
          max_tokens: maxTokens,
          temperature: temperature
        })
      })

      // 获取响应
      const data = await response.json()

      // 返回结果
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: '服务器错误',
          message: error.message,
          stack: error.stack
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }
  }
}
