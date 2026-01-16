<template>
  <div class="doubao-test-view">
    <div class="test-container">
      <h1 class="title">🤖 AI 图片分类测试</h1>

      <!-- AI 服务商和模型选择 -->
      <el-card class="compact-card" shadow="hover">
        <template #header>⚙️ AI 配置</template>
        <el-form label-width="100px" size="small">
          <!-- 生产环境才显示 API Key 配置 -->
          <el-form-item v-if="isProduction" label="API Key">
            <el-input
              v-model="config.apiKey"
              type="password"
              placeholder="输入豆包 API Key"
              show-password
              clearable
            />
          </el-form-item>
          <el-form-item label="AI 服务商">
            <el-select v-model="config.provider" placeholder="选择服务商" style="width: 100%">
              <el-option label="豆包 AI" value="doubao" />
              <el-option label="Cloudflare AI" value="cloudflare" />
            </el-select>
          </el-form-item>
          <el-form-item label="AI 模型">
            <el-select v-model="config.endpointId" placeholder="选择模型" style="width: 100%">
              <el-option label="Doubao-Seed-1.6-vision" value="doubao-seed-1-6-vision-250815" />
              <el-option label="Doubao-Seed-1.8" value="doubao-seed-1-8-251228" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 主分类选择 -->
      <el-card class="compact-card" shadow="hover">
        <template #header>📂 壁纸类型</template>
        <el-radio-group v-model="primaryCategory" size="default">
          <el-radio-button value="desktop">🖥️ Desktop</el-radio-button>
          <el-radio-button value="mobile">📱 Mobile</el-radio-button>
          <el-radio-button value="avatar">👤 Avatar</el-radio-button>
        </el-radio-group>
      </el-card>

      <!-- 上传图片 -->
      <el-card class="compact-card" shadow="hover">
        <template #header>📤 上传图片</template>

        <el-upload
          drag
          :auto-upload="false"
          :limit="1"
          accept="image/*"
          :on-change="handleFileChange"
        >
          <el-icon class="upload-icon"><UploadFilled /></el-icon>
          <div class="upload-text">拖拽图片或点击选择</div>
        </el-upload>

        <div v-if="selectedFile" class="file-info">
          <el-tag type="success">{{ selectedFile.name }}</el-tag>
          <el-tag type="primary">{{ primaryCategory }}</el-tag>
          <el-button
            type="primary"
            :loading="analyzing"
            :disabled="!hasValidConfig"
            @click="startAnalysis"
          >
            {{ analyzing ? '分析中...' : '🚀 开始分析' }}
          </el-button>
        </div>
      </el-card>

      <!-- 分析进度 -->
      <el-card v-if="analyzing" class="compact-card" shadow="hover">
        <div class="progress-content">
          <el-progress type="circle" :percentage="progress" :width="80" />
          <span class="progress-text">分析中...</span>
        </div>
      </el-card>

      <!-- 分析结果 -->
      <el-card v-if="result" class="compact-card" shadow="hover">
        <template #header>
          <div class="result-header">
            <span>✨ 分析结果</span>
            <el-tag :type="result.success ? 'success' : 'danger'" size="small">
              {{ result.success ? '成功' : '失败' }}
            </el-tag>
          </div>
        </template>

        <div v-if="result.success" class="result-content">
          <!-- 分类结果 -->
          <div class="result-section">
            <h3>📁 分类</h3>
            <div class="category-tags">
              <el-tag type="primary" size="small">{{ result.data.primary }}</el-tag>
              <span class="arrow">›</span>
              <el-tag type="success" size="small">{{ result.data.secondary }}</el-tag>
              <span class="arrow">›</span>
              <el-tag type="warning" size="small">{{ result.data.third }}</el-tag>
            </div>
          </div>

          <!-- 文件名建议 -->
          <div class="result-section">
            <h3>📝 文件名</h3>
            <div class="filename-list">
              <el-tag
                v-for="(name, index) in result.data.filenameSuggestions"
                :key="index"
                size="small"
                class="filename-tag"
              >
                {{ name }}
              </el-tag>
            </div>
          </div>

          <!-- 描述和关键词 -->
          <div class="result-section">
            <h3>💬 描述</h3>
            <p class="description">{{ result.data.description }}</p>
          </div>

          <div class="result-section">
            <h3>🏷️ 关键词</h3>
            <div class="keywords">
              <el-tag v-for="kw in result.data.keywords" :key="kw" type="info" size="small">{{
                kw
              }}</el-tag>
            </div>
          </div>

          <!-- 原始响应 -->
          <el-collapse style="margin-top: 16px">
            <el-collapse-item title="查看原始 JSON" name="raw">
              <pre class="raw-json">{{ JSON.stringify(result.raw, null, 2) }}</pre>
            </el-collapse-item>
          </el-collapse>
        </div>

        <el-alert v-else type="error" :title="result.error" :closable="false" show-icon />
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'

