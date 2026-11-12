# 视频链路部署与验收清单

核对日期：2026-11-12。本文对应当前 Studio `wrangler.video.toml`、`worker/video/**`，以及 workflow 仓库的 `video-process.yml`、`video-publish.yml` 和 `scripts/video/**`。这是待执行的部署说明；本次没有创建云资源、写入远端 secrets、执行 D1 远端迁移或部署。

当前可以进行本地视频处理、接口、浏览器上传/预览/AI 联调；真实云端完整链路尚未完成验收。用户已提交 gallery 前端到 `62ed916`，主任务确认工作区干净，部署数据同步与回执接入正在实现；只调整部署衔接，不改用户页面和路由。生产上线仍待单独批准。

当前基础设施核对状态：正式桶 `wallpaper-images` 已确认存在；私有暂存桶尚未创建；本地与新视频Worker尚未配置 R2 S3 Access Key/Secret。主任务已确认gallery及图床仓库现有Secrets包含R2访问密钥，但Secret值不可读；获批部署时可复用现有管理授权配置新Worker，不应断言整个账户缺少这些密钥。GitHub 已有 keyring 登录及用户额外授权，凭据不写入本文或其他仓库文件。GitHub 授权不代表已经完成新Worker的R2 S3授权配置。

## 资源及权限准备

| 资源           | 名称/用途                                       | 操作边界                                                                       |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| 独立 Worker    | `wallpaper-video-ingest`                        | 使用 `wrangler.video.toml`，不要混用旧 AI/OAuth Worker 配置                    |
| D1             | `wallpaper-video-tasks`，绑定 `DB`              | 新建独立库；执行 `worker/video/migrations/0001_video_tasks.sql`                |
| 私有暂存 R2    | `wallpaper-video-staging`，绑定 `VIDEO_STAGING` | 新建；保持公网桶访问关闭；只签名访问 `jobs/<jobId>/`                           |
| 已有正式 R2    | `wallpaper-images`，绑定 `VIDEO_PUBLIC`         | 复用；不要重建、清空、修改静态图片路径、公开访问、域名、CORS、现有生命周期策略 |
| 图床 GitHub    | `IT-NuanxinPro/nuanXinProPic`                   | 保存视频元数据、JSON 和 `stats.video`；发布器只做必要的版本合并                |
| 执行器 GitHub  | `IT-NuanxinPro/wallpaper-gallery-workflow`      | 新的处理/发布 workflow 必须进入默认分支，才能接收 repository_dispatch/定时事件 |
| gallery GitHub | `IT-NuanxinPro/wallpaper-gallery`               | 用户前端已提交 `62ed916`；部署协议接入中，上线待批准                           |

