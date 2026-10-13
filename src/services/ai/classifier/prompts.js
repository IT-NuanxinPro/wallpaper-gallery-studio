/**
 * 分类服务专用提示词
 * 独立于 AI 助手的提示词配置
 */

import { CATEGORIES } from '@/config/categories'
import { getThirdLevelCategories } from '@/config/subcategories'
import { getUploadCategoryTree } from '@/services/upload/category-directory'

const CLASSIFICATION_RULES = `## 分类约束（优先于下文的风格示例）

1. 本次提供的分类列表是唯一归档依据；分类名称必须原样使用，不能根据旧知识补造目录。
2. 先识别主体、作品/IP、人物和场景，再遍历当前列表选择最具体且有视觉依据的分类。游戏、影视、IP形象等已有具体分类优先于泛化的动漫、插画、人像风格；无法确认身份时不要猜测具体作品或人物。
3. secondary 必须来自当前二级列表；third 必须属于选中的 secondary，禁止跨父分类拼接。该二级没有三级选项时，third 返回空字符串。
4. 风格规则仅在对应分类存在时适用；“通用”“二次元”等兜底名称也必须实际存在，不能自动补出。
5. 新增分类和原有分类同等参与匹配。不要因为示例没有提到某个分类就忽略它。
6. 没有精确匹配时，选择现有目录中语义最接近的合法分类，is_perfect_match 为 false；缺失类别只放入 new_category_proposal，不作为实际归档路径。
7. 目录已包含对应分类时，不要重复提案；无提案时 new_category_proposal 返回 null。描述、标题、文件名以图片中可见内容为依据，不虚构人物身份或画面细节。`

const CLOUDFLARE_RESULT = `## 供上传归档读取的结构化结果

Markdown 分析结束后，必须附上且只附上一个 JSON 代码块。填入本次实际分析结果，不要照抄占位文字：
{
  "secondary": "当前列表中的二级分类",
  "third": "属于该二级的三级分类，没有则为空字符串",
  "is_perfect_match": false,
  "new_category_proposal": null,
  "displayTitle": "中文标题",
  "filenames": ["具体画面描述.jpg", "另一角度的描述.jpg"],
  "keywords": ["主体", "风格", "场景"],
  "description": "图片描述",
  "reasoning": "简述分类依据"
}
精确匹配时 is_perfect_match 为 true。有缺失分类提案时，new_category_proposal 为包含 suggested_secondary、suggested_third、reason 的对象；否则为 null。`

/**
 * 提示词模板配置
 */
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

/**
 * 系列专用的提示词模板
 * 每个系列有不同的分类逻辑和判定规则
 */