// 检测是否为生产环境
const isProduction = computed(() => import.meta.env.PROD)

const config = ref({
  provider: 'doubao',
  apiKey: import.meta.env.VITE_DOUBAO_API_KEY || '',
  endpointId: 'doubao-seed-1-6-vision-250815'
})

const primaryCategory = ref('desktop')
const selectedFile = ref(null)
const analyzing = ref(false)
const progress = ref(0)
const result = ref(null)

// 检查是否有有效配置
const hasValidConfig = computed(() => {
  // 本地环境从 .env.local 读取
  if (!isProduction.value) {
    return !!import.meta.env.VITE_DOUBAO_API_KEY
  }
  // 生产环境需要手动输入
  return !!(config.value.apiKey && config.value.endpointId)
})

const CATEGORIES = {
  desktop: {
    subcategories: ['插画', '动漫', '风景', '萌宠', '人像', '影视', '游戏', '政治', 'IP形象'],
    thirdLevel: {
      插画: ['场景', '创意', '国风', '卡通', '通用', '文字'],
      动漫: [
        '二次元',
        '仙逆',
        '刀剑神域',
        '初音未来',
        '剑来',
        '名侦探柯南',
        '哆啦A梦',
        '喜洋洋与灰太狼',
        '完美世界',
        '小埋',
        '斗破苍穹',
        '新世纪福音战士',
        '春物雪乃',
        '猫和老鼠',
        '百炼成神',
        '神奇宝贝',
        '紫罗兰永恒花园',
        '罪恶王冠',
        '蕾姆',
        '蜡笔小新',
        '进击的巨人',
        '间谍过家家',
        '鬼灭之刃'
      ],
      风景: ['城市', '天空', '建筑', '日落', '星空', '海滨', '湖泊', '花卉', '雪山'],
      萌宠: ['狗狗', '猫咪', '兔兔'],
      人像: ['氛围感', '国风', '魅力', '明星', '清新', '张凌赫'],
      影视: ['海绵宝宝', '疯狂动物城'],
      游戏: ['原神', '崩坏', '艾尔登法环', '英雄联盟', '通用'],
      政治: ['通用'],
      IP形象: ['乌萨奇', '凯蒂猫', '水豚噜噜', '粉红兔', '线条小狗', '通用']
    }
  },
  mobile: {
    subcategories: ['插画', '创意', '动漫', '风景', '萌宠', '人像', '影视', 'IP形象'],
    thirdLevel: {
      插画: ['创意', '国风', '少女与猫', '风景'],
      创意: ['抽象', '文字', '爱国主题'],
      动漫: [
        '二次元',
        '你的名字',
        '初音未来',
        '名侦探柯南',
        '夏目友人帐',
        '海贼王',
        '蜡笔小新',
        '通用'
      ],
      风景: ['冬日雪景', '建筑', '星空', '森林', '海滨', '花卉', '雪山'],
      萌宠: ['狗狗', '猫咪'],
      人像: [
        '古装',
        '张凌赫',
        '日系',
        '明星',
        '易烊千玺',
        '氛围感',
        '清新',
        '王楚然',
        '迪丽热巴',
        '魅力'
      ],
      影视: ['柯南', '海绵宝宝', '漫威', '猫和老鼠', '疯狂动物城'],
      IP形象: ['乌萨奇', '卡通角色', '小八', '水豚噜噜', '粉红兔']
    }
  },
  avatar: {
    subcategories: ['表情包', '插画', '动漫', '萌宠', '人像', 'IP形象'],
    thirdLevel: {
      表情包: ['搞怪'],
      插画: ['二次元', '创意'],
      动漫: [
        '哆啦A梦',
        '喜羊羊与灰太狼',
        '天线宝宝',
        '日漫',
        '樱桃小丸子',
        '海绵宝宝',
        '海贼王',
        '猫和老鼠',
        '神奇宝贝',
        '蜡笔小新',
        '通用'
      ],
      萌宠: ['狗狗', '猫咪'],
      人像: ['卡通简笔画', '氛围感', '甜妹', '背影'],
      IP形象: ['Hello Kitty', '乌萨奇', '小八', '小熊', '库洛米', '水豚噜噜', '牛牛黎深&噜噜']
    }
  }
}

function saveConfig() {
  localStorage.setItem('doubao_config', JSON.stringify(config.value))
  ElMessage.success('配置已保存')
}

