import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RepositoryConfigForm from './RepositoryConfigForm.vue'

describe('仓库配置表单', () => {
  it('只编辑配置字段，提交完整且已去空白的配置，不要求 OAuth 或 Token', async () => {
    const panel = mount(RepositoryConfigForm, {
      props: {
        modelValue: {
          owner: ' alice ',
          repo: ' gallery ',
          branch: ' main ',
          workflowOwner: 'actions',
          workflowRepo: 'pipeline'
        }
      },
      global: { plugins: [ElementPlus] }
    })
    expect(panel.find('input[type="password"]').exists()).toBe(false)
    await panel.get('input[aria-label="仓库名称"]').setValue('new-gallery')
    expect(panel.emitted('update:modelValue').at(-1)[0].repo).toBe('new-gallery')
    await panel.get('form').trigger('submit')
    expect(panel.emitted('submit')[0][0]).toEqual({
      owner: 'alice',
      repo: 'gallery',
      branch: 'main',
      workflowOwner: 'actions',
      workflowRepo: 'pipeline',
      frontendOwner: '',
      frontendRepo: '',
      videoApiUrl: '',
      clientId: '',
      oauthWorkerUrl: ''
    })
    panel.unmount()
  })

  it('可直接打开 OAuth 配置，忙碌时不重复提交', async () => {
    const panel = mount(RepositoryConfigForm, {
      props: { modelValue: {}, initialSection: 'oauth', busy: true },
      global: { plugins: [ElementPlus] }
    })
    expect(panel.getComponent({ name: 'ElCollapse' }).props('modelValue')).toContain('oauth')
    await panel.get('form').trigger('submit')
    expect(panel.emitted('submit')).toBeUndefined()
    panel.unmount()
  })

  it('更换已有目标清除旧连接，修改分支保留连接，首次填写不误清空', async () => {
    const original = {
      owner: 'alice',
      repo: 'gallery',
      branch: 'main',
      workflowOwner: 'alice',
      workflowRepo: 'pipeline',
      frontendOwner: 'alice',
      frontendRepo: 'site',
      videoApiUrl: 'https://video.example.test',
      clientId: 'client-id',
      oauthWorkerUrl: '/oauth'
    }
    const panel = mount(RepositoryConfigForm, {
      props: { modelValue: original },
      global: { plugins: [ElementPlus] }
    })
    await panel.get('input[aria-label="默认分支"]').setValue('dev')
    expect(panel.emitted('update:modelValue').at(-1)[0].videoApiUrl).toBe(original.videoApiUrl)
    await panel.get('input[aria-label="仓库所有者"]').setValue('bob')
    expect(panel.emitted('update:modelValue').at(-1)[0]).toMatchObject({
      owner: 'bob',
      workflowOwner: '',
      workflowRepo: '',
      frontendOwner: '',
      frontendRepo: '',
      videoApiUrl: '',
      clientId: 'client-id',
      oauthWorkerUrl: '/oauth'
    })
    await panel.setProps({ modelValue: { ...original, owner: '', repo: '' } })
    await panel.get('input[aria-label="仓库所有者"]').setValue('charlie')
    expect(panel.emitted('update:modelValue').at(-1)[0].workflowRepo).toBe('pipeline')
    panel.unmount()
  })
})
