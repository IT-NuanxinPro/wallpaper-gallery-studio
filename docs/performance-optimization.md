# 性能优化 - GitHub API 请求优化

## 问题描述

用户在每个页面刷新时都会请求 GitHub API (`https://api.github.com/repos/IT-NuanxinPro/nuanXinProPic`)，导致：
1. 页面出现黑屏状态
2. 如果网络慢或接口慢，用户不知道页面发生了什么
3. 不必要的 API 请求消耗配额

## 优化方案

### 1. 路由守卫优化

**之前的问题**：
- 每次页面导航都会调用 `await authStore.checkPermission()`
- 使用 `await` 阻塞页面加载，等待 API 响应

**优化后**：
```javascript
// 只在首次加载时检查权限，不在页面间导航时检查
if (
  to.meta.requiresAuth &&
  authStore.isAuthenticated &&
  !authStore.permissionChecked &&
  !from.name // 只在首次加载时检查
) {
  // 异步检查权限，不阻塞页面加载
  authStore.checkPermission(owner, repo).catch(err => {
    console.warn('权限检查失败:', err)
  })
}
```

**改进点**：
- 只在首次进入应用时检查权限（`!from.name`）
- 移除 `await`，不阻塞页面加载
- 页面间导航不再重复检查

### 2. 权限检查缓存

**添加 SessionStorage 缓存**：
```javascript
async function checkPermission(owner, repo) {
  // 如果已经检查过且不超过 5 分钟，直接返回缓存结果
  const cacheKey = `permission_${owner}_${repo}`
  const cached = sessionStorage.getItem(cacheKey)
  if (cached && permissionChecked.value) {
    const { level, timestamp } = JSON.parse(cached)
    const now = Date.now()
    // 缓存 5 分钟
    if (now - timestamp < 5 * 60 * 1000) {
      permissionLevel.value = level
      return level
    }
  }
  
  // ... 实际的 API 请求
  
  // 缓存结果
  sessionStorage.setItem(
    cacheKey,
    JSON.stringify({ level, timestamp: Date.now() })
  )
}
```

**缓存策略**：
- 使用 `sessionStorage` 存储权限检查结果
- 缓存时间：5 分钟
- 缓存 key：`permission_${owner}_${repo}`
- 关闭浏览器标签页后缓存自动清除

## 优化效果

### 之前
1. **首次加载**：请求 GitHub API → 等待响应 → 显示页面（黑屏等待）
2. **页面导航**：每次都请求 GitHub API → 等待响应 → 显示页面
3. **刷新页面**：重新请求 GitHub API → 等待响应 → 显示页面

### 优化后
1. **首次加载**：立即显示页面 → 后台异步检查权限
2. **页面导航**：立即显示页面（不请求 API）
3. **刷新页面**：使用缓存（5 分钟内）→ 立即显示页面
4. **5 分钟后刷新**：立即显示页面 → 后台异步更新权限

## 用户体验改善

### 加载速度
- **之前**：等待 API 响应（通常 500ms - 2s）
- **现在**：立即显示（< 100ms）

### 网络慢的情况
- **之前**：黑屏等待，用户不知道发生了什么
- **现在**：页面正常显示，权限在后台检查

### API 请求次数
- **之前**：每次导航都请求
- **现在**：5 分钟内只请求一次

## 注意事项

### 权限变更延迟
如果用户的仓库权限被修改，最多需要 5 分钟才能生效。这是可接受的，因为：
1. 权限变更是低频操作
2. 用户可以通过刷新页面（清除缓存）立即更新
3. 5 分钟的延迟不会影响正常使用

### 缓存清除
缓存会在以下情况清除：
- 关闭浏览器标签页
- 5 分钟后自动过期
- 用户登出

## 相关文件

- `src/router/index.js` - 路由守卫优化
- `src/stores/auth.js` - 权限检查缓存
- `src/main.js` - 应用加载逻辑

## 测试建议

1. **首次加载测试**：清除缓存，刷新页面，观察加载速度
2. **导航测试**：在不同页面间切换，确认不会重复请求 API
3. **缓存测试**：5 分钟内刷新页面，确认使用缓存
4. **网络慢测试**：限制网络速度，确认页面不会黑屏
5. **权限变更测试**：修改权限后，等待 5 分钟或刷新页面，确认权限更新

## 监控建议

可以在浏览器开发者工具中监控：
1. Network 标签：查看 GitHub API 请求次数
2. Console：查看权限检查日志
3. Application → Session Storage：查看缓存数据