**GitHub token 不能替代 R2 S3 凭据。** 浏览器分块上传需要 Worker 使用 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` 生成 S3 签名。已有 `gh` 登录或 `GITHUB_DISPATCH_TOKEN` 无法导出这些值，也不能仅凭 GitHub 权限创建 Cloudflare R2/D1。仍需对应 Cloudflare 账户的管理授权和 R2 S3 密钥；缺少时应停留在本地验证，不能声称已具备云端上传条件。

R2 S3 密钥在 Cloudflare R2 的 API token 管理中生成，选择 **Object Read & Write**，范围仅包含上述暂存桶和正式桶。这里只增加供视频服务使用的授权，不修改正式桶现有配置。Worker 通过绑定执行 HEAD/清理，通过 S3 凭据执行签名多段上传和 GET/PUT。

## 配置独立 Worker

以下命令在 Studio 根目录执行。命令固定 `wrangler@4.160.1`；仅作为待操作说明，本轮未安装全局 CLI。部署、远端建库/迁移、修改桶 CORS、写入 secrets 等远端变更应在实际执行前取得明确确认。

```sh
cd "/Users/nuanxinpro/frontProject/gihtub/wallpaper/wallpaper-gallery-studio"
npx --yes wrangler@4.160.1 login
npx --yes wrangler@4.160.1 whoami
```

先确认 Cloudflare 账户和 R2/D1 所在账户一致。非交互环境可使用独立 Cloudflare 部署 API token，通过受保护的环境或 CI secrets 注入；不要将它、R2 密钥或内部服务密钥加入任何 `VITE_*` 变量。

### D1 与绑定

```sh
npx --yes wrangler@4.160.1 d1 create "wallpaper-video-tasks" --config "wrangler.video.toml"
```

把返回的实际 `database_id` 填入 `wrangler.video.toml` 的 `[[d1_databases]]`，替换 `REPLACE_WITH_CREATED_D1_DATABASE_ID`。保留 `binding="DB"` 和 `migrations_dir="worker/video/migrations"`。如该库已经存在，读取并复用其 ID，不再次创建。

```sh
npx --yes wrangler@4.160.1 d1 migrations list "wallpaper-video-tasks" --remote --config "wrangler.video.toml"
npx --yes wrangler@4.160.1 d1 migrations apply "wallpaper-video-tasks" --remote --config "wrangler.video.toml"
npx --yes wrangler@4.160.1 d1 execute "wallpaper-video-tasks" --remote --config "wrangler.video.toml" --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('video_tasks','video_publication_jobs');"
```

最后一步应看到 `video_tasks`、`video_publication_jobs`。`--local` 只迁移本机模拟库，不能替代 `--remote`。

### 私有暂存桶与浏览器 CORS

```sh
npx --yes wrangler@4.160.1 r2 bucket create "wallpaper-video-staging" --config "wrangler.video.toml"
```

如已存在则复用。不要创建或修改 `wallpaper-images`。核对 `STAGING_BUCKET_NAME`、`PUBLIC_BUCKET_NAME` 和两个 R2 binding 的 bucket_name 与实际桶名一致。

复制 `docs/video-staging-cors.example.json` 为本地部署配置，替换 `https://YOUR-STUDIO-ORIGIN.example`，只保留实际需要的来源。来源必须是完整 scheme/host/port，不含页面路径；`localhost` 与 `127.0.0.1` 是两个来源，端口变化也必须对应加入。生产部署通常可以去掉本地来源。

```sh
npx --yes wrangler@4.160.1 r2 bucket cors list "wallpaper-video-staging" --config "wrangler.video.toml"
npx --yes wrangler@4.160.1 r2 bucket cors set "wallpaper-video-staging" --file "docs/video-staging-cors.local.json" --config "wrangler.video.toml"
npx --yes wrangler@4.160.1 r2 bucket cors list "wallpaper-video-staging" --config "wrangler.video.toml"
```

`cors set` 会覆盖指定桶的整个 CORS 配置；先读取后合并。这里只针对暂存桶，不对正式桶执行该命令。示例是 Wrangler/R2 API 的小写 `rules/allowed/exposeHeaders` 格式，不能直接换成 AWS S3 的 `CORSRules/AllowedOrigins` 格式。

- `PUT`：浏览器上传分块。
- `GET`：读取预览与云端帧，AI读取帧使用 fetch。
- `HEAD`：浏览器/工具检查媒体；Worker绑定自身的HEAD不依赖CORS。
- `ExposeHeaders` 对应示例中的 `exposeHeaders`，必须包含 `ETag`，否则 PUT 即使成功，浏览器也无法读取 ETag 完成合并。
- `Range` 与暴露的 `Content-Range/Accept-Ranges` 用于视频分段读取。签名对象请求不发送 GitHub Authorization。

Worker 本身还需要独立的 `ALLOWED_ORIGINS`：在 `wrangler.video.toml` 中设置相同的实际 Studio 来源，以逗号分隔。R2 CORS 与 Worker CORS 是两层配置，只设置其中一层不够。

已发布任务清理私有素材后，管理工作台预览改用正式桶签名 GET。不要为了排障覆盖正式桶的现有 CORS；先检查它是否已允许 Studio 的媒体读取，如需调整应另行审查合并并取得授权。

### Worker secrets

| Secret                  | 来源与用途                                                               |
| ----------------------- | ------------------------------------------------------------------------ |
| `R2_ACCOUNT_ID`         | 两个 R2 桶所在账户ID，供S3主机名使用                                     |
| `R2_ACCESS_KEY_ID`      | 范围限定到两个桶的R2 S3访问Key ID                                        |
| `R2_SECRET_ACCESS_KEY`  | 与Key ID对应的Secret，仅在安全位置保存                                   |
| `VIDEO_SERVICE_TOKEN`   | 独立随机服务密钥，Worker与执行器仓库Actions保存完全相同值                |
| `GITHUB_DISPATCH_TOKEN` | 仅选执行器仓库的GitHub服务token，触发repository_dispatch并查询Runner状态 |