function loadConfig() {
  const saved = localStorage.getItem('doubao_config')
  if (saved) {
    const savedConfig = JSON.parse(saved)
    // 本地环境优先使用环境变量
    if (!isProduction.value && import.meta.env.VITE_DOUBAO_API_KEY) {
      config.value.apiKey = import.meta.env.VITE_DOUBAO_API_KEY
    } else {
      config.value = savedConfig
    }
    ElMessage.success('配置已加载')
  } else if (!isProduction.value && import.meta.env.VITE_DOUBAO_API_KEY) {
    config.value.apiKey = import.meta.env.VITE_DOUBAO_API_KEY
    ElMessage.success('已从环境变量加载配置')
  } else {
    ElMessage.warning('没有保存的配置')
  }
}

function handleFileChange(file) {
  selectedFile.value = file
  result.value = null
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    // 检查文件对象
    const fileObj = file.raw || file
    if (!fileObj || !fileObj.type || !fileObj.type.startsWith('image/')) {
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
        const maxSize = 1024

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

        resolve(canvas.toDataURL('image/jpeg', 0.9))
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(fileObj)
  })
}

function buildPrompt() {
  const category = CATEGORIES[primaryCategory.value]
  const secondaryList = category.subcategories.join('、')

  let thirdHints = ''
  category.subcategories.forEach(sub => {
    const thirdList = category.thirdLevel[sub] || ['通用']
    thirdHints += `  • ${sub}：${thirdList.join('、')}\n`
  })

  return `你是一位专业的壁纸分类专家和文案大师。请仔细分析这张图片，并返回结构化的分类结果。

## 分类体系

**主分类**：${primaryCategory.value}

**二级分类（必须从以下选项中选择）**：
${secondaryList}

**三级分类（根据二级分类选择对应的子类）**：
${thirdHints}

## 🔴 分类规则（最重要，必须严格遵守）

### 二级分类选择
- **必须**从上述列表中选择最匹配的一个
- 不得自创分类名称
- 根据图片的主要内容和主题进行判断

### 三级分类选择（重点）
**"通用"是最后的选择，不是默认选项！**

分类决策流程：
1. **首先**：仔细观察图片的具体特征（场景、人物、风格、主题等）
2. **然后**：在三级分类列表中寻找最匹配的具体标签
3. **最后**：只有在以下情况才选择"通用"：
   - 图片包含多个三级分类的混合元素
   - 图片风格非常独特，无法归入任何具体标签
   - 图片内容模糊不清，无法判断具体类型

### 分类示例（重要参考）

**Desktop 正确示例**：
- 图片：雪山风景 → 二级：风景，三级：雪山 ✅
- 图片：城市夜景 → 二级：风景，三级：城市 ✅
- 图片：海边日落 → 二级：风景，三级：海滨 ✅
- 图片：星空银河 → 二级：风景，三级：星空 ✅
- 图片：湖泊倒影 → 二级：风景，三级：湖泊 ✅
- 图片：猫咪特写 → 二级：萌宠，三级：猫咪 ✅
- 图片：柴犬玩耍 → 二级：萌宠，三级：狗狗 ✅
- 图片：初音未来 → 二级：动漫，三级：初音未来 ✅
- 图片：哆啦A梦 → 二级：动漫，三级：哆啦A梦 ✅
- 图片：凯蒂猫 → 二级：IP形象，三级：凯蒂猫 ✅
- 图片：水豚噜噜 → 二级：IP形象，三级：水豚噜噜 ✅
- 图片：古风美女 → 二级：插画，三级：国风 ✅
- 图片：卡通场景 → 二级：插画，三级：卡通 ✅
- 图片：励志文字 → 二级：插画，三级：文字 ✅

**Mobile/Avatar 示例**：
- 图片：初音未来手机壁纸 → 二级：动漫，三级：初音未来 ✅
- 图片：海贼王角色 → 二级：动漫，三级：海贼王 ✅
- 图片：蜡笔小新 → 二级：动漫，三级：蜡笔小新 ✅
- 图片：夏目友人帐 → 二级：动漫，三级：夏目友人帐 ✅

**错误示例**：
- 图片：雪山风景 → 二级：风景，三级：通用 ❌（应该选"雪山"）
- 图片：城市建筑 → 二级：风景，三级：通用 ❌（应该选"城市"或"建筑"）
- 图片：猫咪 → 二级：萌宠，三级：通用 ❌（应该选"猫咪"）
- 图片：初音未来 → 二级：动漫，三级：二次元 ❌（应该选"初音未来"）

## 文件名要求

创作一个**有内涵、高雅、富有诗意**的中文文件名：
- 长度：8-15个汉字
- 风格：优雅、精炼、有意境
- 内容：提炼图片的核心美感和情感氛围
- 避免：平铺直叙、过于直白、堆砌关键词

示例：
- "晨曦微光下的静谧森林"（而非"森林早晨阳光树木"）
- "星河璀璨夜空梦境"（而非"夜晚星空银河系"）
- "雪山云海间的孤寂之美"（而非"雪山云雾风景"）

## 关键词要求

提取3-5个精准的中文关键词：
- 涵盖：主题、风格、色调、情感
- 要求：简洁、准确、有辨识度
- 避免：过于宽泛的词汇

## 描述要求

用一句话（20-40字）描述图片：
- 突出视觉特点和艺术风格
- 传达图片的情感氛围
- 语言优美、富有感染力

## 输出格式

请严格按照以下JSON格式返回（不要包含任何其他文字说明）：

{
  "secondary": "二级分类名称",
  "third": "三级分类名称",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "filename": "优雅精炼的中文文件名",
  "description": "富有美感的图片描述"
}

⚠️ 再次强调：三级分类优先选择具体标签，"通用"是最后的选择！`
}