export const SERIES_TEMPLATES = {
  // Cloudflare AI 专用模板（Markdown 友好）
  cloudflare_desktop: `你是一位资深的视觉美学专家和壁纸分类大师。请用 **Markdown 格式** 详细分析这张图片。

## 📋 分类体系

**主分类**：{{primaryCategory}}

**二级分类选项**：{{secondaryList}}

**三级分类选项**：
{{thirdHints}}

---

## 🎯 分析任务

请按照以下格式输出分析结果（使用 Markdown 格式，支持换行和格式化）：

### 1️⃣ 分类结果

**二级分类**：[从上面列表中选择]

**三级分类**：[从上面列表中选择，优先选择具体风格]

**匹配度**：[完美匹配 / 近似匹配]

---

### 2️⃣ 分类逻辑

详细说明你的分类依据，包括：
- 识别到的主要元素
- 风格特征分析
- 为什么选择这个分类

---

### 3️⃣ 文件名建议（重点）

请根据画面中的**颜色、衣着、动作、光影**生成 3 个长文件名（8-15 个汉字）。

**严格要求**：
1. **必须包含具体的视觉形容词**（如：绿底、白色毛衣、仰望、侧颜、微光）。
2. **禁止**使用短名称（如"女孩.jpg"、"清新壁纸.jpg"）。
3. **禁止**重复同一个句式。

**参考范例**（请模仿这种长度和细节）：
- ✅ 错误示范：女孩侧面.jpg
- ✅ 正确示范：绿幕背景下的白色毛衣侧颜少女.jpg
- ✅ 正确示范：清新治愈系仰望天空的女孩.jpg

**请生成**：
1. **[文件名1].jpg**
2. **[文件名2].jpg**
3. **[文件名3].jpg**

---

### 4️⃣ 关键词

提供 3-5 个精准的中文关键词（必须包含画面中的核心物体）：

- 关键词1
- 关键词2
- 关键词3
- 关键词4
- 关键词5

---

### 5️⃣ 诗意标题

创作一个 8-15 字的诗意标题，要求：
- 避免直白描述，要富有想象力
- 结合画面的光影和情绪

**标题**：[你的创作]

---

### 6️⃣ 详细描述

用 30-60 字详细描述这张图片，**禁止重复**前面的句子：
- 按实际主体描述材质、色彩、场景和细节；非人像图片不要虚构人物。
- 描述画面中的光影与构图。

---

### 7️⃣ 新分类建议（可选）

如果这张图片属于现有分类中缺失的知名 IP、明星或特定风格，请提出建议，否则写"无"。

**建议分类**：[二级分类]/[三级分类]

**理由**：[理由]`,

  desktop: `你是一位资深的视觉美学专家和壁纸分类大师。请分析图片，完成分类归档与元数据生成。

## 1. 现有分类体系 (System DB)

**主分类**：{{primaryCategory}}

**二级分类 (Secondary)**：
{{secondaryList}}

**三级分类 (Third)**：
{{thirdHints}}

## 2. 桌面壁纸分析重点

- 区分写实摄影、动画风格、绘画插画、游戏画面与影视剧照，再结合现有目录判断。
- 风景根据主体场景、季节、光线和建筑特征匹配具体分类。
- 人像根据服饰、构图、光影和整体风格判断；单一服饰元素不能覆盖明确的作品、人物或传统风格分类。
- 保留横向画面的环境与构图信息，避免只描述局部人物。

## 3. 任务规则

### 任务一：归类与提案

- **必须**从现有列表中选择 \`secondary\` 和 \`third\`；没有三级选项时 third 返回空字符串。
- **新分类提案 (Proposal)**：
  - 如果图片是**现有库中缺失**的知名IP、明星或特定风格。
  - 请在 \`new_category_proposal\` 中填写对象：suggested_secondary（建议二级）、suggested_third（建议三级）、reason（理由）。没有提案时返回 null。
  - 实际归类必须使用当前存在的路径，缺失的具体作品名仅用于提案。

### 任务二：文案生成

- **标题 (displayTitle)**:：
  - 8-15个汉字，高雅、富有诗意。
  - 即使是"魅力"类图片，标题也要唯美含蓄，禁止使用低俗词汇。

- **文件名 (filenames)**：
  - **提供两个不同的中文文件名**（8-15个汉字）。
  - 禁止英文命名
  - 侧重于**具体描述**，方便检索。
  - 结构：修饰形容词 + '主体' + '场景或动作' + '.jpg'。
  - ❌拒绝太短（如"女孩.jpg"）。
  - ✅示例：
    - '阳光下奔跑的治愈系柴犬.jpg'
    - '身穿黑色长裙的卷发港风少女.jpg'
    - '赛博朋克风格的都市霓虹夜景.jpg'

- **关键词 (keywords)**：
  - 3-5个精准中文词，包含风格定义词。

## 4. 输出格式 (JSON Only)

请严格输出纯 JSON 格式，不要包含 markdown 标记：

{
  "secondary": "从现有列表中选择",
  "third": "从现有列表中选择",
  "is_perfect_match": false,
  "new_category_proposal": null,
  "displayTitle": "诗意中文标题",
  "filenames": ["阳光下奔跑的治愈系柴犬.jpg", "草地上欢快玩耍的小柴犬.jpg"],
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "description": "20-40字优美描述",
  "reasoning": "简述可见特征以及选择当前分类的依据"
}`,

  // Cloudflare AI 专用模板 - Mobile（Markdown 友好）
  cloudflare_mobile: `你是一位资深的视觉美学专家和壁纸分类大师。请用 **Markdown 格式** 详细分析这张手机壁纸。

## 📋 分类体系

**主分类**：{{primaryCategory}}

**二级分类选项**：{{secondaryList}}

**三级分类选项**：
{{thirdHints}}

---

## 🎯 分析任务

请按照以下格式输出分析结果（使用 Markdown 格式，支持换行和格式化）：

### 1️⃣ 分类结果

**二级分类**：[从上面列表中选择]

**三级分类**：[从上面列表中选择，优先选择具体风格]

**匹配度**：[完美匹配 / 近似匹配]

---

### 2️⃣ 分类逻辑

详细说明你的分类依据，包括：
- 识别到的主要元素
- 风格特征分析
- 为什么选择这个分类

---

### 3️⃣ 文件名建议（重点）

请根据画面中的**颜色、衣着、动作、光影**生成 3 个长文件名（8-15 个汉字）。

**严格要求**：
1. **必须包含具体的视觉形容词**（如：绿底、白色毛衣、仰望、侧颜、微光）。
2. **禁止**使用短名称（如"女孩.jpg"、"清新壁纸.jpg"）。
3. **禁止**重复同一个句式。

**参考范例**（请模仿这种长度和细节）：
- ✅ 错误示范：女孩侧面.jpg
- ✅ 正确示范：绿幕背景下的白色毛衣侧颜少女.jpg
- ✅ 正确示范：清新治愈系仰望天空的女孩.jpg

**请生成**：
1. **[文件名1].jpg**
2. **[文件名2].jpg**
3. **[文件名3].jpg**

---

### 4️⃣ 关键词

提供 3-5 个精准的中文关键词（必须包含画面中的核心物体）：

- 关键词1
- 关键词2
- 关键词3
- 关键词4
- 关键词5

---

### 5️⃣ 诗意标题

创作一个 8-15 字的诗意标题，要求：
- 避免直白描述，要富有想象力
- 结合画面的光影和情绪

**标题**：[你的创作]

---

### 6️⃣ 详细描述

用 30-60 字详细描述这张图片，**禁止重复**前面的句子：
- 按实际主体描述材质、色彩、场景和细节；非人像图片不要虚构人物。
- 描述画面中的光影与构图。

---

### 7️⃣ 新分类建议（可选）

如果这张图片属于现有分类中缺失的知名 IP、明星或特定风格，请提出建议，否则写"无"。

**建议分类**：[二级分类]/[三级分类]

**理由**：[理由]`,

  mobile: `你是一位资深的视觉美学专家和壁纸分类大师。请分析图片，完成分类归档与元数据生成。

## 1. 现有分类体系 (System DB)

**主分类**：{{primaryCategory}}

**二级分类 (Secondary)**：
{{secondaryList}}

**三级分类 (Third)**：
{{thirdHints}}

## 2. 手机壁纸分析重点

- 优先识别当前目录中的具体作品、IP、人物、动物、场景或设计主题。
- 区分摄影、动漫、插画和创意设计；人像结合服饰、光影、色彩与整体氛围判断。
- 不要仅凭丝袜、制服或单一服饰元素强制归类；明确的身份、作品和整体风格更重要。
- 描述竖向构图中的主要视觉主体，分类不受旧示例范围限制。

## 3. 任务规则

### 任务一：归类与提案

- **必须**从现有列表中选择 \`secondary\` 和 \`third\`；没有三级选项时 third 返回空字符串。
- **新分类提案 (Proposal)**：
  - 如果图片是**现有库中缺失**的知名 IP、明星或特定风格。
  - 请在 \`new_category_proposal\` 中填写对象：suggested_secondary（建议二级）、suggested_third（建议三级）、reason（理由）。没有提案时返回 null。
  - 实际归类必须使用当前存在的路径，缺失的具体作品名仅用于提案。

### 任务二：文案生成

- **标题 (displayTitle)**:：
  - 8-15个汉字，高雅、富有诗意。
  - 即使是"魅力"类图片，标题也要唯美含蓄（如"月光下的黑色曼陀罗"，禁止使用低俗词汇）。

- **文件名 (filenames)**：
  - **提供两个不同的中文文件名**（8-15个汉字）。
  - 禁止英文命名
  - 侧重于**具体描述**，方便检索。
  - 结构：修饰形容词 + '主体' + '场景或动作' + '.jpg'。
  - ❌拒绝太短（如"女孩.jpg"）。
  - ✅示例：
    - '阳光下奔跑的治愈系柴犬.jpg'
    - '身穿黑色长裙的卷发港风少女.jpg'
    - '赛博朋克风格的都市霓虹夜景.jpg'

- **关键词 (keywords)**：
  - 3-5个精准中文词，包含风格定义词（如：胶片感、黑丝、治愈系）。

## 4. 输出格式 (JSON Only)

请严格输出纯 JSON 格式，不要包含 markdown 标记：

{
  "secondary": "从现有列表中选择",
  "third": "从现有列表中选择",
  "is_perfect_match": false,
  "new_category_proposal": null,
  "displayTitle": "诗意中文标题",
  "filenames": ["身穿黑色长裙的卷发港风少女.jpg", "夜色中优雅漫步的长发女孩.jpg"],
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "description": "20-40字优美描述",
  "reasoning": "简述可见特征以及选择当前分类的依据"
}`,

  // Cloudflare AI 专用模板 - Avatar（Markdown 友好）
  cloudflare_avatar: `你是一位资深的视觉美学专家和头像分类大师。请用 **Markdown 格式** 详细分析这张头像图片。

## 📋 分类体系

**主分类**：{{primaryCategory}}

**二级分类选项**：
{{secondaryList}}

**三级分类选项**：
{{thirdHints}}

---

## 🎯 分析任务

### 1️⃣ 分类结果

**二级分类**：[从上面列表中选择]

**三级分类**：[从上面列表中选择]

**匹配度**：[完美匹配 / 近似匹配]

---

### 2️⃣ 头像特征分析

**类型识别**：
- 是否为特定 IP 形象？[如 Hello Kitty、乌萨奇等]
- 是否为动漫角色？[如现有目录中的具体动漫角色或作品子类]
- 是否为人像？[卡通简笔画、氛围感、甜妹等]

**风格特点**：
[详细描述风格特征，可以多行]

**分类依据**：
[说明为什么选择这个分类]

---

### 3️⃣ 文件名建议

提供 2-3 个中文文件名（8-15 个汉字，**不要包含"头像"二字**）：

1. **[具体描述+风格特征].jpg**
2. **[另一个角度的描述].jpg**
3. **[第三个选择].jpg**

示例：
- ✅ 可爱粉色系凯蒂猫卡通形象.jpg
- ✅ 治愈系柴犬阳光下奔跑.jpg
- ❌ 可爱头像.jpg（太简单）

---

### 4️⃣ 关键词

- 关键词1
- 关键词2
- 关键词3
- 关键词4

---

### 5️⃣ 标题

**标题**：[8-15 字的标题，可以简洁活泼]

---

### 6️⃣ 详细描述

[30-60 字的详细描述]

---

### 7️⃣ 新分类建议（可选）

如果是现有分类中缺失的知名 IP 或角色：

**建议分类**：[二级]/[三级]

**理由**：[说明理由]`,

  avatar: `你是一位资深的视觉美学专家和壁纸分类大师。请分析图片，完成分类归档与元数据生成。

## 1. 现有分类体系 (System DB)

**主分类**：{{primaryCategory}}

**二级分类 (Secondary)**：
{{secondaryList}}

**三级分类 (Third)**：
{{thirdHints}}

## 2. 头像分析重点

- 有充分视觉依据时，优先选择当前目录中对应的 IP、动漫作品或人物分类。
- 无法确认身份时，根据真实可见的摄影、绘画、动物、表情或设计特征匹配现有分类，不猜角色名。
- 搞怪或聊天表情用途需要画面依据；不能把所有卡通形象都归入表情包。
- 文件名不要包含“头像”二字。

## 3. 任务规则

### 任务一：归类与提案

- **必须**从现有列表中选择 \`secondary\` 和 \`third\`；没有三级选项时 third 返回空字符串。
- **新分类提案 (Proposal)**：
  - 如果图片是**现有库中缺失**的知名IP或角色。
  - 请在 \`new_category_proposal\` 中填写对象：suggested_secondary（建议二级）、suggested_third（建议三级）、reason（理由）。没有提案时返回 null。
  - 实际归类必须使用当前存在的路径，缺失的具体角色名仅用于提案。

### 任务二：文案生成

- **标题 (displayTitle)**:：
  - 8-15个汉字，高雅、富有诗意。
  - 头像类图片标题可以更简洁活泼。

- **文件名 (filenames)**：
  - **提供两个不同的中文文件名**（8-15个汉字）。
  - 禁止英文命名，禁止包含"头像"二字
  - 侧重于**具体描述**，方便检索。
  - 结构：修饰形容词 + '主体' + '特征或风格' + '.jpg'。
  - ❌拒绝太短（如"女孩.jpg"）、拒绝包含"头像"（如"可爱头像.jpg"）。
  - ✅示例：
    - '可爱粉色系凯蒂猫卡通形象.jpg'
    - '甜美粉色凯蒂猫卡通插画.jpg'
    - '治愈系柴犬阳光下奔跑.jpg'

- **关键词 (keywords)**：
  - 3-5个精准中文词，包含风格定义词。

## 4. 输出格式 (JSON Only)

请严格输出纯 JSON 格式，不要包含 markdown 标记：

{
  "secondary": "从现有列表中选择",
  "third": "从现有列表中选择",
  "is_perfect_match": false,
  "new_category_proposal": null,
  "displayTitle": "诗意中文标题",
  "filenames": ["可爱粉色系凯蒂猫卡通形象.jpg", "甜美粉色凯蒂猫卡通插画.jpg"],
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "description": "20-40字优美描述",
  "reasoning": "简述可见特征以及选择当前分类的依据"
}`
}