通过交互提示输入，命令和文档均不含真实值：

```sh
npx --yes wrangler@4.160.1 secret put "R2_ACCOUNT_ID" --config "wrangler.video.toml"
npx --yes wrangler@4.160.1 secret put "R2_ACCESS_KEY_ID" --config "wrangler.video.toml"
npx --yes wrangler@4.160.1 secret put "R2_SECRET_ACCESS_KEY" --config "wrangler.video.toml"
npx --yes wrangler@4.160.1 secret put "VIDEO_SERVICE_TOKEN" --config "wrangler.video.toml"
npx --yes wrangler@4.160.1 secret put "GITHUB_DISPATCH_TOKEN" --config "wrangler.video.toml"
```

`GITHUB_DISPATCH_TOKEN` 推荐细粒度token，仅选择 `wallpaper-gallery-workflow`，授予 Contents read/write（repository_dispatch所需）与 Actions read（确认旧Runner是否结束）。组织要求审批时，需审批完成后才有效。浏览器现有登录token另由Worker独立检查图床仓库写权限，不使用上述服务token冒充用户。

### 发布 Worker

```sh
npx --yes wrangler@4.160.1 deploy --dry-run --config "wrangler.video.toml"
npx --yes wrangler@4.160.1 deploy --config "wrangler.video.toml"
```

记录实际 HTTPS Worker 根地址，不包含 `/video` 路径。当前 `/health` 的 `configured` 只检查 DB/暂存桶绑定，不能证明S3密钥、GitHub触发凭据、正式桶或Actions配置完整。需要按后面的真实验收继续验证。

## 配置执行器仓库 Actions

核对过的实际工作流：

| 文件                                  | 显示名称                | 触发方式                                                                               | 队列消费者                              |
| ------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- |
| `.github/workflows/video-process.yml` | Process queued videos   | `process-videos` repository_dispatch、workflow_dispatch、每10分钟补扫                  | `python -m video process --max-tasks 8` |
| `.github/workflows/video-publish.yml` | Publish reviewed videos | `publish-videos` repository_dispatch、workflow_dispatch、每小时05/15/25/35/45/55分补扫 | `python -m video publish --max-tasks 1` |

Worker另有每5分钟定时器，补触发持久队列并回收已结束Runner的失效租约。事件中的 job_id/publication_id 仅是唤醒提示；实际任务从D1原子领取。

在 `IT-NuanxinPro/wallpaper-gallery-workflow` 设置以下Repository Actions secrets：

| Secret                | 要求                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `VIDEO_SERVICE_TOKEN` | 必须与Worker同值                                                                                                                       |
| `REPO_TOKEN`          | 发布器使用的跨仓库token：图床Contents read/write；gallery Actions read/write（触发、读取运行、下载部署结果artifact），并可读取其元数据 |

`REPO_TOKEN` 范围只选图床和gallery两个目标仓库。当前代码只有一个 `REPO_TOKEN`，细粒度token的权限会作用于所选仓库集合，不能误认为每个仓库可在同一token里独立配不同权限。不要打印、替换或扩大现有token范围来绕过未授权仓库。

通过 `gh` 交互输入secret，不把值作为参数：

```sh
gh secret set "VIDEO_SERVICE_TOKEN" --repo "IT-NuanxinPro/wallpaper-gallery-workflow"
gh secret set "REPO_TOKEN" --repo "IT-NuanxinPro/wallpaper-gallery-workflow"
```

Actions variables：

| Variable                   | 值                                                                   |
| -------------------------- | -------------------------------------------------------------------- |
| `VIDEO_API_URL`            | 实际Worker HTTPS根地址，必填；当前YAML也兼容同名secret               |
| `VIDEO_DATA_REPOSITORY`    | `IT-NuanxinPro/nuanXinProPic`                                        |
| `VIDEO_DATA_BRANCH`        | `main`                                                               |
| `VIDEO_GALLERY_REPOSITORY` | `IT-NuanxinPro/wallpaper-gallery`                                    |
| `VIDEO_GALLERY_REF`        | 完成部署协议接入后的已发布分支/ref，默认 `main`                      |
| `VIDEO_GALLERY_WORKFLOW`   | gallery完成下节协议后，填写真实workflow文件名/ID                     |
| `VIDEO_INGEST_ENABLED`     | 默认未设置/关闭；所有配置与验收齐备并获批后，最后设置为字符串 `true` |

