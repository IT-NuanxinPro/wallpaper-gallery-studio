import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

/**
 * 文件内容始终使用标准 SHA-256，保证 HTTPS、localhost 和局域网 HTTP 的缓存键一致。
 */
export async function sha256Hex(buffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
    return bytesToHex(new Uint8Array(digest))
  }

  // 普通 HTTP 局域网地址没有 Web Crypto，使用本地 JavaScript 实现。
  return bytesToHex(sha256(new Uint8Array(buffer)))
}