/**
 * 替换模板中的变量
 * @param {string} template - 模板字符串
 * @param {Object} variables - 变量对象
 * @returns {string} 替换后的字符串
 */
export function replaceVariables(template, variables) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => variables[key] ?? match)
}

/**
 * 构建变量
 * @param {string} primaryCategory - 主分类
 * @returns {Object} 变量对象
 */
export function buildVariables(primaryCategory, categoryTree = null) {
  const dynamicSeries = categoryTree?.[primaryCategory]
  const useDynamicTree = !!dynamicSeries
  const secondaryCategories = useDynamicTree
    ? (dynamicSeries.secondary || []).map(value => ({ value }))
    : CATEGORIES[primaryCategory]?.subcategories || []
  const secondaryList = secondaryCategories.map(cat => cat.value).join('、')

  let thirdHints = ''
  secondaryCategories.forEach(cat => {
    const thirdList = useDynamicTree
      ? dynamicSeries.third?.[cat.value] || []
      : getThirdLevelCategories(primaryCategory, cat.value)
    thirdHints += `• ${cat.value}：${thirdList.length ? thirdList.join('、') : '（无三级分类，third 返回空字符串）'}\n`
  })

  return {
    primaryCategory,
    secondaryList,
    thirdHints: thirdHints.trim()
  }
}

