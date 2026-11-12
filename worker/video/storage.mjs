import { ensure, HttpError } from './domain.mjs'

const encoder = new TextEncoder()
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
const escape = text => encodeURIComponent(text).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
async function hash(text) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text))) }
async function hmac(key, text) {
  const cryptoKey = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(text))
}

// 浏览器只获得限定对象和方法的短期签名，文件内容直接进入 R2。
export async function presign(env, bucket, key, method, query = {}, expires = 900, date = new Date()) {
  ensure(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ACCOUNT_ID, 'R2上传授权尚未配置', 503, 'NOT_CONFIGURED')
  const stamp = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const scope = `${stamp.slice(0, 8)}/auto/s3/aws4_request`
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  const path = '/' + [bucket, ...key.split('/')].map(escape).join('/')
  const params = { ...query, 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${env.R2_ACCESS_KEY_ID}/${scope}`, 'X-Amz-Date': stamp, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host' }
  const canonicalQuery = Object.keys(params).sort().map(k => `${escape(k)}=${escape(String(params[k]))}`).join('&')
  const canonical = [method, path, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const signText = `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${await hash(canonical)}`
  let keyBytes = await hmac(`AWS4${env.R2_SECRET_ACCESS_KEY}`, stamp.slice(0, 8))
  for (const part of ['auto', 's3', 'aws4_request']) keyBytes = await hmac(keyBytes, part)
  return `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${hex(await hmac(keyBytes, signText))}`
}

const xmlText = (xml, name) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const xmlEscape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export class R2Storage {
  constructor(env, request = fetch) { this.env = env; this.request = request }
  bucket(publicBucket = false) { return publicBucket ? this.env.PUBLIC_BUCKET_NAME : this.env.STAGING_BUCKET_NAME }
  binding(publicBucket = false) { return publicBucket ? this.env.VIDEO_PUBLIC : this.env.VIDEO_STAGING }
  async sign(key, method, publicBucket = false, query = {}) {
    let signingEnv = this.env
    if (!publicBucket) {
      const accessKey = this.env.R2_STAGING_ACCESS_KEY_ID
      const secretKey = this.env.R2_STAGING_SECRET_ACCESS_KEY
      ensure(!!accessKey === !!secretKey, 'R2暂存桶上传授权必须成对配置', 503, 'NOT_CONFIGURED')
      if (accessKey && secretKey) signingEnv = { ...this.env, R2_ACCESS_KEY_ID: accessKey, R2_SECRET_ACCESS_KEY: secretKey }
    }
    return presign(signingEnv, this.bucket(publicBucket), key, method, query)
  }
  async create(key, contentType) {
    const response = await this.request(await this.sign(key, 'POST', false, { uploads: '' }), { method: 'POST', headers: { 'Content-Type': contentType } })
    if (!response.ok) throw new HttpError(502, 'R2_UPLOAD_INIT', '无法建立R2上传会话')
    const uploadId = xmlText(await response.text(), 'UploadId')
    ensure(uploadId, 'R2未返回上传会话', 502)
    return uploadId
  }
  async parts(key, uploadId) {
    let marker = ''; const parts = []
    do {
      const query = { uploadId, ...(marker ? { 'part-number-marker': marker } : {}) }
      const response = await this.request(await this.sign(key, 'GET', false, query))
      if (!response.ok) throw new HttpError(502, 'R2_PARTS', '无法读取已上传分块')
      const text = await response.text()
      for (const block of text.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
        parts.push({ partNumber: Number(xmlText(block[1], 'PartNumber')), etag: xmlText(block[1], 'ETag'), size: Number(xmlText(block[1], 'Size')) })
      }
      marker = xmlText(text, 'IsTruncated') === 'true' ? xmlText(text, 'NextPartNumberMarker') : ''
    } while (marker)
    return parts
  }
  async complete(key, uploadId, parts) {
    const body = `<CompleteMultipartUpload>${parts.map(part => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`
    const response = await this.request(await this.sign(key, 'POST', false, { uploadId }), { method: 'POST', body, headers: { 'Content-Type': 'application/xml' } })
    const text = await response.text()
    if (!response.ok || /<Error>/.test(text)) throw new HttpError(502, 'R2_COMPLETE', 'R2合并上传失败，可刷新重试')
  }
  async head(key, publicBucket = false) { return this.binding(publicBucket).head(key) }
  async abort(key, uploadId) {
    const response = await this.request(await this.sign(key, 'DELETE', false, { uploadId }), { method: 'DELETE' })
    ensure(response.ok || response.status === 404, '暂存上传清理失败', 502)
  }
  async removePrefix(prefix) {
    let cursor
    do {
      const listed = await this.env.VIDEO_STAGING.list({ prefix, cursor, limit: 100 })
      if (listed.objects.length) await this.env.VIDEO_STAGING.delete(listed.objects.map(object => object.key))
      cursor = listed.truncated ? listed.cursor : undefined
    } while (cursor)
  }
}
