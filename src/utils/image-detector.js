/**
 * 图片类型检测工具
 * 根据分辨率和宽高比自动判断壁纸类型
 */

/**
 * 壁纸类型检测规则
 */
const DETECTION_RULES = {
  desktop: {
    // 桌面壁纸：宽度 > 高度，且宽度较大
    minWidth: 1280,
    aspectRatioRange: [1.3, 3.5], // 宽高比范围 (16:9 ≈ 1.78, 21:9 ≈ 2.33)
    commonResolutions: [
      { width: 1920, height: 1080, name: '1080p (16:9)' },
      { width: 2560, height: 1440, name: '2K (16:9)' },
      { width: 3840, height: 2160, name: '4K (16:9)' },
      { width: 2560, height: 1080, name: '21:9 超宽' },
      { width: 3440, height: 1440, name: '21:9 2K' }
    ]
  },
  mobile: {
    // 手机壁纸：高度 > 宽度，且高度较大
    minHeight: 1280,
    aspectRatioRange: [0.4, 0.75], // 宽高比范围 (9:16 ≈ 0.56, 9:19.5 ≈ 0.46)
    commonResolutions: [
      { width: 1080, height: 1920, name: '1080x1920 (9:16)' },
      { width: 1080, height: 2340, name: '1080x2340 (9:19.5)' },
      { width: 1440, height: 3120, name: '1440x3120 (9:19.5)' },
      { width: 1284, height: 2778, name: 'iPhone 13 Pro' },
      { width: 1170, height: 2532, name: 'iPhone 12/13' }
    ]
  },
  avatar: {
    // 头像：接近正方形，尺寸较小
    maxSize: 1024,
    aspectRatioRange: [0.8, 1.25], // 接近 1:1
    commonResolutions: [
      { width: 512, height: 512, name: '512x512' },
      { width: 1024, height: 1024, name: '1024x1024' },
      { width: 800, height: 800, name: '800x800' }
    ]
  }
}

/**
 * 从文件中读取图片尺寸
 * @param {File} file - 图片文件
 * @returns {Promise<{width: number, height: number}>}
 */
export function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    // 确保在浏览器环境中
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      reject(new Error('此功能仅在浏览器环境中可用'))
      return
    }

    const img = new window.Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取图片尺寸'))
    }

    img.src = url
  })
}

/**
 * 检测图片类型
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @returns {{type: string, confidence: number, reason: string, resolution: string}}
 */
export function detectImageType(width, height) {
  const aspectRatio = width / height
  const maxDimension = Math.max(width, height)

  // 1. 检测头像（优先级最高，因为特征最明显）
  if (
    aspectRatio >= DETECTION_RULES.avatar.aspectRatioRange[0] &&
    aspectRatio <= DETECTION_RULES.avatar.aspectRatioRange[1] &&
    maxDimension <= DETECTION_RULES.avatar.maxSize
  ) {
    return {
      type: 'avatar',
      confidence: 0.95,
      reason: `接近正方形 (${width}x${height})，尺寸较小，判定为头像`,
      resolution: `${width}x${height}`,
      aspectRatio: aspectRatio.toFixed(2)
    }
  }

  // 2. 检测桌面壁纸（横向）
  if (
    width > height &&
    width >= DETECTION_RULES.desktop.minWidth &&
    aspectRatio >= DETECTION_RULES.desktop.aspectRatioRange[0] &&
    aspectRatio <= DETECTION_RULES.desktop.aspectRatioRange[1]
  ) {
    // 查找匹配的常见分辨率
    const matchedResolution = DETECTION_RULES.desktop.commonResolutions.find(
      res => Math.abs(res.width - width) < 50 && Math.abs(res.height - height) < 50
    )

    return {
      type: 'desktop',
      confidence: matchedResolution ? 0.98 : 0.9,
      reason: matchedResolution
        ? `匹配常见桌面分辨率 ${matchedResolution.name}`
        : `横向图片 (${width}x${height})，宽高比 ${aspectRatio.toFixed(2)}，判定为桌面壁纸`,
      resolution: `${width}x${height}`,
      aspectRatio: aspectRatio.toFixed(2)
    }
  }

  // 3. 检测手机壁纸（竖向）
  if (
    height > width &&
    height >= DETECTION_RULES.mobile.minHeight &&
    aspectRatio >= DETECTION_RULES.mobile.aspectRatioRange[0] &&
    aspectRatio <= DETECTION_RULES.mobile.aspectRatioRange[1]
  ) {
    // 查找匹配的常见分辨率
    const matchedResolution = DETECTION_RULES.mobile.commonResolutions.find(
      res => Math.abs(res.width - width) < 50 && Math.abs(res.height - height) < 50
    )

    return {
      type: 'mobile',
      confidence: matchedResolution ? 0.98 : 0.9,
      reason: matchedResolution
        ? `匹配常见手机分辨率 ${matchedResolution.name}`
        : `竖向图片 (${width}x${height})，宽高比 ${aspectRatio.toFixed(2)}，判定为手机壁纸`,
      resolution: `${width}x${height}`,
      aspectRatio: aspectRatio.toFixed(2)
    }
  }

  // 4. 边界情况处理
  // 4.1 小尺寸正方形 -> 头像
  if (
    aspectRatio >= 0.8 &&
    aspectRatio <= 1.25 &&
    maxDimension <= DETECTION_RULES.avatar.maxSize * 1.5
  ) {
    return {
      type: 'avatar',
      confidence: 0.8,
      reason: `接近正方形且尺寸适中 (${width}x${height})，可能是头像`,
      resolution: `${width}x${height}`,
      aspectRatio: aspectRatio.toFixed(2)
    }
  }

  // 4.2 横向但尺寸较小 -> 可能是桌面壁纸
  if (width > height && aspectRatio >= 1.3) {
    return {
      type: 'desktop',
      confidence: 0.7,
      reason: `横向图片 (${width}x${height})，但分辨率较低，可能是桌面壁纸`,
      resolution: `${width}x${height}`,
      aspectRatio: aspectRatio.toFixed(2)
    }
  }

  // 4.3 竖向但尺寸较小 -> 可能是手机壁纸
  if (height > width && aspectRatio <= 0.75) {
    return {
      type: 'mobile',
      confidence: 0.7,
      reason: `竖向图片 (${width}x${height})，但分辨率较低，可能是手机壁纸`,
      resolution: `${width}x${height}`,
      aspectRatio: aspectRatio.toFixed(2)
    }
  }

  // 5. 无法判断，默认为桌面
  return {
    type: 'desktop',
    confidence: 0.5,
    reason: `无法明确判断类型 (${width}x${height})，默认为桌面壁纸`,
    resolution: `${width}x${height}`,
    aspectRatio: aspectRatio.toFixed(2)
  }
}

