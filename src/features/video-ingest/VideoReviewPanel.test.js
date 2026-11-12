import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import VideoReviewPanel from './VideoReviewPanel.vue'

const draft = {
  selectedFrameId: 'f1',
  usage: 'desktop',
  topic: '风景',
  filename: '星空.mp4',
  displayTitle: '星空',
  description: '星空描述',
  keywords: ['星空']
}
function createPanel() {
  return mount(VideoReviewPanel, {
    props: {
      job: {
        id: 'job',
        filename: 'source.mp4',
        status: 'awaiting_review',
        result: {
          frames: [1, 2, 3, 4, 5].map(n => ({
            id: `f${n}`,
            timestamp: n,
            thumbnailUrl: `https://frames.test/${n}.webp`
          })),
          metadata: { width: 1920, height: 1080, duration: 5 }
        }
      },
      draft: { ...draft },
      editable: true,
      models: []
    },
    global: { plugins: [ElementPlus], stubs: { RouterLink: true } }
  })
}

describe('视频候选帧审核交互', () => {
  it('封面图片与视频poster使用匿名CORS，避免污染后续AI读帧缓存', async () => {
    const panel = createPanel()
    const job = panel.props('job')
    await panel.setProps({
      job: { ...job, result: { ...job.result, preview: { url: 'https://video.test/preview' } } }
    })
    expect(panel.find('video').attributes('crossorigin')).toBe('anonymous')
    expect(panel.find('video').element.crossOrigin).toBe('anonymous')
    for (const image of panel.findAll('.video-review__frame img')) {
      expect(image.attributes('crossorigin')).toBe('anonymous')
      expect(image.element.crossOrigin).toBe('anonymous')
    }
    panel.unmount()
  })

  it('仅显示服务端已有视频主题，主题读取失败时保持输入框可编辑', async () => {
    const panel = createPanel()
    await panel.setProps({ topicSuggestions: ['宝可梦', '二次元'], topicsError: '读取失败' })
    expect(panel.findAll('#video-topics option').map(option => option.attributes('value'))).toEqual(
      ['宝可梦', '二次元']
    )
    const topic = panel.find('input[list="video-topics"]')
    await topic.setValue('手工分类')
    expect(panel.emitted('update:draft').at(-1)[0].topic).toBe('手工分类')
    expect(topic.attributes('disabled')).toBeUndefined()
    expect(panel.text()).toContain('仍可直接输入主题')
    panel.unmount()
  })

  it('显示全部5个云端候选帧，选择时保存服务端帧身份', async () => {
    const panel = createPanel()
    expect(panel.findAll('.video-review__frame')).toHaveLength(5)
    await panel.findAll('.video-review__frame')[3].trigger('click')
    expect(panel.emitted('update:draft')[0][0].selectedFrameId).toBe('f4')
    panel.unmount()
  })

  it('输入关键词分隔符时不会被规范化吞掉，允许继续输入第二个词', async () => {
    const panel = createPanel()
    const keywords = panel.find('input[placeholder="多个关键词用逗号分隔"]')
    await keywords.trigger('focus')
    await keywords.setValue('星空,')
    await panel.setProps({ draft: panel.emitted('update:draft').at(-1)[0] })
    expect(keywords.element.value).toBe('星空,')
    await keywords.setValue('星空, 月光')
    expect(panel.emitted('update:draft').at(-1)[0].keywords).toEqual(['星空', '月光'])
    panel.unmount()
  })

  it('轮询仅更新签名地址时不打断当前视频，切换任务后更新预览', async () => {
    const panel = createPanel()
    const job = panel.props('job')
    await panel.setProps({
      job: {
        ...job,
        result: { ...job.result, preview: { url: 'https://video.test/preview?signature=first' } }
      }
    })
    await panel.setProps({
      job: {
        ...job,
        result: { ...job.result, preview: { url: 'https://video.test/preview?signature=renewed' } }
      }
    })
    expect(panel.find('video').attributes('src')).toBe('https://video.test/preview?signature=first')
    await panel.setProps({
      job: {
        ...job,
        id: 'other',
        result: { ...job.result, preview: { url: 'https://video.test/other' } }
      }
    })
    expect(panel.find('video').attributes('src')).toBe('https://video.test/other')
    panel.unmount()
  })
})
