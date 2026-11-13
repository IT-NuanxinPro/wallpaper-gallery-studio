# 开源自托管架构分析

状态：方案分析，未实现 Docker、YAML 运行时配置或仓库迁移。日期：2026-11-13。

## 结论

推荐先实现“一份部署配置 + 一个应用发行入口”，保留已有 GitHub Actions 与 Cloudflare 运行方式；再增量提供可选 Compose 独立模式。工作台与工作流源码可以合并到一个应用仓库，媒体数据仓库继续独立。用户最终只需下载 compose.yaml 与 configuration.yaml，并拉取已发布镜像，不需要下载两个源代码仓库。

把现在的前端直接装进 Nginx 容器，只解决网页托管，解决不了仓库地址分散、Worker/R2/D1 配置、OAuth 和发布依赖。把 Actions YAML 放入容器也不会让它自动成为后台任务服务。

## 当前实际边界

1. 工作台是 Vite 静态前端。仓库初值来自 VITE\_\*，浏览器配置可覆盖。工作流与网站此前有作者仓库回退，当前改造已将其接入统一配置并移除隐式回退。
2. 静态图片由工作流项目 .github/workflows/process-wallpapers.yml 处理；它仍直接声明 IMAGE_REPO=IT-NuanxinPro/nuanXinProPic。rollback.yml 同样如此，外部用户不能只修改工作台就完成整套切换。
3. 视频控制层在工作台 worker/video，使用 D1 保存租约、审核和发布状态，R2 签名授权及绑定读写；当前控制端以 GITHUB_OWNER 同时决定图床与工作流owner。
4. 视频处理与发布在工作流项目 scripts/video 中，有独立 Python CLI；入口要求 numeric GITHUB_RUN_ID，发布依赖 GitHub 仓库、网站 workflow/ref 与部署回报，不能原样当独立常驻进程。
5. scripts/video-local-server.mjs 是集成测试环境：模拟GitHub鉴权、模拟R2、临时签名。不能把它直接作为生产API镜像。
6. 网站构建部署仍属于第三个发布目标。合并“工作台+工作流”不能让网站部署、数据仓库和R2凭空消失。
7. 图床资源及Git历史体积大，不应打进应用镜像，也不应作为普通开源用户必须克隆的运行依赖。

## 用户流程

安装者：部署应用 → 设置站点域名与OAuth（或使用Token模式）→ 校验存储和发布连接。
使用者：GitHub身份登录 → 获取可访问仓库列表 → 搜索选择数据仓库（自动默认分支）→ 权限复核 → 进入工作台。
AI配置：每人手填Key → 获取models → 选择视觉模型 → 当前标签页共享；不把个人Key放公共YAML。
高级连接：工作流仓库、网站仓库、视频API为可选配置，有明确未配置状态。不要自动“猜一个名字差不多的仓库”然后写入。

## 推荐分阶段交付

### 第一阶段：统一配置，保留云端执行

- 新增版本化配置schema，将data/workflow/gallery/OAuth/video/storage字段集中管理。
- 前端启动读取 /runtime-config.json（或安全的 /api/config），而不是只能依赖构建时VITE\_\*；镜像可原样跨环境复用。
- 服务器启动时读取挂载YAML，验证schema、允许origin、repo/ref、服务URL；只将公开字段投影给前端。
- 浏览器个人仓库选择是否允许覆盖由部署策略显式控制；实例固定服务不能在UI看似切换仓库但后台仍写旧库。
- 配置优先级：schema默认值 → 部署YAML → 环境覆盖 → 允许的用户选择；秘密不经过前端投影。
- 同一配置生成/校验Actions变量、Worker vars/bindings及网站发布参数。移除脚本内作者仓库与桶的固定默认。
- Docker第一版只托管工作台和必要配置端点；视频仍由现有Worker+D1+R2+Actions执行。用户需要配置云端资源，但不需要本地下载workflow源码。

### 第二阶段：一个源码发行仓库，运行组件保持分开

建议目录：

apps/studio/ Vue工作台
services/control/ 任务与上传控制领域
packages/media-pipeline/ Python/FFmpeg图片视频处理
packages/catalog/ JSON契约与发布合并
.github/workflows/ 云端执行适配器
deploy/ Compose、YAML schema、初始化与检查工具

