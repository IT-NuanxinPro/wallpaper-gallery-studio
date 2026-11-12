import { sha256Hex } from './file-hash'

// 保留后台线程计算，避免批量添加图片时阻塞页面。
globalThis.onmessage = async ({ data: { id, fileData } }) => {
  try {
    const hash = await sha256Hex(fileData)
    globalThis.postMessage({ id, hash, success: true })
  } catch (error) {
    globalThis.postMessage({ id, error: error.message, success: false })
  }
}