示例只设置已知非敏感变量：

```sh
gh variable set "VIDEO_API_URL" --body "https://YOUR-VIDEO-WORKER.example" --repo "IT-NuanxinPro/wallpaper-gallery-workflow"
gh variable set "VIDEO_DATA_REPOSITORY" --body "IT-NuanxinPro/nuanXinProPic" --repo "IT-NuanxinPro/wallpaper-gallery-workflow"
gh variable set "VIDEO_DATA_BRANCH" --body "main" --repo "IT-NuanxinPro/wallpaper-gallery-workflow"
gh variable set "VIDEO_GALLERY_REPOSITORY" --body "IT-NuanxinPro/wallpaper-gallery" --repo "IT-NuanxinPro/wallpaper-gallery-workflow"
```

不要给执行器配置R2密钥或把它们复制进浏览器；处理/发布runner使用Worker签名的单对象URL。两个Actions jobs默认通过 `vars.VIDEO_INGEST_ENABLED == 'true'` 关闭，防止密钥未配置时每10分钟失败。`VIDEO_GALLERY_WORKFLOW`为空时发布runner会明确失败，而不是把没有部署结果的任务误标published；该发布协议与配置完成之前保持开关关闭。

## Studio 设置

构建环境设置 `VITE_VIDEO_API_URL` 为同一个Worker根地址。未配置时视频页只展示“尚未配置”。构建后再部署Studio；这不是运行时动态变量，修改后需重新构建。

沿用现有GitHub登录和AI凭证，不另填视频密钥。前端可以选帧、人工保存审核，也可在当前浏览器使用已有classifier做AI分析。视频上传/签名读取直接访问R2，需要前述CORS匹配实际Studio来源。

## gallery 部署衔接：已实现，上线待批准

gallery `.github/workflows/deploy.yml` 已在用户提交 `62ed916` 后接入视频inputs、唯一run-name、最新完整数据快照和 `video-publication-result` artifact。新增19项快照/部署测试通过，全站707项通过、7项原有跳过；原项目和包含当前61条视频完整数据的隔离构建均成功。源码已实现不代表远端已上线，只有这些代码推送并完成实际部署后，才配置消费者使用 `deploy.yml`。

部署衔接按以下协议实现、审查和验收，上线另行批准：

1. 接受workflow_dispatch inputs `publication_id`、`minimum_data_ref`。
2. 对应视频运行的run-name严格为 `video:<publication_id>:<minimum_data_ref>`，供publisher找回本次真实运行。
3. 数据checkout/build明确包含最低图床提交；成功后记录实际使用的完整图床提交 `dataSha`，不以请求中的最低SHA冒充实际构建版本。
4. 真正完成Cloudflare Pages部署，取得真实Pages deployment ID，保留既有静态图片部署功能。
5. 上传名为 `video-publication-result` 的artifact，且其中只有一个小JSON文件，建议名 `publication-result.json`，内容：

```json
{
  "publicationId": "本次发布ID",
  "minimumDataRef": "本次最低图床完整提交SHA",
  "dataSha": "实际构建使用的40位完整图床提交SHA",
  "pagesDeploymentId": "真实Cloudflare-Pages-deployment-ID"
}
```

6. 确认 `dataSha` 在图床仓库中包含 `minimum_data_ref`，构建/测试/部署任一步失败必须使该Actions运行失败。
7. 完成并发布这项接入后，才设置 `VIDEO_GALLERY_WORKFLOW` 为实际文件名/ID。若最终沿用deploy.yml则填 `deploy.yml`，如新增文件则填实际新名字。

## 按阶段验收与故障定位

先进行读取验证，再提交明确批准的测试视频；原始文件在正式R2与网站验收完成前保留：

