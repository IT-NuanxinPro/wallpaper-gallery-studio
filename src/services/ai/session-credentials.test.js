import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSessionCredentialStorage,
  normalizeAiBaseUrl,
  SESSION_CREDENTIALS_KEY
} from './session-credentials'

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('标签页AI会话', () => {
  it('同标签刷新恢复，首次导航拒绝继承的新标签页副本', () => {
    const first = createSessionCredentialStorage({ navigationType: 'navigate' })
    expect(first.read()).toBe(null)
    first.write({ apiKey: 'private-test-key', baseUrl: 'https://gateway.example/v1' })
    const reload = createSessionCredentialStorage({ navigationType: 'reload' })
    expect(reload.read()).toEqual({
      apiKey: 'private-test-key',
      baseUrl: 'https://gateway.example/v1',
      model: '',
      models: []
    })
    const copied = createSessionCredentialStorage({ navigationType: 'navigate' })
    expect(copied.read()).toBe(null)
    expect(sessionStorage.getItem(SESSION_CREDENTIALS_KEY)).toBe(null)
  })

  it('从历史恢复关闭过的标签页也不复用key，普通刷新可用', () => {
    sessionStorage.setItem(
      SESSION_CREDENTIALS_KEY,
      JSON.stringify({ apiKey: 'closed-tab-key', baseUrl: 'https://gateway.example/v1' })
    )
    expect(createSessionCredentialStorage({ navigationType: 'back_forward' }).read()).toBe(null)
  })

  it('清理旧AI持久密钥但保留GitHub身份与任务数据', () => {
    for (const key of [
      'ai_credentials',
      'ai_credentials_encryption_key',
      'ai_config_sub2api',
      'ai_config_zhipu'
    ])
      localStorage.setItem(key, 'old-secret')
    localStorage.setItem('wallpaper_admin_token', 'github-identity')
    localStorage.setItem('upload-history', 'keep-history')
    createSessionCredentialStorage({ navigationType: 'navigate' }).read()
    expect(localStorage.getItem('ai_credentials')).toBe(null)
    expect(localStorage.getItem('ai_config_sub2api')).toBe(null)
    expect(localStorage.getItem('wallpaper_admin_token')).toBe('github-identity')
    expect(localStorage.getItem('upload-history')).toBe('keep-history')
  })

  it('损坏或不合法持久值清空且不泄漏到错误消息', () => {
    sessionStorage.setItem(SESSION_CREDENTIALS_KEY, '{private-test-key')
    expect(createSessionCredentialStorage({ navigationType: 'reload' }).read()).toBe(null)
    expect(sessionStorage.getItem(SESSION_CREDENTIALS_KEY)).toBe(null)
  })

  it('存储不可用时明确反馈，允许Store仅保留内存', () => {
    const broken = {
      getItem: vi.fn(() => {
        throw new Error('denied')
      }),
      setItem: vi.fn(() => {
        throw new Error('denied')
      }),
      removeItem: vi.fn()
    }
    const memory = createSessionCredentialStorage({ navigationType: 'reload', storage: broken })
    expect(memory.read()).toBe(null)
    expect(memory.write({ apiKey: 'test', baseUrl: 'https://gateway.example/v1' })).toBe(false)
  })

  it('新标签即使删除失败也绝不恢复继承的Key', () => {
    const inherited = {
      getItem: () =>
        JSON.stringify({ apiKey: 'inherited-secret', baseUrl: 'https://gateway.example/v1' }),
      removeItem: () => {
        throw new Error('Deletion blocked')
      }
    }
    expect(
      createSessionCredentialStorage({ navigationType: 'navigate', storage: inherited }).read()
    ).toBe(null)
  })
})

it('API地址支持HTTP、HTTPS与同源路径，不允许携带凭据与查询参数', () => {
  expect(normalizeAiBaseUrl(' https://gateway.example/v1/ ')).toBe('https://gateway.example/v1')
  expect(normalizeAiBaseUrl('/sub2api/v1/')).toBe('/sub2api/v1')
  expect(normalizeAiBaseUrl('http://127.0.0.1:8000/v1')).toBe('http://127.0.0.1:8000/v1')
  expect(normalizeAiBaseUrl('http://gateway.example:8000/v1/')).toBe(
    'http://gateway.example:8000/v1'
  )
  expect(normalizeAiBaseUrl('http://192.168.1.8:8080/v1')).toBe('http://192.168.1.8:8080/v1')
  expect(normalizeAiBaseUrl('HTTPS://Gateway.Example:443/v1/')).toBe('https://gateway.example/v1')
  for (const url of [
    'https:gateway.example/v1',
    'https:/gateway.example/v1',
    'https://gateway.example/v1?',
    'https://gateway.example/v1#',
    '//evil.example/v1',
    'https://name:secret@gateway.example/v1',
    'https://gateway.example/v1?key=secret',
    'https://gateway.example/v1#key',
    'javascript:alert(1)',
    '/api?key=secret',
    '/\\evil.example'
  ])
    expect(() => normalizeAiBaseUrl(url)).toThrow()
})
