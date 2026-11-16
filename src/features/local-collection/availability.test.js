import { describe, expect, it } from 'vitest'
import { isLocalCollectionEnabled } from './availability'

describe('本地采集开关', () => {
  it('本地开发开启，生产构建和远端主机始终关闭', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(isLocalCollectionEnabled(true, host)).toBe(true)
      expect(isLocalCollectionEnabled(false, host)).toBe(false)
    }
    for (const host of ['studio.example.com', '192.168.1.2', 'localhost.evil.test'])
      expect(isLocalCollectionEnabled(true, host)).toBe(false)
  })
})
