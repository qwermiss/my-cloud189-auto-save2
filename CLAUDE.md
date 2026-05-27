# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

天翼云盘自动转存系统 (v3.0.0)，支持自动追更转存、CAS 家庭中转秒传、AI 重命名、TMDB 刮削、SmartStrm Webhook、Telegram/企业微信交互。

## 常用命令

```bash
yarn install          # 安装依赖
yarn build            # 编译 TypeScript (tsc)
yarn start            # 生产运行 (node dist/index.js)
yarn dev              # 开发模式 (ts-node src/index.js)
```

项目默认监听 `3000` 端口，数据写入 `data/`，STRM 写入 `strm/`。

## 核心架构

### 数据层
- `src/database/index.js` - SQLite + TypeORM 数据源初始化
- `src/entities/index.ts` - Account / Task / CommonFolder 实体定义

### 服务层 (src/services/)
| 服务 | 职责 |
|------|------|
| `task.js` | 任务执行核心：转存、CAS秒传、增量检测、重命名触发 |
| `taskEventHandler.js` | 任务完成事件：通知发送、重命名、STRM、刮削、Emby入库 |
| `scheduler.js` | 定时任务调度 (node-cron) |
| `cloud189.js` | 天翼云盘 API 封装：登录、转存、家庭空间秒传 |
| `ai.js` | OpenAI 兼容调用与 Function Calling |
| `AIIntentService.js` | AI 操作定义与安全分级 |
| `AIOperationHandler.js` | AI 操作执行器 |
| `telegramBot.js` | Telegram 机器人交互 |
| `WeChatWorkService.js` | 企业微信机器人交互 |
| `tmdb.js` | TMDB 搜索与详情查询 |
| `strm.js` | STRM 文件生成 |
| `emby.js` | Emby 入库通知 |
| `ConfigService.js` | 配置管理 (data/config.json) |

### 通知层 (src/services/message/)
- `MessageManager.js` - 多通道消息分发
- `CustomPushService.js` - 自定义推送与 SmartStrm webhook 触发
- `TelegramService.js` / `WeworkService.js` 等 - 各平台推送实现

### 前端 (src/public/)
- `index.html` - Web UI 入口
- `js/` - 功能脚本 (tasks, accounts, settings, chat, media 等)
- `css/` - 主题样式 (浅色/深色/影院模式)

## 关键数据流

### 任务执行流程
```
scheduler.processTask()
  → task.processTask()           # 转存/CAS秒传
  → eventService.emit('taskComplete')
  → taskEventHandler.handle()    # 统一事件处理
      1. _handleSaveSuccessNotification()  # 转存成功通知
      2. _handleAutoRename()               # AI/TMDB 重命名
      3. _handleStrmGeneration()           # STRM 生成
      4. _handleMediaScraping()            # TMDB 刮削
      5. _handleEmbyNotification()         # Emby 入库通知
```

### CAS 秒传流程
```
.cas 元数据 → 家庭空间秒传 → 家庭到个人转存 → 清理中转目录 → 重命名
```

### SmartStrm Webhook 触发
- 只处理包含 `📁` 路径的消息
- 重命名完成/失败/异常时触发
- 占位符：`{savePath}` 从 `📁 /xxx` 提取，`{videoType}` 从 `🎬 movie/tv` 提取

## TMDB 匹配优先级

1. 手动绑定 TMDB (Web/TG/企微)
2. 任务已有 `tmdbId + videoType`
3. 任务名中的 `{tmdb-xxx}` 提取
4. TMDB 搜索 (中英文)
5. 正则/AI 重命名兜底

## API 认证

所有 `/api/*` 接口需要 Session 登录或请求头携带 `x-api-key`。

## 注意事项

- `data/` 包含 SQLite 数据库、配置、Session，必须持久化
- `strm/` 是 STRM 输出目录
- 家庭中转目录会被清空，必须使用专用临时目录
- 默认登录 admin/admin，部署后需修改