| 阶段          | 成功证据                                                                | 常见阻塞                                                     |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Worker配置    | D1迁移表存在、绑定正确、健康请求可达                                    | `/health`绿色仍可能缺少S3/服务secrets                        |
| 用户鉴权/分类 | 登录用户可GET任务与`/video/topics`，主题来自目标metadata/video.json     | 图床写权限不足、组织token未批准、Worker来源未授权            |
| 上传          | 实际分块PUT成功且浏览器能读取ETag；完成后queued                         | R2 S3凭据缺失/桶范围不符、R2 CORS遗漏来源或ETag              |
| 续传          | 上传中暂停/刷新，重选同源视频，只补缺块；错误文件被拒绝                 | 源文件内容不同、分块记录不一致、签名过期                     |
| 云端处理      | video-process真实Actions运行，处理后awaiting_ai；5帧和完整preview可播放 | workflow尚未进入默认分支、服务token不一致、触发token权限不足 |
| AI/人工审核   | 所选frameId正确、租约及revision生效、保存后awaiting_review              | 现有AI凭据/网络错误、其他页面已更新版本                      |
| 正式对象/数据 | 正式对象HEAD匹配、元数据原子提交SHA、JSON镜像PUT                        | REPO_TOKEN不足、图床分支保护、R2正式桶授权不足               |
| gallery部署   | 唯一匹配的真实Actions成功，artifact有效，真实Pages ID及dataSha被校验    | 部署协议接入中或尚未上线、artifact缺失、取消/超时/错误版本   |
| 完成/重试     | published只在上述证据都成立后出现；失败从publication继续                | 不要重新处理已成功视频来绕过发布错误                         |

只能把已实际验证的阶段报告为成功。当前本地真实FFmpeg、浏览器上传/预览/AI联调结果不等于线上D1/R2/Actions/Pages链路已经部署成功。

在Worker、D1/R2、Actions secrets/vars、gallery部署协议与本地验收齐备，且上线/测试发布获批后，最后启用统一开关，再按实际文件名手动唤醒并查看运行：

```sh
gh variable set "VIDEO_INGEST_ENABLED" --body "true" --repo "IT-NuanxinPro/wallpaper-gallery-workflow"
gh workflow run "video-process.yml" --repo "IT-NuanxinPro/wallpaper-gallery-workflow"
gh run list --workflow "video-process.yml" --repo "IT-NuanxinPro/wallpaper-gallery-workflow" --limit 5
gh workflow run "video-publish.yml" --repo "IT-NuanxinPro/wallpaper-gallery-workflow"
gh run list --workflow "video-publish.yml" --repo "IT-NuanxinPro/wallpaper-gallery-workflow" --limit 5
```

工作流运行成功仍需结合任务状态和产物验收；空队列成功结束不代表处理过测试视频。

### 五个指定视频的真实验收与条件清理

用户授权测试以下5个明确源文件，并允许在对应视频真实上传、发布与网站验收成功后删除该源文件。该授权仅限本表中的绝对路径，不扩展到 Downloads 目录、任何临时Downloads目录、既有动态壁纸目录或其他文件：

| 源文件绝对路径                                       | 删除前条件       |
| ---------------------------------------------------- | ---------------- |
| `/Users/nuanxinpro/Downloads/发光-宝可梦.mp4`        | 本节逐项验收通过 |
| `/Users/nuanxinpro/Downloads/仙侠-动态壁纸.mp4`      | 本节逐项验收通过 |
| `/Users/nuanxinpro/Downloads/二次元-动态.mp4`        | 本节逐项验收通过 |
| `/Users/nuanxinpro/Downloads/光点-动态-古风美女.mp4` | 本节逐项验收通过 |
| `/Users/nuanxinpro/Downloads/二次元-光斑-冷艳.mp4`   | 本节逐项验收通过 |

每个文件独立记录结果，不以批次整体成功代替单文件验收：

