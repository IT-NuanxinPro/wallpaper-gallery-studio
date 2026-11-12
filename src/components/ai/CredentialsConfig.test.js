import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'
import CredentialsConfig from './CredentialsConfig.vue'

const state = vi.hoisted(() => ({ store: null }))
vi.mock('@/stores/credentials', () => ({ useCredentialsStore: () => state.store }))

beforeEach(() => {
  state.store = reactive({
    apiKey: '',
    baseUrl: 'https://api.example.test/v1',
    hasCredentials: false,
    sessionRevision: 0,
    storageWarning: '',
    loadCredentials: vi.fn().mockResolvedValue(),
    saveCredentials: vi.fn(async ({ apiKey, baseUrl }) => {
      Object.assign(state.store, { apiKey, baseUrl, hasCredentials: true })
    }),
    clearCredentials: vi.fn(() => {
      Object.assign(state.store, { apiKey: '', hasCredentials: false })
    })
  })
})

describe('共用 AI 会话配置', () => {
  it('默认填入 API 地址，Key 使用密码输入，并说明三个入口共享和会话边界', async () => {
    const panel = mount(CredentialsConfig, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(panel.get('input[aria-label="API 地址"]').element.value).toBe(state.store.baseUrl)
    expect(panel.get('input[aria-label="API Key"]').attributes('type')).toBe('password')
    expect(panel.text()).toContain('GPT-6.1 Sol')
    expect(panel.text()).toContain('图片上传、视频分析和 AI 工坊共用')
    expect(panel.text()).toContain('刷新后保留')
    expect(panel.text()).toContain('新标签页')
    expect(panel.text()).not.toMatch(/Cloudflare|环境变量|Account ID/)
    panel.unmount()
  })

  it('保存后立即更新共用状态，清除同时清空密码输入', async () => {
    const panel = mount(CredentialsConfig, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    await panel.get('input[aria-label="API Key"]').setValue('test-session-key')
    await panel.get('form').trigger('submit')
    await flushPromises()
    expect(state.store.saveCredentials).toHaveBeenCalledWith({
      apiKey: 'test-session-key',
      baseUrl: 'https://api.example.test/v1'
    })
    expect(panel.text()).toContain('已配置')
    expect(panel.text()).not.toContain('test-session-key')
    await panel.get('[data-testid="clear-ai-credentials"]').trigger('click')
    expect(state.store.clearCredentials).toHaveBeenCalledOnce()
    expect(panel.get('input[aria-label="API Key"]').element.value).toBe('')
    expect(state.store.hasCredentials).toBe(false)
    panel.unmount()
  })

  it('会话存储不可用时显示内存配置提示', async () => {
    state.store.storageWarning = '浏览器存储不可用，刷新后需要重新填写。'
    const panel = mount(CredentialsConfig, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(panel.text()).toContain(state.store.storageWarning)
    panel.unmount()
  })

  it('会话在表单外被清除时同步清空密码输入与 API 地址', async () => {
    state.store.apiKey = 'session-key-before-restore'
    state.store.hasCredentials = true
    const panel = mount(CredentialsConfig, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(panel.get('input[aria-label="API Key"]').element.value).toBe(
      'session-key-before-restore'
    )
    Object.assign(state.store, {
      apiKey: '',
      baseUrl: 'https://default.example.test/v1',
      hasCredentials: false,
      sessionRevision: 1
    })
    await flushPromises()
    expect(panel.get('input[aria-label="API Key"]').element.value).toBe('')
    expect(panel.get('input[aria-label="API 地址"]').element.value).toBe(
      'https://default.example.test/v1'
    )
    panel.unmount()
  })
})