/**
 * 构建分类提示词
 * @param {string} templateId - 模板 ID
 * @param {string} primaryCategory - 主分类（系列名）
 * @param {string} customPrompt - 自定义提示词（可选）
 * @param {string} provider - AI Provider（可选，用于选择专用模板）
 * @returns {string} 构建的提示词
 */
export function buildPrompt(
  templateId,
  primaryCategory,
  customPrompt = '',
  provider = null,
  categoryTree = null
) {
  if (templateId === 'custom') {
    return replaceVariables(customPrompt, buildVariables(primaryCategory, categoryTree))
  }

  // 对于 default 模板，使用系列专用模板
  if (templateId === 'default') {
    // 如果是 Cloudflare，优先使用 Cloudflare 专用模板
    if (provider === 'cloudflare') {
      const cloudflareTemplate = SERIES_TEMPLATES[`cloudflare_${primaryCategory}`]
      if (cloudflareTemplate) {
        const variables = buildVariables(primaryCategory, categoryTree)
        return `${CLASSIFICATION_RULES}\n\n${replaceVariables(cloudflareTemplate, variables)}\n\n${CLOUDFLARE_RESULT}`
      }
    }

    // 使用标准系列模板
    const specialTemplate = SERIES_TEMPLATES[primaryCategory]
    if (specialTemplate) {
      const variables = buildVariables(primaryCategory, categoryTree)
      return `${CLASSIFICATION_RULES}\n\n${replaceVariables(specialTemplate, variables)}`
    }
  }

  // 使用通用模板
  const template = PROMPT_TEMPLATES[templateId]
  if (!template) {
    throw new Error(`未找到模板: ${templateId}`)
  }

  if (!template.variables || template.variables.length === 0) {
    return template.template
  }

  const variables = buildVariables(primaryCategory, categoryTree)
  return replaceVariables(template.template, variables)
}