1. 上传前记录源文件的大小与SHA-256，核对其与对应job的source身份一致。
2. 经真实视频Worker、R2和Actions处理，获取真实处理结果中的download/preview/选定封面产物清单，记录各自的key、size、SHA-256及对应job/publication ID。下载MP4可能被remux或转码，预览也会压缩；因此正式产物的hash应与**对应处理产物**比较，不能要求它等于原始源视频hash。
3. 正式R2对象可读，并逐个核对size与SHA-256等于已验收的处理产物；确认选定封面正确、预览可播放且分辨率/时长符合处理契约。
4. 完成真实gallery Pages部署回执验收，记录实际Pages deployment ID和数据SHA；网站中能找到对应条目，预览、封面和下载均可访问。通过网站实际资源URL取得的对应媒体size/hash必须与已验收的正式R2/处理产物一致，不能仅凭metadata声称一致。
5. 保存不含token或签名URL的逐文件验收记录。全部条件对该文件成立后，才删除表中该文件；失败、未完成、仅本地/mock验证或无法核验校验和时保留源文件。不得删除目录或通配清理。

当前新视频Worker的本地R2凭据尚未配置，真实云端上线仍需最后批准；这份清理授权不能代替创建资源、写入secrets或上线的批准。本文不执行真实上传、发布或源文件删除。

## 命令与格式核对依据

仓库依据是实际的 `wrangler.video.toml`、`worker/video/storage.mjs`、`worker/video/auth.mjs`、workflow `video-process.yml/video-publish.yml`、`scripts/video/__main__.py` 与 `publish.py`。CORS文件schema、`r2 bucket cors set --file`、D1 `migrations apply --remote` 和交互 `secret put` 已对照官方发布的 Wrangler 4.160.1包源码核对。本次没有执行这些远端配置命令。

## 可审阅的独立服务配置工作流

新增gallery `.github/workflows/video-service-setup.yml`（Configure independent video service），只支持在受信 `main` 上手动workflow_dispatch，不随push或定时器自动运行；生产执行仍需最后明确批准。本轮仅创建工作流、Studio `scripts/video-service-setup.mjs` 和本地fixture测试，没有实际触发。

