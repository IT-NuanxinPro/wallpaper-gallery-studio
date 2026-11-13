import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import VideoPublicationNotice from './VideoPublicationNotice.vue'

let panel
afterEach(() => panel?.unmount())
function create(props = {}) {
  panel = mount(VideoPublicationNotice, {
    props,
    attachTo: document.body,
    global: { plugins: [ElementPlus] }
  })
  return panel
}
const card = () => document.querySelector('.publication-notice')

describe('顶部发布通知', () => {
  it('通知传送到body，不占工作区；初始历史不弹出，真实状态完成后显示且关闭不重现', async () => {
    create({ publications: [{ id: 'old', status: 'published', jobs: [{}] }] })
    expect(card()).toBeNull()
    await panel.setProps({ publications: [{ id: 'new', status: 'deploying', jobs: [{}] }] })
    expect(card().closest('[data-v-app]')).toBeNull()
    expect(document.body.contains(card())).toBe(true)
    expect(panel.find('.publication-notice').exists()).toBe(false)
    expect(card().textContent).toContain('部署网站')
    expect(card().querySelector('[aria-current="step"]').textContent).toContain('部署网站')
    expect(card().querySelector('.is-spinning')).not.toBeNull()
    await panel.setProps({ publications: [{ id: 'new', status: 'published', jobs: [{}] }] })
    expect(card().textContent).toContain('1 个视频已发布')
    expect(card().querySelector('.is-spinning')).toBeNull()
    card().querySelector('[aria-label="关闭发布完成提示"]').click()
    await flushPromises()
    await panel.setProps({ publications: [{ id: 'new', status: 'published', jobs: [{}] }] })
    expect(card()).toBeNull()
  })

  it('立即反馈提交，失败可重试，多个完成批次不相互覆盖', async () => {
    create({ submitting: true, canWrite: true })
    expect(card().textContent).toContain('正在提交发布')
    await panel.setProps({
      submitting: false,
      publications: [
        { id: 'a', status: 'failed', jobs: [{}], error: '部署失败' },
        { id: 'b', status: 'deploying', jobs: [{}] }
      ]
    })
    expect(card().textContent).toContain('部署失败')
    const retry = [...card().querySelectorAll('button')].find(button =>
      button.textContent.includes('继续发布')
    )
    retry.click()
    expect(panel.emitted('retry')).toEqual([['a']])
    await panel.setProps({
      publications: [
        { id: 'a', status: 'published', jobs: [{}] },
        { id: 'b', status: 'published', jobs: [{}] }
      ]
    })
    expect(card().querySelectorAll('.is-published')).toHaveLength(2)
    card().querySelector('[aria-label="关闭发布完成提示"]').click()
    await flushPromises()
    expect(card().querySelectorAll('.is-published')).toHaveLength(1)
  })

  it('收起不会停止状态更新，失败自动展开，进度读取失败有刷新入口', async () => {
    create({ publications: [{ id: 'a', status: 'queued', jobs: [{}] }] })
    card().querySelector('.publication-notice__toggle').click()
    await flushPromises()
    expect(card().querySelector('.publication-notice__toggle').getAttribute('aria-expanded')).toBe(
      'false'
    )
    await panel.setProps({
      publications: [{ id: 'a', status: 'failed', jobs: [{}] }],
      errors: { missing: '网络断开' }
    })
    expect(card().querySelector('.publication-notice__toggle').getAttribute('aria-expanded')).toBe(
      'true'
    )
    expect(card().textContent).toContain('网络断开')
    const refresh = [...card().querySelectorAll('button')].find(button =>
      button.textContent.includes('刷新进度')
    )
    refresh.click()
    expect(panel.emitted('refresh')).toHaveLength(1)
  })
})
