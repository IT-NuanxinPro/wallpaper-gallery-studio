/**
 * AI 图片处理器
 * 用于在发送给 AI 之前压缩图片
 */

// 默认图片处理配置
export const IMAGE_CONFIG = {
  maxSize: 1024,
  quality: 0.9,
  format: 'image/jpeg'
}

/**
 * 压缩图片
 * @param {File} file - 图片文件
 * @param {Object} config - 压缩配置
 * @returns {Promise<string>} Base64 编码的图片
 */
export async function compressImage(file, config = {}) {
  const {
    maxSize = IMAGE_CONFIG.maxSize,
    quality = IMAGE_CONFIG.quality,
    format = IMAGE_CONFIG.format
  } = config

  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请上传图片文件'))
      return
    }

    const reader = new FileReader()
    reader.onload = e => {
      // eslint-disable-next-line no-undef
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        let width = img.width
        let height = img.height

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize
            width = maxSize
          } else {
            width = (width / height) * maxSize
            height = maxSize
          }
        }

        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        resolve(canvas.toDataURL(format, quality))
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 将文件转换为 base64（不压缩）
 * @param {File} file - 文件
 * @returns {Promise<string>} Base64 字符串
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(reader.result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
