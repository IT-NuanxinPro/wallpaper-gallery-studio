# 上传页面权限控制

## 功能概述

为了防止非协作者/管理员浪费 AI 分析额度，上传页面实施了严格的权限控制。只有具有 `write` 或 `admin` 权限的用户才能：
- 拖拽上传图片
- 点击选择图片/文件夹
- 使用 AI 分析功能
- 上传文件到 GitHub

## 权限级别

系统支持 4 种权限级别（由 GitHub 仓库权限决定）：

1. **admin** - 管理员（仓库 Owner）
   - 完全访问权限
   - 可以上传、删除、修改

2. **write** - 协作者（Collaborator）
   - 可以上传文件
   - 可以使用 AI 分析
   - 可以修改分类

3. **read** - 只读访问
   - 只能浏览分类
   - 不能上传文件
   - 不能使用 AI 分析

4. **none** - 无权限
   - 未登录或无仓库访问权限
   - 只能浏览公开内容

## 权限检查点

### 1. 页面级提示
```vue
<!-- 只读提示横幅 -->
<el-alert
  v-if="authStore.permissionChecked && !authStore.canUpload"
  type="warning"
  :closable="false"
>
  🔒 只读模式 - 当前账号没有上传权限，仅可浏览分类
</el-alert>
```

### 2. 拖拽区域
- **有权限**：显示"选择图片"和"选择文件夹"按钮
- **无权限**：显示"🔒 需要协作者或管理员权限"

### 3. 文件添加
```javascript
async function addFiles(files) {
  // 权限检查
  if (!authStore.canUpload) {
    ElMessage.error('🔒 您没有上传权限，无法添加文件')
    return
  }
  // ... 继续处理
}
```

### 4. 拖拽事件
```javascript
async function handleDrop(e) {
  if (!props.canUpload) {
    ElMessage.error('🔒 您没有上传权限')
    return
  }
  // ... 继续处理
}
```

### 5. 按钮点击
```javascript
function triggerInput() {
  if (!props.canUpload) {
    ElMessage.error('🔒 您没有上传权限')
    return
  }
  // ... 继续处理
}
```

## AI 助手页面

**注意**：AI 助手页面是完全开放的，不需要登录或权限即可使用。

原因：
- AI 助手仅用于本地分析，不涉及文件上传
- 用户使用自己的 API Key，成本自负
- 鼓励用户体验 AI 分析功能

## 权限流程

```
用户访问上传页面
    ↓
检查是否登录 (authStore.isAuthenticated)
    ↓
检查仓库权限 (authStore.checkPermission)
    ↓
设置权限级别 (authStore.permissionLevel)
    ↓
计算 canUpload (admin 或 write)
    ↓
传递给组件 (UploadPanel, UploadDropzone)
    ↓
在各个操作点检查权限
```

## 用户体验

### 有权限用户
1. 正常显示上传按钮和拖拽区域
2. 可以自由添加文件
3. 可以使用 AI 分析
4. 可以上传到 GitHub

### 无权限用户
1. 顶部显示只读提示横幅
2. 拖拽区域显示权限提示
3. 尝试添加文件时弹出错误提示
4. 无法使用 AI 分析功能

## 错误提示

### 添加文件时
```
🔒 您没有上传权限，无法添加文件
```

### 拖拽文件时
```
🔒 您没有上传权限
```

### 点击按钮时
```
🔒 您没有上传权限
```

## 技术实现

### Auth Store
```javascript
// 计算属性
const canUpload = computed(() => 
  ['admin', 'write'].includes(permissionLevel.value)
)
```

### 组件传递
```vue
<!-- UploadView.vue -->
<UploadPanel
  :can-upload="authStore.canUpload"
  ...
/>

<!-- UploadPanel.vue -->
<UploadDropzone
  :can-upload="canUpload"
  ...
/>
```

### 权限检查
```javascript
// 在每个关键操作点检查
if (!authStore.canUpload) {
  ElMessage.error('🔒 您没有上传权限')
  return
}
```

## 安全考虑

1. **前端检查**：防止误操作，提升用户体验
2. **后端验证**：GitHub API 会验证 token 权限
3. **双重保护**：即使绕过前端检查，后端也会拒绝无权限操作

## 权限缓存

为了提升性能，权限检查结果会缓存 5 分钟：

```javascript
// 缓存在 sessionStorage
const cacheKey = `permission_${owner}_${repo}`
sessionStorage.setItem(cacheKey, JSON.stringify({
  level: 'write',
  timestamp: Date.now()
}))
```

## 测试场景

### 场景 1：管理员用户
- ✅ 可以添加文件
- ✅ 可以拖拽上传
- ✅ 可以使用 AI 分析
- ✅ 可以上传到 GitHub

### 场景 2：协作者用户
- ✅ 可以添加文件
- ✅ 可以拖拽上传
- ✅ 可以使用 AI 分析
- ✅ 可以上传到 GitHub

### 场景 3：只读用户
- ❌ 不能添加文件
- ❌ 不能拖拽上传
- ❌ 不能使用 AI 分析
- ❌ 不能上传到 GitHub
- ✅ 可以浏览分类

### 场景 4：未登录用户
- ❌ 不能添加文件
- ❌ 不能拖拽上传
- ❌ 不能使用 AI 分析
- ❌ 不能上传到 GitHub
- ✅ 可以浏览公开内容

## 相关文件

- `src/stores/auth.js` - 权限管理
- `src/views/UploadView.vue` - 上传页面主视图
- `src/components/upload/UploadPanel.vue` - 上传面板
- `src/components/upload/UploadPanel/UploadDropzone.vue` - 拖拽区域
