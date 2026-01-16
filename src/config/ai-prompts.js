export const PROMPT_TEMPLATES = {
  default: {
    id: 'default',
    name: '分类 + 文件名',
    description: '同时生成分类和文件名建议',
    builtin: true,
    variables: ['primaryCategory', 'secondaryList', 'thirdHints'],
    template: `分析这张图片，返回JSON格式的分类结果。

主分类：{{primaryCategory}}

可选的二级分类：{{secondaryList}}

三级分类选项：
{{thirdHints}}

规则：
1. 二级分类：从上面列表中选择最匹配的
2. 三级分类：优先选择具体风格，避免选"通用"
3. 文件名：**中文长命名**（8-15个汉字），结构：修饰形容词 + 主体 + 场景或动作 + .jpg
   - ❌拒绝太短（如"女孩.jpg"）
   - ✅示例：阳光下奔跑的治愈系柴犬.jpg、身穿黑色长裙的卷发港风少女.jpg
4. 关键词：3-5个中文词
5. 描述：20-40字优美中文描述

返回JSON（不要其他内容）：
{
  "secondary": "二级分类名称",
  "third": "三级分类名称",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "filename": "修饰形容词+主体+场景或动作.jpg",
  "description": "20-40字优美描述"
}`
  },

  filenameOnly: {
    id: 'filenameOnly',
    name: '仅文件名',
    description: '只生成文件名建议，不分类',
    builtin: true,
    variables: [],
    template: `分析这张图片，生成中文文件名。

规则：
1. 文件名：**中文长命名**（8-15个汉字），结构：修饰形容词 + 主体 + 场景或动作 + .jpg
   - ❌拒绝太短（如"女孩.jpg"）
   - ✅示例：阳光下奔跑的治愈系柴犬.jpg、身穿黑色长裙的卷发港风少女.jpg、赛博朋克风格的都市霓虹夜景.jpg
2. 关键词：3-5个中文词
3. 描述：20-40字优美中文描述

返回JSON（不要其他内容）：
{
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "filename": "修饰形容词+主体+场景或动作.jpg",
  "description": "20-40字优美描述"
}`
  },

  custom: {
    id: 'custom',
    name: '自定义',
    description: '使用自定义提示词',
    builtin: false,
    variables: [],
    template: ''
  }
}

export function replaceVariables(template, variables) {
  let result = template

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    result = result.replace(regex, value)
  })

  return result
}

export function getTemplateList() {
  return Object.values(PROMPT_TEMPLATES)
}

export function getTemplateById(templateId) {
  return PROMPT_TEMPLATES[templateId] || null
}

export function isValidTemplate(template) {
  return (
    template &&
    typeof template.id === 'string' &&
    typeof template.name === 'string' &&
    typeof template.template === 'string'
  )
}
