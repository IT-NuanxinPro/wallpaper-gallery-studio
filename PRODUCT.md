# Wallpaper Gallery Studio

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

壁纸维护者及拥有图床仓库写权限的同事。日常批量导入图片或视频，使用 AI 生成分类和文案，人工审核后发布。

## Product Purpose

把本地素材变为可在壁纸网站浏览、预览和下载的正式内容。工作台负责上传、审核和任务追踪，云端工作流处理视频与发布。

## Operating Context

- 图片上传、视频工作台、AI 工坊、历史与设置为现有入口。
- GitHub 身份和仓库权限控制写入；视频任务由独立 Worker 保存。
- 用户已明确本轮只重构工作台，壁纸网站有进行中的独立改动。

## Capabilities and Constraints

- Vue 3、Pinia、Element Plus、GSAP；保留当前服务端与发布协议。
- AI 固定 GPT-6.1 Sol；手填 Key 由三个入口共享，当前标签页刷新恢复、新标签清空。
- 视频上传上限 250 MB，分块直传，失败与暂停需要可恢复。
- 发布完成应退出待办工作区，释放选中、审核草稿、上传文件引用。正式资源与历史任务必须保留。
- 不以 UI 清理为理由删除云端壁纸或发布记录。

## Brand Commitments

产品名称 Wallpaper Gallery · Studio。用户指定参考 stageshow 的精致产品交互，重点改善视频操作，不照搬演示用的假数据或光标动画。

## Product Principles

- 一眼看到下一步，完成后明确收尾。
- 操作和状态真实可靠，视觉反馈与实际结果同步。
- 素材是主角，减少重复框架和装饰。
- 保护现有上传、AI 会话、审核与发布能力。