该工作流可以复用gallery现有的 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_R2_ACCESS_KEY`、`CLOUDFLARE_R2_SECRET_KEY`，在runner内直接写入新Worker Secrets；不会读回、导出、回传Secret值或上传凭据artifact。还需人在获批后单独配置新的gallery Repository Secret `VIDEO_CONFIG_TOKEN`，不要把对话中现有授权token粘贴到代码、文档或workflow参数中。

视频暂存桶优先使用成对的 `VIDEO_STAGING_R2_ACCESS_KEY` / `VIDEO_STAGING_R2_SECRET_KEY`，仅需暂存桶读写权限；正式桶/general保持使用成对的 `VIDEO_R2_ACCESS_KEY` / `VIDEO_R2_SECRET_KEY`，未配置时回退既有 `CLOUDFLARE_R2_ACCESS_KEY` / `CLOUDFLARE_R2_SECRET_KEY`。未设置暂存专用密钥时，兼容原双桶 `VIDEO_R2_*` 配置或既有密钥回退。任一专用组仅有半对时拒绝混用，不覆盖正式站点原密钥。Worker批量Secrets保留 `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` 作为正式/general，并新增 `R2_STAGING_ACCESS_KEY_ID` / `R2_STAGING_SECRET_ACCESS_KEY`；分桶签名与自检使用各自凭据，不需要把暂存专用授权扩大到正式桶，更不能因403把暂存桶改成公开。

setup的Cloudflare管理凭据优先使用单独的 `VIDEO_CLOUDFLARE_API_TOKEN`，未配置时才回退现有站点token；不覆盖站点 `CLOUDFLARE_API_TOKEN`。首次setup运行 `43216702839` 返回generic HTTP401且消费者已反关确认；原日志未标明API阶段，不能仅凭401确定权限缺失位置。修复后错误明确区分Cloudflare D1列表/R2桶/CORS/Worker阶段与GitHub运行列表，并仅显示HTTP状态、数值错误码，不输出URL/token/正文。获批临时管理凭据仅经受保护stdin写入专用Secret，执行完由主任务删除该临时Secret，不把凭据写回本地文件。

专用 `VIDEO_CONFIG_TOKEN` 需仅选择4个相关仓库：Studio用于精确SHA checkout（Contents read）；图床用于Worker业务鉴权自检（Contents write）；执行器用于repository_dispatch、读取运行及设置 `VIDEO_SERVICE_TOKEN`/vars（Contents write、Actions read、Secrets write、Variables write）；gallery用于读取deploy工作流（Actions read及元数据读取）。同一细粒度token的权限适用于所选仓库集合，不能表示每个仓库单独分配不同权限；创建时需评估这个现有单token接口的权限范围。Cloudflare管理token仍需目标账户的Workers Scripts编辑、D1编辑、R2桶创建/读取/CORS管理能力；原Pages专用token未必足够。

手动输入只有：

| Input              | 含义                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `studio_ref`       | 已审查并发布的Studio完整40位小写commit SHA，checkout后再次核对实际HEAD                       |
| `allowed_origins`  | 完整、无通配符的Studio origin列表，默认localhost/127.0.0.1:5174；线上使用时填写实际HTTPS来源 |
| `enable_consumers` | 默认false；显式true时，也只有全部配置自检通过后才设置消费者开关为true                        |

执行顺序与边界：

1. 先把执行器 `VIDEO_INGEST_ENABLED=false`，确认两个视频workflow没有运行/排队任务，避免轮换内部服务密钥打断旧Runner。
2. 列出Cloudflare资源，只复用/创建同名 `wallpaper-video-tasks` 与 `wallpaper-video-staging`；未知列表、重复同名或错误ID均失败。正式 `wallpaper-images` 必须已存在，只绑定/读取，绝不新建、清空或修改其CORS/公开配置。
3. 为暂存桶合并单独的 `video-studio-upload-v1` CORS规则，保留已有其他规则，加入实际origin、GET/HEAD/PUT、Range和ETag暴露。
4. 在runner专用临时目录生成0600配置和0600批量Secrets JSON；运行局部 `npx --yes wrangler@4.160.1`，仅迁移独立视频D1并部署独立Worker。暂存/正式R2分别写入对应Secrets，生成随机 `VIDEO_SERVICE_TOKEN`，Worker中将专用 `VIDEO_CONFIG_TOKEN` 用作 `GITHUB_DISPATCH_TOKEN`，通过stdin同步服务密钥到执行器Secret，不在日志中打印值。
5. 两桶分别执行只读签名HEAD探测（不存在的随机探测key接受404，不上传探测内容）；HEAD失败后在同一桶用同一不存在key做GET，只提取白名单 `S3 <Code>`，最后聚合两个桶的状态，避免第一个403遮住正式桶结果。不输出XML正文、RequestId、对象key或签名。403本身不能判定是授权范围还是签名错误，需结合安全错误码定位。再检查Worker health、带专用token的 `GET /video/jobs`（真实GitHub权限及D1 SQL）、内部鉴权404探测和来源预检；不会调用claim消费真实任务，不读取Secret、不自动扩大权限或修改正式桶ACL。
6. 自检通过才设置执行器 `VIDEO_API_URL`、`VIDEO_GALLERY_WORKFLOW=deploy.yml`；仅当输入显式true才最后启用 `VIDEO_INGEST_ENABLED=true`。默认仍关闭消费者。
7. 成功时输出仅公开Worker URL、D1 ID及桶名；CLI失败会标明独立D1迁移、Worker部署或Worker密钥写入阶段，将stderr先脱敏环境中TOKEN/KEY/SECRET值、临时服务密钥、Bearer及URL查询，再保留最后不超过1200字；不输出完整命令或密钥文件内容。成功或失败均由Node finally和shell EXIT trap清理本次临时目录；失败不删除已经创建的云资源。任何配置失败都会尽力写回 `VIDEO_INGEST_ENABLED=false` 并独立读回确认，workflow另有failure步骤执行同样保护；这也覆盖“远端启用成功、CLI响应丢失”的情况。无法读回false时明确报告“无法确认消费者已关闭，必须人工确认”，不声称开关已安全关闭。

这些检查只说明配置和只读访问可用，不能证明PUT、转码、5帧、正式发布或网站媒体checksum已通过，更不能据此删除5个源文件。实际五视频验收仍按前节逐文件执行。固定Wrangler的secret bulk、cors及migration参数已在本机使用 `--help` 只读核对；本地17项fixture覆盖资源白名单、CORS合并、默认不开消费者、0600密钥临时文件、自检后才启用、失败不删云资源、启用响应丢失后的关停/无法确认分支、API阶段与CLI stderr脱敏诊断、两桶聚合自检，以及分桶凭据签名、半对拒绝、兼容回退和批量Secrets分离。
