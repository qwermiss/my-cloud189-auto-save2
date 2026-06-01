<div align="center">
    <img src="img/cloud189.png" alt="Logo" width="200">
    <h1>cloud189-auto-save</h1>
    <p>天翼云盘自动转存系统二开版：自动追更转存、CAS 家庭中转秒传、AI 重命名、TMDB 刮削、SmartStrm Webhook、Telegram/企业微信交互与影院模式界面。</p>
    <p>
        <a href="https://github.com/ymting/my-cloud189-auto-save/packages">
            <img src="https://img.shields.io/badge/GHCR-Docker-blue?style=flat-square&logo=docker" alt="GHCR Docker">
        </a>
        <img src="https://img.shields.io/badge/version-3.0.0-green?style=flat-square" alt="Version 3.0.0">
        <img src="https://img.shields.io/badge/runtime-Node.js%2016+-339933?style=flat-square&logo=node.js" alt="Node.js 16+">
    </p>
</div>

> 本项目基于 [1307super/cloud189-auto-save](https://github.com/1307super/cloud189-auto-save) 深度二次开发。原版账号配置、基础任务、STRM、Emby 等通用说明可继续参考 [README_orig.md](./README_orig.md)，本文档以当前二开版本源码为准。

## 安全提醒

本系统会保存天翼云盘账号、Cookie、AI Key、TMDB Key、推送 Token 等敏感信息。请私有化部署，不建议直接暴露公网；如需远程访问，请使用 HTTPS、反向代理、强密码和系统 API Key。

## concept 相对 main 的主要增强

本分支基于当前 `origin/main` 对比整理，重点新增和优化集中在以下几类：

| 类别 | concept 分支增强 |
|---|---|
| 版本与构建 | 版本升级到 `3.0.0`；GHCR 增加 `concept-latest` / `concept-<version>` 标签 |
| 现代化 UI | 新增侧边栏、仪表盘、媒体墙、统一设置页、通知下拉、固定导航、按钮与暗黑主题优化，**集成玻璃质感多账号容量看板** |
| 影院模式 | 新增 `cinema` 主题，支持任务海报背景轮播、点击任务锁定海报、透明化任务列表和媒体墙 |
| AI 助手 | 新增 AI Function Calling、操作执行器、诊断服务、操作推荐、对话记忆、Web/TG 自然语言操作 |
| TMDB 链路 | 支持任务创建时自动识别 TMDB、保存完整 `tmdbContent`、中英文搜索、冷门影视匹配、手动绑定和强制季数，**支持同剧多季绑定级联（连坐功能）** |
| 任务命名 | 当前流程改为“先识别再创建/重命名”，已移除早期自动重建任务方案，避免重复建任务和删除原任务风险，**支持 TV 剧集每日总集数自动刷新** |
| 多账号与签到 | **新增每日自动签到（个人+家庭空间签到）**、**账号强保活与 Token 静默刷新**（4小时心跳探测、失效告警推送） |
| CAS 秒传 | 优化家庭中转目录查找、固定默认 `cas_temp`、任务开始清空中转目录和回收站，自定义中转目录也支持自动清空 |
| Webhook | SmartStrm webhook 从“转存完成”改为“重命名完成/异常兜底”触发，新增 `{savePath}` / `{videoType}` 占位符 |
| Telegram/企业微信 | Telegram 支持 AI 对话、TMDB 绑定、长消息分页；企业微信自建应用支持交互式任务/TMDB 操作 |
| 稳定性 | 修复 TMDB 超时、重复搜索、智能去重后不重命名、清缓存后前端不刷新、进度条残留等问题 |

对用户来说，最直接的变化是：任务创建更容易一次命中正确影视信息，任务完成后可以自动触发下游 SmartStrm，界面更适合媒体库巡检，AI/TG/企业微信也能直接参与日常运维。

## 当前能力

### 任务转存与追更

- 多账号管理，支持账号密码/Cookie 登录。
- 创建、编辑、删除、批量删除、手动执行、批量执行任务。
- 支持分享链接访问码、保存目录、总集数、过滤规则、独立 Cron。
- 任务执行时检测分享链接失效，失败原因写入任务状态并推送通知。
- 追更进度支持最新转存文件、缺失剧集提示、清缓存后进度归零。

### CAS 家庭中转秒传

本版本支持解析分享目录中的 `.cas` 元数据文件，通过家庭空间中转恢复真实视频文件，再转存到个人目标目录。

核心流程：

```text
.cas 元数据 -> 家庭空间秒传 -> 家庭到个人 COPY 转存 -> 清理中转目录/回收站 -> 重命名/通知/刮削
```

当前实现要点：

- 默认启用 CAS 秒传、家庭空间中转和 `.cas` 清理。
- 默认家庭中转目录为固定 `cas_temp`。
- 未配置账号级中转目录时，会优先查找/创建 `cas_temp`。
- 配置了自定义家庭中转目录或同家庭组继承目录时，任务开始也会清空该中转目录和家庭回收站。
- 请确保中转目录只用于临时秒传，避免误删用户自己的文件。

### AI 智能助手

AI 助手已接入 Web 与 Telegram，支持自然语言识别和 Function Calling。

已实现能力：

- 查询任务、查看详情、执行任务、创建任务、删除任务、批量操作。
- 系统状态查询、失败任务诊断、操作推荐。
- 分享链接智能识别，辅助创建任务。
- 操作安全分级：普通查询自动执行，高风险操作需要确认。
- 后台记录 AI 消息、函数识别、操作执行耗时和错误日志。
- Telegram 长任务列表自动分页，不再截断为固定 10/20 条。

AI 配置入口位于系统设置中的 OpenAI 兼容配置，支持 Base URL、API Key、模型名、测试连接和模型列表获取。系统默认模型配置为 `GLM-4-Flash-250414`，也可换成任何 OpenAI 兼容服务。

### TMDB 识别、绑定与刮削

- 任务创建阶段会尝试识别 TMDB，并保存 `tmdbId`、`videoType`、`tmdbTitle`、`tmdbContent`。
- 任务已有 `tmdbId + videoType` 时，后续重命名会优先复用这些信息，避免重复搜索。
- Web 端支持手动指定 TMDB，支持剧集强制季数 `manualSeason`。
- Telegram/企业微信也支持 TMDB 搜索、选择、绑定与触发重命名。
- 媒体墙直接使用 `tmdbContent` 中的海报、简介、评分、年份，减少前端重复查询。
- **TMDB 级联同步绑定（连坐功能）**：手动绑定剧集（`tv`）的 TMDB 时，若同分享链接下存在其他季的兄弟任务（即具有相同 `realRootFolderId`），系统会自动提取各季名称中的 Season 数值，同步绑定 TMDB ID、标题、季数、集数及 TMDB 详情内容，并自动触发兄弟任务的自动重命名和 Emby 库扫库，省去逐季绑定的繁琐操作。

匹配优先级：

| 优先级 | 来源 | 说明 |
|---|---|---|
| 1 | 手动绑定 TMDB | Web/TG/企业微信指定，支持强制季数 |
| 2 | 任务已有 TMDB 字段 | 复用 `tmdbId + videoType` 快速命名 |
| 3 | 任务名中的 `{tmdb-xxx}` | 从资源名提取 TMDB ID |
| 4 | TMDB 搜索 | 中英文搜索回退 |
| 5 | 正则/AI 重命名 | 正则优先，AI 作为补充 |

> 注意：早期设计中的“未识别影视自动重建任务”已经被当前 TMDB/重命名链路替换。当前源码不存在 `TaskRebuildService.js`、`isRebuiltTask`、`rebuildCount` 等自动重建服务字段。

### 多账号保活与每日自动签到扩容

- **多账号容量看板**：在前端系统仪表盘集成玻璃质感多账号容量聚合看板，利用内存缓存的云盘大小信息进行异步获取，彻底解决因频繁调用接口获取容量导致的前端加载阻塞问题。
- **每日自动签到**：每日定时执行个人签到与家庭签到任务，自动为个人和家庭空间扩容，并生成签到报告推送通知（支持 Telegram/企业微信等渠道）。
- **账号心跳探测与保活**：系统每 4 小时执行一次账号 Session 心跳探测，若发现失效自动执行 Token 静默刷新；若凭证彻底失效则发送失效警告消息，提醒用户扫码重新登录。
- **TV 剧集每日总集数刷新**：每天凌晨 2 点自动检查正在追更的 TV 剧集，若 TMDB 端有更新时同步修改本地总集数，并且在已更新集数满足总集数时，任务自动标记为已完结。

### SmartStrm Webhook 与自定义推送

自定义推送支持 URL、Header、Body 字段模板，并可作为 SmartStrm webhook 触发器使用。

可用占位符：

| 占位符 | 来源 |
|---|---|
| `{{title}}` | 消息标题 |
| `{{content}}` | 消息正文 |
| `{savePath}` | 从正文 `📁 /xxx/yyy` 中提取 |
| `{videoType}` | 从正文 `🎬 movie/tv` 中提取，未提供时默认为 `tv` |

当前触发规则：

- `CustomPushService` 只处理包含 `📁` 路径的消息。
- 普通转存完成消息不带 `📁`，避免误触发 webhook。
- 重命名完成、重命名失败兜底、重命名异常会带 `📁` 路径，用于触发下游 SmartStrm。
- `strmtask` 是 SmartStrm 里的任务名，不等同于 `movie/tv`，请在 webhook 配置中按你的 SmartStrm 任务名填写。

便利性：

- 下游拿到的是重命名后的最终路径，生成 STRM 时文件名已经规范化。
- `{savePath}` 自动从通知中提取，不需要用户手动复制保存目录。
- 只处理带路径的消息，能避开 AI 中间过程、普通通知、Emby 通知等误触发。
- 秒传、手动批量重命名、AI 重命名失败兜底等路径都会尽量发出带 `📁` 的通知，保证下游有信号可用。

#### 界面配置示例

在 Web UI 右下角打开“自定义推送”，添加一条配置：

| 配置项 | 填写示例 |
|---|---|
| 名称 | `SmartStrm` |
| URL | `http://smartstrm:8080/webhook` |
| Method | `POST` |
| Content-Type | `application/json` |
| 启用 | 勾选 |

添加一个 `JSON` 类型字段，值填写：

```json
{
  "event": "cs_strm",
  "strmtask": "tv,movie",
  "savepath": "{savePath}"
}
```

如果你的 SmartStrm 任务名不是 `tv,movie`，请把 `strmtask` 改成你在 SmartStrm 中创建的任务名，例如：

```json
{
  "event": "cs_strm",
  "strmtask": "anime",
  "savepath": "{savePath}"
}
```

#### `data/config.json` 配置示例

也可以直接在 `data/config.json` 的 `customPush` 数组中加入以下配置，然后重启服务或在设置页保存一次：

```json
{
  "customPush": [
    {
      "name": "SmartStrm",
      "description": "重命名完成后通知 SmartStrm 生成 STRM",
      "url": "http://smartstrm:8080/webhook",
      "method": "POST",
      "contentType": "application/json",
      "enabled": true,
      "fields": [
        {
          "type": "json",
          "key": "body",
          "value": "{\"event\":\"cs_strm\",\"strmtask\":\"tv,movie\",\"savepath\":\"{savePath}\"}"
        }
      ]
    }
  ]
}
```

#### 触发后的通知形态

系统重命名成功后会发送类似通知，`CustomPushService` 会从 `📁` 行提取路径：

```text
《资源名》重命名完成
已处理 3 个文件
📁 /我的应用/极空间/动漫/资源名
重命名详情：
原文件名.mkv -> 资源名 - S01E01.mkv
```

最终发送给 SmartStrm 的请求体大致为：

```json
{
  "event": "cs_strm",
  "strmtask": "tv,movie",
  "savepath": "/我的应用/极空间/动漫/资源名"
}
```

### STRM、Emby 与媒体服务

- 支持任务新增文件后生成 STRM。
- 支持基于 Alist 的全量 STRM 生成。
- 支持 Emby 通知与 `/emby/notify` 回调。
- 支持媒体刮削、海报/背景图/简介展示。
- 支持账号级本地 STRM 前缀、云端媒体前缀、Emby 路径替换。

### Telegram 与企业微信

Telegram：

- 可作为通知通道。
- 可作为机器人交互入口。
- 支持任务列表、账号切换、任务执行、STRM、Emby、删除任务、CloudSaver 搜索、TMDB 绑定。
- 普通文本可进入 AI 助手，不必记命令。

企业微信：

- 支持机器人 webhook 推送。
- 支持自建应用回调 `/wecom/callback`。
- 支持交互式选择任务、搜索 TMDB、绑定季数、执行任务。

### 前端界面

- 支持浅色、深色、跟随系统、影院模式。
- 影院模式会轮播任务海报背景，点击任务卡片可锁定当前任务海报，点击空白区域恢复轮播。
- 媒体墙展示海报、简介、TMDB 评分、追更进度和快捷操作。
- 删除任务使用自定义确认弹窗，可选择是否同步删除云盘文件。
- 设置页提供系统、任务、CAS、推送、代理、AI、STRM、Emby、TMDB、Alist、自定义推送等配置入口。

## 快速部署

### Docker

GHCR 工作流会按分支生成镜像标签：

- `latest`：main/master 分支
- `dev-latest`：dev 分支
- `concept-latest`：concept 分支
- `3.0.0` / `concept-3.0.0` 等版本标签来自 `package.json`

示例：

```bash
docker run -d \
  --name cloud189-auto-save \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /yourpath/data:/home/data \
  -v /yourpath/strm:/home/strm \
  -e PUID=0 \
  -e PGID=0 \
  ghcr.io/ymting/my-cloud189-auto-save:concept-latest
```

访问：

```text
http://localhost:3000
```

默认登录：

```text
用户名：admin
密码：admin
```

首次登录后请立即修改系统密码。

### 源码运行

```bash
yarn install
yarn build
yarn start
```

开发模式：

```bash
yarn dev
```

项目默认监听 `3000` 端口，数据写入 `data/`，STRM 写入 `strm/`。

## 目录结构

```text
src/
├── index.js                     # Express 入口与 API 路由
├── database/index.js            # SQLite + TypeORM 数据源
├── entities/index.ts            # Account / Task / CommonFolder 实体
├── services/
│   ├── task.js                  # 任务执行、CAS、重命名核心逻辑
│   ├── taskEventHandler.js      # 任务完成事件、通知、刮削、Webhook 触发
│   ├── cloud189.js              # 天翼云盘接口封装
│   ├── ai.js                    # OpenAI 兼容调用与 Function Calling
│   ├── AIIntentService.js       # AI 操作定义与安全分级
│   ├── AIOperationHandler.js    # AI 操作执行器
│   ├── telegramBot.js           # Telegram 机器人
│   ├── tmdb.js                  # TMDB 查询与详情
│   ├── strm.js                  # STRM 生成
│   └── message/CustomPushService.js
└── public/
    ├── index.html               # Web UI
    ├── js/                      # 前端功能脚本
    └── css/                     # 主题与组件样式
```

## 主要 API

所有 `/api/*` 接口默认需要登录 Session；也可以在请求头携带 `x-api-key`，值为系统设置中的 API Key。

常用接口：

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/accounts` | 账号列表 |
| `POST` | `/api/accounts` | 新增账号 |
| `PUT` | `/api/accounts/:id/family-folder` | 设置家庭中转目录 |
| `GET` | `/api/tasks` | 任务列表 |
| `POST` | `/api/tasks` | 创建任务 |
| `PUT` | `/api/tasks/:id` | 更新任务 |
| `POST` | `/api/tasks/:id/execute` | 执行任务 |
| `POST` | `/api/tasks/:id/clear-cache` | 清任务缓存/追更进度 |
| `POST` | `/api/tasks/:id/manual-tmdb` | 手动绑定 TMDB 并触发重命名 |
| `GET` | `/api/tmdb/search` | TMDB 搜索 |
| `GET` | `/api/tmdb/detail` | TMDB 详情 |
| `POST` | `/api/chat/enhanced` | AI 助手增强对话 |
| `POST` | `/api/chat/execute-function` | 执行 AI 工具调用 |
| `POST` | `/api/strm/generate-all` | 全量 STRM 生成 |
| `POST` | `/api/custom-push/test` | 测试自定义推送 |

## 使用流程建议

1. 登录系统并修改默认密码。
2. 添加天翼云盘账号，确认账号可正常列目录。
3. 如需 CAS 秒传，确认账号有家庭空间，并为账号选择专用家庭中转目录。
4. 配置 TMDB API Key，用于海报、简介、标题识别和刮削。
5. 配置 OpenAI 兼容 AI 服务，用于 AI 助手和复杂重命名兜底。
6. 配置 Telegram/企业微信/自定义推送。
7. 配置 STRM、Emby、Alist 或 SmartStrm webhook。
8. 创建任务，执行一次，检查日志、重命名结果和下游 webhook。

## `.cas` 文件格式

系统会读取分享目录中的 `.cas` 文件，常见格式如下：

```json
{
  "name": "Example.S01E01.2160p.mkv",
  "size": 1234567890,
  "md5": "A1B2C3D4E5F6...",
  "sliceMd5": "1234567890AB..."
}
```

字段名以当前 `CasUtils` 解析逻辑为准。若秒传失败，请先检查 `.cas` 文件是否完整、家庭空间是否可用、目标账号是否有转存权限。

## 近期关键变更

### v3.0.0 / 2026-06

- **多账号自动签到与扩容**：实现天翼云盘每日自动签到（个人+家庭签到），自动扩容空间并推送每日签到报告。
- **多账号容量聚合看板**：在 Web 仪表盘集成毛玻璃容量看板，基于内存缓存异步载入以防频繁 API 导致界面加载卡顿。
- **账号强保活与 Token 静默刷新**：每 4 小时进行一次 Session 心跳探测，支持失效时 Token 静默刷新及通知警报。
- **级联同步同剧多季绑定 (连坐功能)**：手动绑定某一季 TMDB 时，可自动同步绑定信息（集数、详情、季数）至同分享链接下的其他季，并级联触发重命名、推送及 Emby 库扫库。
- **TV 剧集总集数每日刷新**：凌晨 2 点自动刷新未完结剧集的最新总集数，满足时自动完结。
- **UI 与交互深度优化**：
  - AI 助手任务列表完整显示，Telegram 超长消息分页发送。
  - 新增 AI 聊天与 Function Calling 调试日志。
  - 影院模式落地，支持海报背景轮播、任务锁定、透明化 UI 适配。
  - SmartStrm webhook 调整为重命名完成后触发，只处理带 `📁` 路径的消息。
  - 手动批量重命名成功后也会发送带路径通知，触发 webhook。
  - 秒传中转目录固定为 `cas_temp`，创建失败后会重试查找已存在目录。
  - 自定义家庭中转目录也支持任务开始时自动清空。
  - 清缓存后追更进度和进度条正确归零。

## 注意事项

- `data/` 是运行数据目录，包含 SQLite 数据库、配置和 Session，务必持久化和备份。
- `strm/` 是 STRM 输出目录，如启用 STRM 请持久化。
- `memory/` 与 `docs/` 是本地开发上下文目录，已被 `.gitignore` 忽略，不应推送。
- 家庭中转目录会被清空，请务必使用专用临时目录。
- 公开部署前必须修改默认账号密码，并建议配置系统 API Key。

## 鸣谢

- [原版项目：1307super/cloud189-auto-save](https://github.com/1307super/cloud189-auto-save)
- [OpenList](https://github.com/OpenListTeam/OpenList) - 家庭空间接口与转存参考
- [OpenList-CAS](https://github.com/GitYuA/OpenList-CAS) - CAS 秒传参考