工作流源码与工作台同仓同版本发布，现有workflow仓库可在迁移期保留薄入口调用版本固定的可复用工作流。不要把媒体Git仓库并入应用仓库。旧生产入口保持可回退，避免一次更换仓库地址、队列后端、转码与播放器。

### 第三阶段：可选 Compose 独立模式

提供两个主要服务：

- studio-control：静态前端、公开配置、OAuth交换、受限AI同源代理、任务API与SQLite适配器。
- media-worker：Python、FFmpeg、任务领取与租约心跳、产物验证、发布；默认单并发。

单机优先SQLite卷，不强制Redis/PostgreSQL。共享队列/多实例确有需求再升级。对象存储第一版继续使用R2；S3/MinIO适配必须单独验证multipart、签名、CORS、清理和正式资源契约，不能只改endpoint宣称兼容。

API与媒体消费者可以使用同一个版本标签发布，但分别运行和限额，避免转码耗尽Web进程资源。处理器从Actions中抽出runId/调度依赖，保留同一领域逻辑，而不是同时维护两套发布算法。

支持仅两个文件加secrets目录的操作体验：
docker compose up -d

这只表示可启动软件。首次OAuth注册、仓库写权限、R2访问密钥与公开域名仍需要安装者提供，启动器应给可执行的检查结果，不能宣称完全零配置。

## 提议的配置形状（尚未支持）

```yaml
schemaVersion: 1
app:
  publicUrl: https://studio.example.com
  allowRepositorySelection: true
github:
  data:
    repository: your-org/wallpapers
    branch: main
  workflow:
    repository: your-org/wallpaper-platform
    ref: main
  gallery:
    repository: your-org/wallpaper-site
    ref: main
auth:
  mode: github-oauth
  clientId: your-client-id
  clientSecretFile: /run/secrets/github_oauth_secret
execution:
  backend: github-actions
video:
  apiUrl: https://video.example.com
  maxInputBytes: 250000000
storage:
  driver: r2
  accountId: your-account-id
  stagingBucket: wallpaper-staging
  publicBucket: wallpaper-public
  publicUrl: https://images.example.com
  accessKeyFile: /run/secrets/r2_access_key
  secretKeyFile: /run/secrets/r2_secret_key
ai:
  defaultBaseUrl: http://your-gateway:8080/v1
  credentials: user-session
```

YAML中只写非秘密值与secret文件引用。compose负责ports、healthcheck、volumes、restart、资源限制；应用YAML负责业务。不要把两种schema混在一起，也不要把AI Key、GitHub写token或R2密钥打包到镜像/前端JSON。

HTTP AI接口：同源代理由服务端连接允许的上游，让HTTPS浏览器只请求本站。代理目标必须由安装配置限制，不能成为任意URL转发器；用户Key仅随本次请求转发，不记录或落库。这会改变“浏览器直接连AI”的信任边界，需要明确说明，而不是偷偷代理。

## 迁移验收

- 空环境不包含作者仓库/桶，登录选库后所有请求均指向所选实例配置。
- 同一镜像更换YAML后无需重建，公开config响应不包含秘密。
- Actions与容器执行同一套fixture，产物路径、JSON、历史保留一致。
- 上传断网、worker重启、租约过期、重复领取、并发发布仍可恢复。
- 发布完成但网站部署失败仅重试部署，不重复转码和AI。
- 服务配置指向其他数据仓库时明确拒绝，不能只在UI改名。
- 卷备份恢复可重建任务状态；清理只影响暂存，不能删除正式资源。
- 旧线上链路保持原位，按部署模式逐步切换与回退。

## 建议优先级

先完成登录选仓库和远程模型选择，再做运行时配置与安装检查。随后合并源码发行和提供轻量Docker模式。完全本地控制API/媒体消费者作为后续独立阶段。这样用户马上更易用，同时避免为了“一键启动”重写已经稳定的云端处理链路。

## 参考

Docker Compose环境插值、secrets；GitHub repository_dispatch/workflow_dispatch与可复用工作流；Vite环境变量构建替换；Apple/Stageshow不影响该部署设计。
当前实现证据以本文件“当前实际边界”的源码位置为准。
