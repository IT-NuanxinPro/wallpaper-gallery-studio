import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RepositoryPicker from './RepositoryPicker.vue'
import { fetchRepositories } from '@/services/repository-discovery'

vi.mock('@/services/repository-discovery', () => ({ fetchRepositories: vi.fn() }))
const repo = {
  id: 1,
  owner: 'alice',
  name: 'gallery',
  fullName: 'alice/gallery',
  defaultBranch: 'main',
  private: true
}
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())
describe('远程仓库选择', () => {
  it('真实列表过渡下，加载、结果和搜索空态不会同时作为普通流兄弟节点出现', async () => {
    let finishLoading
    fetchRepositories.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishLoading = resolve
        })
    )
    const panel = mount(RepositoryPicker, {
      props: { token: 'test-token' },
      global: { plugins: [ElementPlus], stubs: { transition: false, 'transition-group': false } }
    })
    const states = () =>
      panel.element.querySelectorAll(
        ':scope > .repository-picker__empty, :scope > .repository-picker__list'
      )
    expect(states()).toHaveLength(1)
    expect(panel.get('.repository-picker__empty').attributes('role')).toBe('status')
    finishLoading({ repositories: [repo], hasMore: false })
    await flushPromises()
    expect(states()).toHaveLength(1)
    expect(panel.find('.repository-picker__list').exists()).toBe(true)
    vi.useFakeTimers()
    await panel.get('input[aria-label="搜索仓库"]').setValue('missing')
    expect(states()).toHaveLength(1)
    expect(panel.find('.repository-picker__empty').exists()).toBe(true)
    await panel.get('input[aria-label="搜索仓库"]').setValue('gallery')
    expect(states()).toHaveLength(1)
    expect(panel.find('.repository-picker__list').exists()).toBe(true)
    await vi.runAllTimersAsync()
    panel.unmount()
  })

  it('自动加载、客户端搜索、选择与加载更多均使用当前登录身份', async () => {
    fetchRepositories
      .mockResolvedValueOnce({ repositories: [repo], hasMore: true })
      .mockResolvedValueOnce({
        repositories: [{ ...repo, id: 2, name: 'videos', fullName: 'alice/videos' }],
        hasMore: false
      })
    const panel = mount(RepositoryPicker, {
      props: { token: 'test-token' },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(fetchRepositories).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'test-token', page: 1 })
    )
    await panel.get('.repository-picker__item').trigger('click')
    expect(panel.emitted('select')[0][0]).toEqual(repo)
    await panel
      .findAll('button')
      .find(button => button.text() === '加载更多')
      .trigger('click')
    await flushPromises()
    expect(fetchRepositories).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    await panel.get('input[aria-label="搜索仓库"]').setValue('videos')
    expect(panel.text()).toContain('alice/videos')
    expect(panel.text()).not.toContain('alice/gallery')
    expect(panel.text()).not.toContain('test-token')
    panel.unmount()
  })
  it('失败后可重试，令牌变化清除旧列表并取消旧请求', async () => {
    fetchRepositories
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({ repositories: [repo], hasMore: false })
      .mockResolvedValueOnce({ repositories: [], hasMore: false })
    const panel = mount(RepositoryPicker, {
      props: { token: 'first-token' },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(panel.text()).toContain('无法读取仓库列表')
    await panel
      .findAll('button')
      .find(button => button.text() === '重试')
      .trigger('click')
    await flushPromises()
    const previousSignal = fetchRepositories.mock.calls.at(-1)[0].signal
    await panel.setProps({ token: 'second-token' })
    await flushPromises()
    expect(previousSignal.aborted).toBe(true)
    expect(panel.text()).not.toContain('alice/gallery')
    panel.unmount()
  })

  it('显示仓库权限，已归档管理员仓库显示只读', async () => {
    fetchRepositories.mockResolvedValue({
      repositories: [
        { ...repo, permission: 'admin', archived: true },
        { ...repo, id: 2, fullName: 'alice/writable', permission: 'write' }
      ],
      hasMore: false
    })
    const panel = mount(RepositoryPicker, {
      props: { token: 'test-token' },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(panel.findAll('.repository-picker__item')[0].text()).toContain('只读')
    expect(panel.findAll('.repository-picker__item')[0].text()).not.toContain('管理')
    expect(panel.findAll('.repository-picker__item')[1].text()).toContain('可写')
    expect(panel.text()).toContain('数据仓库')
    panel.unmount()
  })
})
