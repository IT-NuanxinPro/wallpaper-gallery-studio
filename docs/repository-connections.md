# 仓库自动关联

选择壁纸数据仓库后，Studio 自动补齐尚未配置的工作流与网站仓库，并保留已有手工配置。图片上传页的发布面板也会尝试恢复缺失关联。

自动识别顺序：

1. 读取数据仓库的 .studio/repositories.json，检查数据仓库身份，并从当前 GitHub 账号可访问仓库中确认关联目标。
2. 对同所有者的常见壁纸工作流/网站仓库，检查 process-wallpapers.yml、deploy.yml 及 prepare-deploy-data.js 中的数据仓库声明。
3. 有唯一匹配才自动关联；多个或无法确定时，通过设置中的可搜索 GitHub 仓库列表选择。

已有工作流仓库与网站仓库不会因后台检测被覆盖。换仓库、换账号后迟到的结果不会写入新目标。识别只读，不触发发布。

非标准名称、跨组织部署或动态配置推荐显式清单：

```json
{
  "version": 1,
  "data": { "owner": "your-org", "repo": "wallpaper-data" },
  "workflow": { "owner": "your-org", "repo": "media-processing" },
  "frontend": { "owner": "your-org", "repo": "wallpaper-site" }
}
```

清单不保存令牌或 AI Key，也不会自动导入视频服务、OAuth 等任意外部地址。启用识别不要求添加清单；名称和部署方式不符合现有检测模式时，可以直接在列表选择。
