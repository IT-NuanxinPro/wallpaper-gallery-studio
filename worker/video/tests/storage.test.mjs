import test from 'node:test'
import assert from 'node:assert/strict'
import { presign, R2Storage } from '../storage.mjs'

const env = {
  R2_ACCOUNT_ID: 'testaccount',
  R2_ACCESS_KEY_ID: 'test-access',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  STAGING_BUCKET_NAME: 'test-bucket',
  PUBLIC_BUCKET_NAME: 'test-public-bucket',
  VIDEO_SERVICE_TOKEN: 'never-send-video-service-token',
  GITHUB_DISPATCH_TOKEN: 'never-send-github-dispatch-token'
}
const date = new Date('2026-11-12T12:00:00Z')
const objectKey = "jobs/中文 id/cover !'().webp"
const uploadId = 'x+/=&<>'
const expectedBase = 'https://testaccount.r2.cloudflarestorage.com/test-bucket/jobs/%E4%B8%AD%E6%96%87%20id/cover%20%21%27%28%29.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=test-access%2F20261112%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261112T120000Z&X-Amz-Expires=900&X-Amz-SignedHeaders=host'

// 期望签名由独立 Python hashlib/hmac/urllib.parse 实现计算，未调用被测签名器。
const signatureCases = [
  { name: 'object GET', method: 'GET', query: {}, suffix: '', signature: '2f322295fb3d50f320bb3df5d879b22d231eb21b31eabeb847c966e88655eac4' },
  { name: 'object HEAD', method: 'HEAD', query: {}, suffix: '', signature: '9350a44e3efec81f2b2ea27849aefa54b23f325de4d32ae116ebe99c0ea1b756' },
  { name: 'multipart PUT', method: 'PUT', query: { uploadId, partNumber: 2 }, suffix: '&partNumber=2&uploadId=x%2B%2F%3D%26%3C%3E', signature: 'c97176b822af40313662f88ea7e2aa3a362df53edd2d594f4dc9e6c0bb9d7333' },
  { name: 'multipart initiate POST', method: 'POST', query: { uploads: '' }, suffix: '&uploads=', signature: '7e370a45928ced49032728f872ac8960383c4416f09f1163ad7fb4dcb85d90d8' },
  { name: 'multipart complete POST', method: 'POST', query: { uploadId }, suffix: '&uploadId=x%2B%2F%3D%26%3C%3E', signature: '422eb56788b4e73f221b9fc8f903dd07d8697ec1ef96ebb106b5ff951119adaf' },
  { name: 'multipart abort DELETE', method: 'DELETE', query: { uploadId }, suffix: '&uploadId=x%2B%2F%3D%26%3C%3E', signature: 'b6113a6483bba5836375891dece610627da7d07b515b190d903275a33d6be41a' }
]

for (const item of signatureCases) {
  test(`SigV4 ${item.name} matches the independent known signature`, async () => {
    const signed = await presign(env, 'test-bucket', objectKey, item.method, item.query, 900, date)
    assert.equal(signed, `${expectedBase}${item.suffix}&X-Amz-Signature=${item.signature}`)
  })
}

test('SigV4 binds the request method, object path and expiry', async () => {
  const changed = [
    await presign(env, 'test-bucket', objectKey, 'PATCH', {}, 900, date),
    await presign(env, 'test-bucket', objectKey + '-changed', 'GET', {}, 900, date),
    await presign(env, 'test-bucket', objectKey, 'GET', {}, 901, date)
  ].map(value => new URL(value).searchParams.get('X-Amz-Signature'))
  assert.equal(new Set(changed).size, 3)
  for (const signature of changed) assert.notEqual(signature, signatureCases[0].signature)
})

test('bucket signing selects the complete staging pair and keeps public credentials unchanged', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: date.getTime() })
  const storage = new R2Storage({ ...env, R2_STAGING_ACCESS_KEY_ID: 'stage-access', R2_STAGING_SECRET_ACCESS_KEY: 'stage-secret' })
  // 同样由独立 Python HMAC 计算，验证 access ID 和 secret 均按桶选择。
  assert.equal(await storage.sign(objectKey, 'GET'), expectedBase.replace('test-access%2F', 'stage-access%2F') + '&X-Amz-Signature=57474e7645d3ed78e8b3faa112f65e8b098582333bec6a7f4345d4b3e4c06fa1')
  assert.equal(await storage.sign(objectKey, 'GET', true), expectedBase.replace('/test-bucket/', '/test-public-bucket/') + '&X-Amz-Signature=9e65b49a29cb365f929cbacf8b0c3ed331ca983affb062c685f618039cd90789')
})

