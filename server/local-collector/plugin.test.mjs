import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isLocalCollectorRequest, localCollectorPlugin } from './plugin.mjs'
const request = (overrides = {}) => ({ method: 'GET', headers: { host: 'localhost:5174' }, socket: { remoteAddress: '127.0.0.1' }, ...overrides })
describe('本地采集边界', () => {
  it('只接受本机socket和loopback Host，拒绝DNS rebinding及LAN', () => {
    assert.equal(isLocalCollectorRequest(request()), true)
    assert.equal(isLocalCollectorRequest(request({socket:{remoteAddress:'::ffff:127.0.0.1'}})), true)
    assert.equal(isLocalCollectorRequest(request({socket:{remoteAddress:'192.168.1.2'}})), false)
    assert.equal(isLocalCollectorRequest(request({headers:{host:'evil.example'}})), false)
    assert.equal(isLocalCollectorRequest(request({headers:{host:'localhost:5174',origin:'https://evil.example'}})), false)
  })
  it('写入必须同源自定义头，拒绝跨站表单', () => {
    assert.equal(isLocalCollectorRequest(request({method:'POST'})), false)
    assert.equal(isLocalCollectorRequest(request({method:'POST',headers:{host:'localhost:5174',origin:'http://localhost:5174','x-studio-local':'1','content-type':'application/json'}})), true)
    assert.equal(isLocalCollectorRequest(request({method:'POST',headers:{host:'localhost:5174',origin:'http://localhost:5173','x-studio-local':'1'}})), false)
    assert.equal(isLocalCollectorRequest(request({headers:{host:'localhost:5174','sec-fetch-site':'cross-site'}})), false)
  })
  it('插件只在开发serve运行', () => {
    assert.equal(localCollectorPlugin({}).apply, 'serve')
  })
})

import { createBridgeProcess } from './plugin.mjs'
import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
function fakeChild() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => { child.killed = true }
  return child
}
describe('桥接进程生命周期', () => {
  it('并发启动共享进程，关闭只终止该子进程', async () => {
    const child = fakeChild()
    let calls = 0
    const project = mkdtempSync(join(tmpdir(), 'studio-bridge-test-'))
    writeFileSync(join(project, 'web_app.py'), '')
    const bridge = createBridgeProcess({project,spawnImpl:()=>{
      calls++
      queueMicrotask(()=>child.stdout.emit('data', Buffer.from('{"port":12345}\n')))
      return child
    }})
    try {
      const [first, second] = await Promise.all([bridge.start(), bridge.start()])
      assert.equal(first.port, 12345)
      assert.deepEqual(first, second)
      assert.equal(calls, 1)
      bridge.stop()
      assert.equal(child.killed, true)
      await assert.rejects(bridge.start(), /已停止/)
    } finally { rmSync(project, {recursive:true}) }
  })
})
