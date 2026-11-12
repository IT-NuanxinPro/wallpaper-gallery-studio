import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSource, validateReview, formalObjects, validateResult } from '../domain.mjs'

test('250MB boundary accepts mainstream containers without trusting MIME', () => {
  const file = { filename: '发光-宝可梦.FLV', size: 250000000, sha256: 'a'.repeat(64), contentType: '' }
  assert.equal(validateSource(file).size, 250000000)
  assert.throws(() => validateSource({ ...file, size: 250000001 }), /250/)
  assert.throws(() => validateSource({ ...file, filename: 'payload.exe' }), /格式/)
  assert.throws(() => validateSource({ ...file, sha256: 'not-a-hash' }), /SHA/)
})

const result = {
  download: { key: 'jobs/abc/download.mp4', size: 42, contentType: 'video/mp4', sha256: 'a'.repeat(64) },
  preview: { key: 'jobs/abc/preview.mp4', size: 21, contentType: 'video/mp4', sha256: 'b'.repeat(64) },
  frames: [{ id: 'frame-1', key: 'jobs/abc/frame-1.jpg', thumbnailKey: 'jobs/abc/frame-1.webp', timestamp: 1, score: 2 }],
  defaultFrameId: 'frame-1', metadata: { width: 3840, height: 2160, duration: 11.5, size: 42, format: 'mp4' }
}

test('processing result rejects references outside its private task prefix', () => {
  assert.equal(validateResult(result, 'abc').metadata.width, 3840)
  assert.throws(() => validateResult({ ...result, preview: { ...result.preview, key: 'jobs/other/preview.mp4' } }, 'abc'), /资源/)
  assert.throws(() => validateResult({ ...result, defaultFrameId: 'missing' }, 'abc'), /封面/)
})

test('review only accepts task-owned frames and safe formal path segments', () => {
  const review = { selectedFrameId: 'frame-1', usage: 'desktop', topic: '动漫', filename: '发光宝可梦.mp4', displayTitle: '发光宝可梦', description: '', keywords: ['宝可梦'] }
  assert.equal(validateReview(review, result).topic, '动漫')
  assert.throws(() => validateReview({ ...review, topic: '../anime' }, result), /路径/)
  assert.throws(() => validateReview({ ...review, selectedFrameId: 'foreign' }, result), /封面/)
  assert.throws(() => validateReview({ ...review, filename: '.mp4' }, result), /文件名/)
  const keys = formalObjects({ id: '12345678-abcd', review, result })
  assert.equal(keys.download, 'wallpaper/video/desktop/动漫/发光宝可梦-12345678.mp4')
  assert.equal(keys.preview, 'preview/video/desktop/动漫/发光宝可梦-12345678.mp4')
  assert.equal(keys.thumbnail, 'thumbnail/video/desktop/动漫/发光宝可梦-12345678.webp')
})