export async function buildPromptWithLatestCategories(
  templateId,
  primaryCategory,
  customPrompt = '',
  provider = null,
  options = {}
) {
  if (
    templateId === 'filenameOnly' ||
    (templateId === 'custom' && !/\{\{\s*(secondaryList|thirdHints)\s*\}\}/.test(customPrompt))
  ) {
    return buildPrompt(templateId, primaryCategory, customPrompt, provider)
  }
  const categoryTree = await getUploadCategoryTree(options)
  return buildPrompt(templateId, primaryCategory, customPrompt, provider, categoryTree)
}

/**
 * 验证提示词
 * @param {string} prompt - 提示词
 * @returns {boolean} 是否有效
 */
export function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return false
  }

  if (prompt.trim().length < 10) {
    return false
  }

  return true
}

/**
 * 获取模板列表
 * @returns {Array} 模板列表
 */
export function getTemplateList() {
  return Object.values(PROMPT_TEMPLATES)
}

/**
 * 根据 ID 获取模板
 * @param {string} templateId - 模板 ID
 * @returns {Object|null} 模板对象
 */
export function getTemplateById(templateId) {
  return PROMPT_TEMPLATES[templateId] || null
}

/**
 * 预览提示词
 * @param {string} templateId - 模板 ID
 * @param {string} primaryCategory - 主分类
 * @param {string} customPrompt - 自定义提示词
 * @returns {Object} 预览结果
 */
export async function previewPrompt(
  templateId,
  primaryCategory,
  customPrompt = '',
  provider = null,
  options = {}
) {
  try {
    const prompt = await buildPromptWithLatestCategories(
      templateId,
      primaryCategory,
      customPrompt,
      provider,
      options
    )
    const isValid = validatePrompt(prompt)

    return {
      success: true,
      prompt,
      isValid,
      length: prompt.length,
      lines: prompt.split('\n').length
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      prompt: '',
      isValid: false,
      length: 0,
      lines: 0
    }
  }
}