test('bucket signing without staging credentials preserves the existing general pair', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: date.getTime() })
  assert.equal(await new R2Storage(env).sign(objectKey, 'GET'), `${expectedBase}&X-Amz-Signature=${signatureCases[0].signature}`)
})

for (const partial of [{ R2_STAGING_ACCESS_KEY_ID: 'stage-access' }, { R2_STAGING_SECRET_ACCESS_KEY: 'stage-secret' }]) {
  test(`staging signing rejects a half configured ${Object.keys(partial)[0]} pair without mixing credentials`, async () => {
    const storage = new R2Storage({ ...env, ...partial })
    await assert.rejects(storage.sign(objectKey, 'GET'), error => error.status === 503 && error.code === 'NOT_CONFIGURED')
    const publicUrl = new URL(await storage.sign(objectKey, 'GET', true))
    assert.equal(publicUrl.searchParams.get('X-Amz-Credential').split('/')[0], 'test-access')
  })
}

test('all multipart operations use staging credentials and never require the general pair', async () => {
  const stagingOnly = { ...env, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined, R2_STAGING_ACCESS_KEY_ID: 'stage-access', R2_STAGING_SECRET_ACCESS_KEY: 'stage-secret' }
  const requests = []
  const storage = new R2Storage(stagingOnly, async (url, options = {}) => {
    const target = new URL(url)
    assert.equal(target.searchParams.get('X-Amz-Credential').split('/')[0], 'stage-access')
    assert.equal(target.pathname.startsWith('/test-bucket/'), true)
    assert.equal(JSON.stringify({ url, options }).includes('stage-secret'), false)
    requests.push(options.method || 'GET')
    if (target.searchParams.has('uploads')) return new Response('<InitiateMultipartUploadResult><UploadId>session</UploadId></InitiateMultipartUploadResult>')
    if (!options.method) return new Response('<ListPartsResult><IsTruncated>false</IsTruncated></ListPartsResult>')
    return new Response('<CompleteMultipartUploadResult/>')
  })
  assert.equal(await storage.create(objectKey, 'video/mp4'), 'session')
  assert.deepEqual(await storage.parts(objectKey, 'session'), [])
  await storage.complete(objectKey, 'session', [{ partNumber: 1, etag: '"part"' }])
  await storage.abort(objectKey, 'session')
  assert.deepEqual(requests, ['POST', 'GET', 'POST', 'DELETE'])
  await assert.rejects(storage.sign(objectKey, 'GET', true), error => error.status === 503)
})

test('multipart fetch injection never receives R2Storage as its native fetch receiver', async () => {
  const methods = []
  const storage = new R2Storage(env, async function (url, options = {}) {
    assert.equal(this, undefined, 'native Worker fetch must be called without a storage receiver')
    const target = new URL(url)
    methods.push(options.method || 'GET')
    if (target.searchParams.has('uploads')) return new Response('<InitiateMultipartUploadResult><UploadId>receiver-safe</UploadId></InitiateMultipartUploadResult>')
    if (!options.method) return new Response('<ListPartsResult><IsTruncated>false</IsTruncated></ListPartsResult>')
    return new Response('<CompleteMultipartUploadResult/>')
  })
  assert.equal(await storage.create(objectKey, 'video/mp4'), 'receiver-safe')
  assert.deepEqual(await storage.parts(objectKey, 'receiver-safe'), [])
  await storage.complete(objectKey, 'receiver-safe', [{ partNumber: 1, etag: '"part"' }])
  await storage.abort(objectKey, 'receiver-safe')
  assert.deepEqual(methods, ['POST', 'GET', 'POST', 'DELETE'])
})

function assertStorageRequest(url, options = {}) {
  const target = new URL(url)
  assert.equal(target.hostname, 'testaccount.r2.cloudflarestorage.com')
  assert.equal(target.pathname, '/test-bucket/jobs/%E4%B8%AD%E6%96%87%20id/cover%20%21%27%28%29.webp')
  assert.equal(target.searchParams.get('X-Amz-SignedHeaders'), 'host')
  assert.match(target.searchParams.get('X-Amz-Signature'), /^[a-f0-9]{64}$/)
  const headers = new Headers(options.headers)
  assert.equal(headers.get('Authorization'), null)
  assert.equal(headers.get('X-Video-Service-Token'), null)
  const serialized = JSON.stringify({ url, options })
  for (const secret of [env.R2_SECRET_ACCESS_KEY, env.VIDEO_SERVICE_TOKEN, env.GITHUB_DISPATCH_TOKEN]) {
    assert.equal(serialized.includes(secret), false, 'storage requests must not forward business or signing secrets')
  }
  return { target, headers }
}