async function startAnalysis() {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择图片')
    return
  }

  // 获取实际使用的 API Key
  const apiKey = isProduction.value ? config.value.apiKey : import.meta.env.VITE_DOUBAO_API_KEY

  if (!apiKey) {
    ElMessage.error('未配置 API Key')
    return
  }

  analyzing.value = true
  progress.value = 0
  result.value = null

  const progressInterval = setInterval(() => {
    if (progress.value < 90) {
      progress.value += 10
    }
  }, 300)

  try {
    const imageBase64 = await compressImage(selectedFile.value)
    const prompt = buildPrompt()

    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.value.endpointId,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_image',
                image_url: imageBase64
              },
              {
                type: 'input_text',
                text: prompt
              }
            ]
          }
        ]
      })
    })

    clearInterval(progressInterval)
    progress.value = 100

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`)
    }

    const data = await response.json()

    const outputMessage = data.output?.find(item => item.type === 'message')
    const textContent = outputMessage?.content?.find(c => c.type === 'output_text')
    const aiText = textContent?.text || ''

    const jsonMatch = aiText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('AI 返回的内容中没有找到 JSON')
    }

    const parsed = JSON.parse(jsonMatch[0])

    result.value = {
      success: true,
      data: {
        primary: primaryCategory.value,
        secondary: parsed.secondary || '通用',
        third: parsed.third || '通用',
        filenameSuggestions: [
          parsed.filename,
          `${parsed.filename}-${Date.now().toString().slice(-6)}`,
          `${parsed.secondary}-${parsed.keywords?.[0] || '图片'}`
        ],
        keywords: parsed.keywords || [],
        description: parsed.description || '无描述'
      },
      raw: data
    }

    ElMessage.success('分析完成！')
  } catch (error) {
    clearInterval(progressInterval)
    result.value = {
      success: false,
      error: error.message
    }
    ElMessage.error(`分析失败: ${error.message}`)
  } finally {
    analyzing.value = false
  }
}

// 页面加载时自动加载配置
loadConfig()
</script>

<style lang="scss" scoped>
.doubao-test-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.test-container {
  max-width: 900px;
  margin: 0 auto;
}

.title {
  text-align: center;
  font-size: 28px;
  font-weight: bold;
  color: white;
  margin-bottom: 20px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
}

.compact-card {
  margin-bottom: 12px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: none;
  border-radius: 12px;

  :deep(.el-card__header) {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 15px;
    font-weight: 600;
    border-radius: 12px 12px 0 0;
    padding: 12px 16px;
  }

  :deep(.el-card__body) {
    padding: 16px;
  }
}

.upload-icon {
  font-size: 60px;
  color: #667eea;
  margin-bottom: 12px;
}

.upload-text {
  font-size: 14px;
  color: #666;
}

.file-info {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.progress-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px;

  .progress-text {
    font-size: 14px;
    color: #666;
  }
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.result-content {
  .result-section {
    margin-bottom: 16px;

    h3 {
      font-size: 14px;
      font-weight: 600;
      color: #333;
      margin-bottom: 8px;
    }
  }

  .category-tags {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;

    .arrow {
      font-size: 16px;
      color: #999;
    }
  }

  .filename-list {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .filename-tag {
      padding: 8px 12px;
      font-size: 13px;
    }
  }

  .description {
    font-size: 13px;
    line-height: 1.6;
    color: #666;
    background: #f5f5f5;
    padding: 10px;
    border-radius: 6px;
  }

  .keywords {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .raw-json {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.5;
    overflow-x: auto;
  }
}
</style>
