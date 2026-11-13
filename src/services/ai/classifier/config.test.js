import { describe, expect, it } from 'vitest'
import { normalizeModelId } from '../model'
import { getModelByKey } from './config'

describe('远程模型标识', () => {
  it.each(['vision-alpha', 'vendor/vision-beta'])('合法模型 %s 可用于显示历史结果', id => {
    expect(getModelByKey(id)).toEqual({ id, key: id, name: id, provider: 'sub2api' })
  })

  it('去除首尾空白但不接受空模型、内部空白、控制字符或超长ID', () => {
    expect(normalizeModelId('  vendor/vision-beta  ')).toBe('vendor/vision-beta')
    for (const value of [
      '',
      null,
      '   ',
      'bad model',
      'bad\nmodel',
      `bad${String.fromCharCode(0)}model`,
      `bad${String.fromCharCode(128)}model`,
      'x'.repeat(201)
    ]) {
      expect(normalizeModelId(value)).toBe('')
      expect(getModelByKey(value)).toBeNull()
    }
  })
})