test('multipart creation decodes the upload ID and sends only storage authorization', async () => {
  let requests = 0
  const storage = new R2Storage(env, async (url, options) => {
    requests++
    const { target, headers } = assertStorageRequest(url, options)
    assert.equal(options.method, 'POST')
    assert.equal(target.searchParams.get('uploads'), '')
    assert.equal(headers.get('Content-Type'), 'video/mp4')
    return new Response('<InitiateMultipartUploadResult><UploadId>x+/=&amp;&lt;&gt;</UploadId></InitiateMultipartUploadResult>')
  })
  assert.equal(await storage.create(objectKey, 'video/mp4'), uploadId)
  assert.equal(requests, 1)
})

test('multipart listing preserves quoted ETags and follows the returned part marker', async () => {
  const requestedMarkers = []
  const storage = new R2Storage(env, async (url, options) => {
    const { target } = assertStorageRequest(url, options)
    assert.equal(target.searchParams.get('uploadId'), uploadId)
    const marker = target.searchParams.get('part-number-marker')
    requestedMarkers.push(marker)
    if (marker === null) {
      return new Response('<ListPartsResult><Part><PartNumber>1</PartNumber><ETag>&quot;etag-one&amp;&lt;&gt;&quot;</ETag><Size>8388608</Size></Part><Part><PartNumber>2</PartNumber><ETag>&quot;etag-two&quot;</ETag><Size>8388608</Size></Part><IsTruncated>true</IsTruncated><NextPartNumberMarker>2</NextPartNumberMarker></ListPartsResult>')
    }
    assert.equal(marker, '2')
    return new Response('<ListPartsResult><Part><PartNumber>3</PartNumber><ETag>&quot;etag-three&quot;</ETag><Size>42</Size></Part><IsTruncated>false</IsTruncated></ListPartsResult>')
  })
  assert.deepEqual(await storage.parts(objectKey, uploadId), [
    { partNumber: 1, etag: '"etag-one&<>"', size: 8388608 },
    { partNumber: 2, etag: '"etag-two"', size: 8388608 },
    { partNumber: 3, etag: '"etag-three"', size: 42 }
  ])
  assert.deepEqual(requestedMarkers, [null, '2'])
})

test('multipart completion escapes ETags in XML without forwarding business tokens', async () => {
  let requests = 0
  const storage = new R2Storage(env, async (url, options) => {
    requests++
    const { target, headers } = assertStorageRequest(url, options)
    assert.equal(options.method, 'POST')
    assert.equal(target.searchParams.get('uploadId'), uploadId)
    assert.equal(headers.get('Content-Type'), 'application/xml')
    assert.equal(options.body, '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>&quot;etag-one&amp;&lt;&gt;&quot;</ETag></Part><Part><PartNumber>2</PartNumber><ETag>&quot;etag-two&quot;</ETag></Part></CompleteMultipartUpload>')
    return new Response('<CompleteMultipartUploadResult><ETag>&quot;merged&quot;</ETag></CompleteMultipartUploadResult>')
  })
  await storage.complete(objectKey, uploadId, [{ partNumber: 1, etag: '"etag-one&<>"' }, { partNumber: 2, etag: '"etag-two"' }])
  assert.equal(requests, 1)
})

test('multipart completion rejects an S3 XML error even with HTTP 200', async () => {
  const storage = new R2Storage(env, async (url, options) => {
    assertStorageRequest(url, options)
    return new Response('<Error><Code>InvalidPart</Code></Error>')
  })
  await assert.rejects(storage.complete(objectKey, uploadId, [{ partNumber: 1, etag: '"etag-one"' }]), error => error.code === 'R2_COMPLETE' && error.status === 502)
})

test('multipart abort uses its signed DELETE and tolerates an already absent session', async () => {
  let requests = 0
  const storage = new R2Storage(env, async (url, options) => {
    requests++
    const { target } = assertStorageRequest(url, options)
    assert.equal(options.method, 'DELETE')
    assert.equal(target.searchParams.get('uploadId'), uploadId)
    return new Response('<Error><Code>NoSuchUpload</Code></Error>', { status: 404 })
  })
  await storage.abort(objectKey, uploadId)
  assert.equal(requests, 1)
})