/**
 * 从文件自动检测图片类型
 * @param {File} file - 图片文件
 * @returns {Promise<{type: string, confidence: number, reason: string, resolution: string}>}
 */
export async function detectImageTypeFromFile(file) {
  const dimensions = await getImageDimensions(file)
  return detectImageType(dimensions.width, dimensions.height)
}

/**
 * 批量检测图片类型
 * @param {File[]} files - 图片文件数组
 * @returns {Promise<Array<{file: File, detection: Object}>>}
 */
export async function detectBatchImageTypes(files) {
  const results = []

  for (const file of files) {
    try {
      const detection = await detectImageTypeFromFile(file)
      results.push({
        file,
        detection,
        fileName: file.name
      })
    } catch (error) {
      results.push({
        file,
        detection: {
          type: 'desktop',
          confidence: 0,
          reason: `检测失败: ${error.message}`,
          resolution: 'unknown',
          aspectRatio: 'unknown'
        },
        fileName: file.name,
        error: error.message
      })
    }
  }

  return results
}

/**
 * 获取检测统计信息
 * @param {Array} detectionResults - 检测结果数组
 * @returns {Object} 统计信息
 */
export function getDetectionStats(detectionResults) {
  const stats = {
    total: detectionResults.length,
    desktop: 0,
    mobile: 0,
    avatar: 0,
    highConfidence: 0, // confidence >= 0.9
    mediumConfidence: 0, // 0.7 <= confidence < 0.9
    lowConfidence: 0, // confidence < 0.7
    errors: 0
  }

  detectionResults.forEach(result => {
    if (result.error) {
      stats.errors++
      return
    }

    const { type, confidence } = result.detection

    // 统计类型
    stats[type]++

    // 统计置信度
    if (confidence >= 0.9) {
      stats.highConfidence++
    } else if (confidence >= 0.7) {
      stats.mediumConfidence++
    } else {
      stats.lowConfidence++
    }
  })

  return stats
}

/**
 * 格式化检测结果为可读文本
 * @param {Object} detection - 检测结果
 * @returns {string}
 */
export function formatDetectionResult(detection) {
  const typeNames = {
    desktop: '🖥️ 桌面壁纸',
    mobile: '📱 手机壁纸',
    avatar: '👤 头像'
  }

  const confidenceText =
    detection.confidence >= 0.9 ? '高' : detection.confidence >= 0.7 ? '中' : '低'

  return `${typeNames[detection.type]} (置信度: ${confidenceText} ${(detection.confidence * 100).toFixed(0)}%)\n${detection.reason}`
}
