import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RepositoryConnections from './RepositoryConnections.vue'
const mocks = vi.hoisted(() => ({ discover: vi.fn(), list: vi.fn() }))
vi.mock('@/services/repository-connections', () => ({
  discoverRepositoryConnections: mocks.discover
}))
vi.mock('@/services/repository-discovery', () => ({ fetchRepositories: mocks.list }))
let panel
afterEach(() => {
  panel?.unmount()
  vi.clearAllMocks()
})
const config = {
  owner: 'team',
  repo: 'images',
  branch: 'main',
  workflowOwner: '',
  workflowRepo: '',
  frontendOwner: '',
  frontendRepo: ''
}
const response = {
  connections: { workflowOwner: 'team', workflowRepo: 'pipeline' },
  candidates: { workflow: [{ fullName: 'team/pipeline' }], frontend: [] },
  repositories: [{ fullName: 'team/pipeline' }, { fullName: 'team/site' }],
  complete: true
}
describe('关联仓库选择', () => {
  it('父表单回填自动关联后保留成功提示和候选，不重新请求', async () => {
    mocks.discover.mockResolvedValue(response)
    panel = mount(RepositoryConnections, {
      props: { modelValue: config, token: 'token' },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    await panel.setProps({ modelValue: panel.emitted('update:modelValue')[0][0] })
    await flushPromises()
    expect(mocks.discover).toHaveBeenCalledTimes(1)
    expect(panel.text()).toContain('已识别关联，保存后生效')
    expect(
      panel
        .findAllComponents({ name: 'ElOption' })
        .some(option => option.props('value') === 'team/site')
    ).toBe(true)
  })
  it('自动识别并填充，没有要求输入所有者与仓库名称', async () => {
    mocks.discover.mockResolvedValue(response)
    panel = mount(RepositoryConnections, {
      props: { modelValue: config, token: 'token' },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(panel.emitted('update:modelValue')[0][0]).toMatchObject({
      workflowOwner: 'team',
      workflowRepo: 'pipeline'
    })
    expect(panel.text()).toContain('已识别关联')
    const select = panel.findAllComponents({ name: 'ElSelect' })[1]
    select.vm.$emit('update:modelValue', 'team/site')
    expect(panel.emitted('update:modelValue').at(-1)[0]).toMatchObject({
      frontendOwner: 'team',
      frontendRepo: 'site'
    })
  })
  it('换仓库忽略迟到识别，不覆盖已手动调整的关联', async () => {
    let finish
    mocks.discover
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve
          })
      )
      .mockResolvedValue({ ...response, connections: {} })
    panel = mount(RepositoryConnections, {
      props: { modelValue: config, token: 'token' },
      global: { plugins: [ElementPlus] }
    })
    await panel.setProps({ modelValue: { ...config, repo: 'other' } })
    await flushPromises()
    finish(response)
    await flushPromises()
    expect(
      panel
        .emitted('update:modelValue')
        .every(([value]) => value.repo === 'other' && !value.workflowRepo)
    ).toBe(true)
  })
  it('识别失败可重试，已有连接保留且可从列表更换', async () => {
    mocks.list.mockResolvedValue({
      repositories: [{ fullName: 'team/new-pipeline' }],
      hasMore: false
    })
    panel = mount(RepositoryConnections, {
      props: {
        modelValue: {
          ...config,
          workflowOwner: 'team',
          workflowRepo: 'old',
          frontendOwner: 'team',
          frontendRepo: 'site'
        },
        token: 'token'
      },
      global: { plugins: [ElementPlus] }
    })
    expect(mocks.discover).not.toHaveBeenCalled()
    panel.findComponent({ name: 'ElSelect' }).vm.$emit('visible-change', true)
    await flushPromises()
    expect(
      panel
        .findAllComponents({ name: 'ElOption' })
        .some(item => item.props('value') === 'team/new-pipeline')
    ).toBe(true)
  })
})
