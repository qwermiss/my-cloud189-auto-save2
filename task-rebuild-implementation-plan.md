# 未识别影视自动重建任务 - 完整实施方案

## 📋 一、功能需求详解

### 1.1 业务场景

**场景描述：**
```
用户通过 AI 助手发送分享链接
  ↓
AI 自动创建任务并执行转存
  ↓
任务名称："未识别资源" 或 "Share_20260508_ABC123"
  ↓
AI 重命名时成功识别 TMDB 信息
  ↓
发现影视名称："进击的巨人 S4 (2023)"
  ↓
【问题】原任务名称不规范，路径混乱
【需求】创建规范化任务，自动整理
```

**期望流程：**
```
原任务: "未识别资源123"
  路径: /media/未识别资源123/
  
↓ 自动重建

新任务: "进击的巨人 S4 (2023)"
  路径: /media/电视剧/进击的巨人 S4 (2023)/
  TMDB: ID=12345, Title="Attack on Titan"
  
↓ 清理原任务

删除原任务及其网盘文件
```

### 1.2 核心价值

1. **自动化整理**：无需手动干预，自动规范化任务
2. **路径规范化**：统一媒体库目录结构
3. **TMDB 标准化**：确保所有任务都有 TMDB 信息
4. **减少重复劳动**：避免用户手动重建任务

---

## 🗄️ 二、数据库设计

### 2.1 新增字段

**文件：`src/entities/Task.js`**

```javascript
// 在 Task 实体类中添加以下字段

@Column({ type: 'boolean', default: false })
isRebuiltTask;              // 标记：是否为重建任务（重建的任务永不触发重建）

@Column({ type: 'int', nullable: true })
rebuildFromTaskId;          // 来源：原始任务ID（用于追溯和循环检测）

@Column({ type: 'int', default: 0 })
rebuildCount;               // 计数：已重建次数（防止无限重建）

@Column({ type: 'datetime', nullable: true })
lastRebuildTime;            // 时间：上次重建时间（防抖机制）
```

### 2.2 数据库迁移

**创建迁移文件：`src/migrations/XXXX-add-rebuild-fields.js`**

```javascript
const { MigrationInterface, QueryRunner } = require('typeorm');

module.exports = class AddRebuildFields1746672000000 {
    async up(queryRunner) {
        // 添加 isRebuiltTask 字段
        await queryRunner.query(`
            ALTER TABLE task 
            ADD COLUMN isRebuiltTask BOOLEAN DEFAULT FALSE
        `);
        
        // 添加 rebuildFromTaskId 字段
        await queryRunner.query(`
            ALTER TABLE task 
            ADD COLUMN rebuildFromTaskId INTEGER NULL
        `);
        
        // 添加 rebuildCount 字段
        await queryRunner.query(`
            ALTER TABLE task 
            ADD COLUMN rebuildCount INTEGER DEFAULT 0
        `);
        
        // 添加 lastRebuildTime 字段
        await queryRunner.query(`
            ALTER TABLE task 
            ADD COLUMN lastRebuildTime DATETIME NULL
        `);
        
        // 添加外键约束（可选）
        await queryRunner.query(`
            ALTER TABLE task 
            ADD CONSTRAINT FK_rebuild_from_task 
            FOREIGN KEY (rebuildFromTaskId) 
            REFERENCES task(id) 
            ON DELETE SET NULL
        `);
        
        console.log('✅ 重建任务字段添加成功');
    }
    
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE task DROP FOREIGN KEY FK_rebuild_from_task`);
        await queryRunner.query(`ALTER TABLE task DROP COLUMN lastRebuildTime`);
        await queryRunner.query(`ALTER TABLE task DROP COLUMN rebuildCount`);
        await queryRunner.query(`ALTER TABLE task DROP COLUMN rebuildFromTaskId`);
        await queryRunner.query(`ALTER TABLE task DROP COLUMN isRebuiltTask`);
    }
};
```

---

## ⚙️ 三、配置项设计

### 3.1 配置结构

**文件：`data/config.json`**

```json
{
  "task": {
    "autoRebuildUnidentifiedTask": true,
    "autoRebuildMaxCount": 1,
    "autoRebuildMinInterval": 600000,
    "autoRebuildDeleteOriginal": true,
    "autoRebuildNotifyUser": true,
    "autoRebuildPathTemplate": {
      "tv": "/media/电视剧/{title} ({year})",
      "movie": "/media/电影/{title} ({year})"
    }
  }
}
```

### 3.2 配置说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `autoRebuildUnidentifiedTask` | boolean | true | 功能总开关 |
| `autoRebuildMaxCount` | int | 1 | 最大重建次数（防止无限循环） |
| `autoRebuildMinInterval` | ms | 600000 | 最小重建间隔（10分钟，防抖） |
| `autoRebuildDeleteOriginal` | boolean | true | 是否删除原任务 |
| `autoRebuildNotifyUser` | boolean | true | 是否发送通知 |
| `autoRebuildPathTemplate` | object | {...} | 路径模板（支持变量替换） |

---

## 🧠 四、核心逻辑实现

### 4.1 重建检测服务

**文件：`src/services/TaskRebuildService.js`**

```javascript
const ConfigService = require('./ConfigService');
const { logTaskEvent } = require('../utils/logUtils');

class TaskRebuildService {
    constructor(taskService, taskRepo) {
        this.taskService = taskService;
        this.taskRepo = taskRepo;
    }
    
    /**
     * 判断是否需要重建任务
     * @param {Task} task - 原始任务
     * @param {Object} tmdbResult - TMDB 识别结果
     * @returns {Object} { should: boolean, reason: string, config: object }
     */
    async shouldRebuildTask(task, tmdbResult) {
        // ========== 配置加载 ==========
        const config = {
            enabled: ConfigService.getConfigValue('task.autoRebuildUnidentifiedTask'),
            maxCount: ConfigService.getConfigValue('task.autoRebuildMaxCount') || 1,
            minInterval: ConfigService.getConfigValue('task.autoRebuildMinInterval') || 600000,
            deleteOriginal: ConfigService.getConfigValue('task.autoRebuildDeleteOriginal'),
            notifyUser: ConfigService.getConfigValue('task.autoRebuildNotifyUser')
        };
        
        // ========== 条件 0: 功能开关 ==========
        if (!config.enabled) {
            return { should: false, reason: '功能未启用', config };
        }
        
        // ========== 条件 1: 重建任务标记（强制终止） ==========
        if (task.isRebuiltTask === true) {
            logTaskEvent(`[智能重建] ⛔ 终止：该任务已是重建任务 (ID: ${task.id})`);
            return { should: false, reason: '已是重建任务', config };
        }
        
        // ========== 条件 2: 重建次数限制 ==========
        const rebuildCount = task.rebuildCount || 0;
        if (rebuildCount >= config.maxCount) {
            logTaskEvent(`[智能重建] ⛔ 终止：已达到重建次数上限 (${rebuildCount}/${config.maxCount})`);
            return { should: false, reason: `已达重建上限 ${rebuildCount}次`, config };
        }
        
        // ========== 条件 3: TMDB 信息有效性 ==========
        if (!tmdbResult || !tmdbResult.id || !tmdbResult.title) {
            logTaskEvent(`[智能重建] ⛔ 终止：TMDB 信息无效`);
            return { should: false, reason: 'TMDB 信息无效', config };
        }
        
        // ========== 条件 4: 名称一致性检查 ==========
        const normalizedTaskName = this._normalizeName(task.resourceName);
        const normalizedTmdbName = this._normalizeName(tmdbResult.title);
        
        if (normalizedTaskName === normalizedTmdbName) {
            logTaskEvent(`[智能重建] ℹ️ 跳过：任务名称已匹配 ("${task.resourceName}" === "${tmdbResult.title}")`);
            return { should: false, reason: '名称已一致', config };
        }
        
        // ========== 条件 5: TMDB ID 一致性检查 ==========
        if (task.tmdbId && task.tmdbId === tmdbResult.id) {
            logTaskEvent(`[智能重建] ℹ️ 跳过：TMDB ID 已一致 (${task.tmdbId})`);
            return { should: false, reason: 'TMDB ID 已一致', config };
        }
        
        // ========== 条件 6: 时间间隔防抖 ==========
        if (task.lastRebuildTime) {
            const elapsed = Date.now() - new Date(task.lastRebuildTime).getTime();
            if (elapsed < config.minInterval) {
                const waitTime = Math.ceil((config.minInterval - elapsed) / 1000);
                logTaskEvent(`[智能重建] ℹ️ 跳过：间隔过短，还需等待 ${waitTime}秒`);
                return { should: false, reason: `间隔过短，等待${waitTime}秒`, config };
            }
        }
        
        // ========== 条件 7: 循环引用检测（安全保证） ==========
        if (task.rebuildFromTaskId) {
            const hasLoop = await this._detectRebuildLoop(task.rebuildFromTaskId, task.id);
            if (hasLoop) {
                logTaskEvent(`[智能重建] ⛔ 终止：检测到循环引用！`);
                return { should: false, reason: '检测到循环引用', config };
            }
        }
        
        // ========== 通过所有检查，可以重建 ==========
        logTaskEvent(`[智能重建] ✅ 通过所有检查，可以重建任务`);
        
        return {
            should: true,
            reason: '满足重建条件',
            config,
            details: {
                originalName: task.resourceName,
                tmdbName: tmdbResult.title,
                tmdbId: tmdbResult.id,
                rebuildCount: rebuildCount + 1
            }
        };
    }
    
    /**
     * 执行任务重建
     * @param {Object} params - 重建参数
     */
    async rebuildTask(params) {
        const { originalTask, tmdbInfo, deleteOriginal, notifyUser } = params;
        
        logTaskEvent(`[智能重建] ========== 开始重建任务 ==========`);
        logTaskEvent(`  原任务 ID: ${originalTask.id}`);
        logTaskEvent(`  原任务名称: "${originalTask.resourceName}"`);
        logTaskEvent(`  TMDB 标题: "${tmdbInfo.title}"`);
        logTaskEvent(`  TMDB ID: ${tmdbInfo.id}`);
        logTaskEvent(`  TMDB 类型: ${tmdbInfo.type || 'tv'}`);
        
        try {
            // ========== 步骤 1: 构建新任务信息 ==========
            const newTaskInfo = this._buildNewTaskInfo(originalTask, tmdbInfo);
            
            logTaskEvent(`  新任务名称: "${newTaskInfo.resourceName}"`);
            logTaskEvent(`  新保存路径: "${newTaskInfo.targetFolder}"`);
            
            // ========== 步骤 2: 创建新任务 ==========
            const newTask = await this.taskService.createTask({
                accountId: originalTask.accountId,
                shareLink: originalTask.shareLink,
                accessCode: originalTask.accessCode,
                resourceName: newTaskInfo.resourceName,
                targetFolder: newTaskInfo.targetFolder,
                videoType: newTaskInfo.videoType,
                tmdbId: tmdbInfo.id,
                tmdbTitle: tmdbInfo.title,
                tmdbYear: tmdbInfo.year,
                
                // 【关键】标记为重建任务
                isRebuiltTask: true,
                rebuildFromTaskId: originalTask.id,
                rebuildCount: (originalTask.rebuildCount || 0) + 1,
                lastRebuildTime: new Date(),
                
                // 继承其他配置
                enableCron: false,  // 新任务不启用定时
                skipDeletion: false
            });
            
            logTaskEvent(`[智能重建] ✅ 新任务已创建: ID=${newTask.id}`);
            
            // ========== 步骤 3: 发送通知 ==========
            if (notifyUser && this.taskService.messageUtil) {
                await this._sendRebuildNotification({
                    originalTask,
                    newTask,
                    tmdbInfo,
                    deleteOriginal
                });
            }
            
            // ========== 步骤 4: 自动执行新任务 ==========
            logTaskEvent(`[智能重建] 🚀 开始执行新任务...`);
            const executeResult = await this.taskService.processTask(newTask);
            
            if (!executeResult) {
                logTaskEvent(`[智能重建] ⚠️ 新任务执行失败，保留原任务`);
                return { success: false, reason: '新任务执行失败' };
            }
            
            logTaskEvent(`[智能重建] ✅ 新任务执行完成`);
            
            // ========== 步骤 5: 删除原任务（如果配置允许） ==========
            if (deleteOriginal) {
                logTaskEvent(`[智能重建] 🗑️ 删除原任务及网盘文件...`);
                
                // 删除原任务及其网盘文件
                await this.taskService.deleteTask(originalTask.id, true);
                
                logTaskEvent(`[智能重建] ✅ 原任务已删除（包含网盘文件）`);
            } else {
                // 仅更新原任务状态
                await this.taskService.updateTask(originalTask.id, {
                    rebuildCount: (originalTask.rebuildCount || 0) + 1,
                    lastRebuildTime: new Date()
                });
                
                logTaskEvent(`[智能重建] ℹ️ 原任务已保留，更新重建计数`);
            }
            
            logTaskEvent(`[智能重建] ========== 重建完成 ==========`);
            
            return {
                success: true,
                newTaskId: newTask.id,
                originalTaskId: originalTask.id,
                deleted: deleteOriginal
            };
            
        } catch (error) {
            logTaskEvent(`[智能重建] ❌ 重建失败: ${error.message}`);
            console.error('[智能重建] 详细错误:', error);
            
            return {
                success: false,
                reason: error.message,
                error
            };
        }
    }
    
    /**
     * 构建新任务信息
     */
    _buildNewTaskInfo(originalTask, tmdbInfo) {
        // 1. 构建任务名称
        const year = tmdbInfo.year ? ` (${tmdbInfo.year})` : '';
        const resourceName = `${tmdbInfo.title}${year}`;
        
        // 2. 构建保存路径
        const videoType = tmdbInfo.type || 'tv';
        const pathTemplate = ConfigService.getConfigValue('task.autoRebuildPathTemplate');
        
        let targetFolder;
        if (pathTemplate && pathTemplate[videoType]) {
            // 使用模板
            targetFolder = pathTemplate[videoType]
                .replace('{title}', tmdbInfo.title)
                .replace('{year}', tmdbInfo.year || '');
        } else {
            // 默认路径
            const typeDir = videoType === 'movie' ? '电影' : '电视剧';
            const baseDir = originalTask.account?.localStrmPrefix || '/media';
            targetFolder = `${baseDir}/${typeDir}/${resourceName}`;
        }
        
        return {
            resourceName,
            targetFolder,
            videoType
        };
    }
    
    /**
     * 发送重建通知
     */
    async _sendRebuildNotification(params) {
        const { originalTask, newTask, tmdbInfo, deleteOriginal } = params;
        
        const content = 
            `✅ 任务重建成功\n\n` +
            `📦 原任务: ${originalTask.resourceName}\n` +
            `   ID: ${originalTask.id}\n\n` +
            `🎬 新任务: ${newTask.resourceName}\n` +
            `   ID: ${newTask.id}\n` +
            `   TMDB: ${tmdbInfo.title} (ID: ${tmdbInfo.id})\n` +
            `   类型: ${tmdbInfo.type === 'movie' ? '电影' : '电视剧'}\n\n` +
            `📁 新路径: ${newTask.targetFolder}\n\n` +
            `🗑️ 删除原任务: ${deleteOriginal ? '是' : '否'}`;
        
        await this.taskService.messageUtil.sendMessage({
            title: '🤖 智能任务重建',
            content
        });
    }
    
    /**
     * 检测循环引用（递归检测链条）
     */
    async _detectRebuildLoop(parentId, currentId, visited = new Set()) {
        // 如果找到自己，说明有循环
        if (parentId === currentId) {
            return true;
        }
        
        // 如果已经访问过，说明无循环
        if (visited.has(parentId)) {
            return false;
        }
        
        visited.add(parentId);
        
        // 查找父任务的来源
        const parentTask = await this.taskRepo.findOneBy({ id: parentId });
        if (!parentTask || !parentTask.rebuildFromTaskId) {
            return false;  // 到达链头，无循环
        }
        
        // 递归检测
        return this._detectRebuildLoop(parentTask.rebuildFromTaskId, currentId, visited);
    }
    
    /**
     * 标准化名称（去除年份、空格等）
     */
    _normalizeName(name) {
        if (!name) return '';
        return name
            .replace(/\s*\(\d{4}\)$/, '')  // 去除年份 (2023)
            .replace(/\s+/g, ' ')          // 合并空格
            .trim()
            .toLowerCase();                // 转小写比较
    }
}

module.exports = TaskRebuildService;
```

### 4.2 集成到任务事件处理器

**文件：`src/services/taskEventHandler.js`**

```javascript
const TaskRebuildService = require('./TaskRebuildService');

class TaskEventHandler {
    constructor(messageUtil) {
        this.messageUtil = messageUtil;
        this.rebuildService = null;  // 延迟初始化
    }
    
    async handle(taskCompleteEventDto) {
        if (taskCompleteEventDto.fileList.length === 0) {
            return;
        }
        
        const task = taskCompleteEventDto.task;
        const taskRepo = taskCompleteEventDto.taskRepo;
        const taskService = taskCompleteEventDto.taskService;
        
        logTaskEvent(` ${task.resourceName} 触发事件:`);
        
        try {
            // 1. AI 自动重命名
            const renameResult = await this._handleAutoRename(taskCompleteEventDto);
            
            // 2. 【新增】检测并重建任务
            if (renameResult && renameResult.tmdbInfo) {
                await this._handleTaskRebuild({
                    task,
                    tmdbInfo: renameResult.tmdbInfo,
                    taskService,
                    taskRepo
                });
            }
            
            // 3. 其他事件处理
            await this._handleLatestSavedDisplay(taskCompleteEventDto);
            await this._handleStrmGeneration(taskCompleteEventDto);
            await this._handleAlistCache(taskCompleteEventDto);
            await this._handleMediaScraping(taskCompleteEventDto);
            this._handleEmbyNotification(taskCompleteEventDto);
            
        } catch (error) {
            console.error(error);
            logTaskEvent(`任务完成后处理失败: ${error.message}`);
        }
        
        logTaskEvent(`================事件处理完成================`);
        
        // 恢复任务状态
        if (taskRepo && task.status === 'processing') {
            task.status = 'pending';
            await taskRepo.save(task);
            logTaskEvent(`任务状态已恢复为 pending`);
        }
    }
    
    /**
     * 处理任务重建
     */
    async _handleTaskRebuild(params) {
        const { task, tmdbInfo, taskService, taskRepo } = params;
        
        // 初始化重建服务（延迟初始化）
        if (!this.rebuildService) {
            this.rebuildService = new TaskRebuildService(taskService, taskRepo);
        }
        
        // 检查是否需要重建
        const checkResult = await this.rebuildService.shouldRebuildTask(task, tmdbInfo);
        
        if (!checkResult.should) {
            logTaskEvent(`[智能重建] 跳过重建: ${checkResult.reason}`);
            return;
        }
        
        // 执行重建
        const rebuildResult = await this.rebuildService.rebuildTask({
            originalTask: task,
            tmdbInfo,
            deleteOriginal: checkResult.config.deleteOriginal,
            notifyUser: checkResult.config.notifyUser
        });
        
        if (rebuildResult.success) {
            logTaskEvent(`[智能重建] ✅ 重建成功: 新任务ID=${rebuildResult.newTaskId}`);
        } else {
            logTaskEvent(`[智能重建] ❌ 重建失败: ${rebuildResult.reason}`);
        }
        
        return rebuildResult;
    }
    
    // ... 其他方法保持不变
}
```

---

## 📝 五、实现步骤

### 5.1 Phase 1：数据库准备（必须先执行）

```bash
# 1. 添加数据库字段
创建迁移文件: src/migrations/XXXX-add-rebuild-fields.js

# 2. 执行迁移
yarn migration:run

# 3. 验证字段
sqlite> .schema task
# 确认包含：
# - isRebuiltTask BOOLEAN DEFAULT FALSE
# - rebuildFromTaskId INTEGER
# - rebuildCount INTEGER DEFAULT 0
# - lastRebuildTime DATETIME
```

### 5.2 Phase 2：服务实现

```bash
# 1. 创建重建服务
创建文件: src/services/TaskRebuildService.js

# 2. 修改事件处理器
修改文件: src/services/taskEventHandler.js

# 3. 修改 Task 实体
修改文件: src/entities/Task.js
```

### 5.3 Phase 3：配置和测试

```bash
# 1. 添加配置项
修改文件: data/config.json

# 2. 构建项目
yarn build

# 3. 启动测试
yarn start

# 4. 查看日志
tail -f /tmp/cloud189-app.log | grep "智能重建"
```

---

## 🧪 六、测试场景

### 6.1 正常重建流程

**测试步骤：**
```
1. 通过 AI 发送分享链接（未识别影视）
2. AI 自动创建任务，名称："未识别资源_ABC123"
3. 任务执行，AI 重命名识别为："进击的巨人 S4"
4. 等待任务完成

预期结果：
✅ 自动创建新任务："进击的巨人 S4 (2023)"
✅ 新任务路径："/media/电视剧/进击的巨人 S4 (2023)"
✅ 新任务标记：isRebuiltTask=true
✅ 新任务字段：rebuildFromTaskId=原任务ID
✅ 原任务被删除（含网盘文件）
✅ 收到重建通知
```

**日志验证：**
```bash
[智能重建] ✅ 通过所有检查，可以重建任务
[智能重建] ========== 开始重建任务 ==========
  原任务 ID: 123
  原任务名称: "未识别资源_ABC123"
  TMDB 标题: "Attack on Titan"
  TMDB ID: 1429
  新任务名称: "进击的巨人 S4 (2023)"
  新保存路径: "/media/电视剧/进击的巨人 S4 (2023)"
[智能重建] ✅ 新任务已创建: ID=124
[智能重建] 🚀 开始执行新任务...
[智能重建] ✅ 新任务执行完成
[智能重建] 🗑️ 删除原任务及网盘文件...
[智能重建] ✅ 原任务已删除（包含网盘文件）
[智能重建] ========== 重建完成 ==========
```

### 6.2 终止条件测试

**测试 1：重建任务不再触发**
```
操作: 手动触发重建任务的重建
预期: 
  [智能重建] ⛔ 终止：该任务已是重建任务
  跳过重建
```

**测试 2：重建次数超限**
```
操作: 同一任务触发第2次重建（配置maxCount=1）
预期:
  [智能重建] ⛔ 终止：已达到重建次数上限 (1/1)
  跳过重建
```

**测试 3：名称一致性**
```
操作: 任务名为"进击的巨人 S4"，识别结果也是"进击的巨人 S4"
预期:
  [智能重建] ℹ️ 跳过：任务名称已匹配
  跳过重建
```

**测试 4：时间间隔过短**
```
操作: 10分钟内再次触发重建
预期:
  [智能重建] ℹ️ 跳过：间隔过短，还需等待 320秒
  跳过重建
```

**测试 5：循环引用检测**
```
操作: 手动设置 taskA.rebuildFromTaskId = taskB.id
                       taskB.rebuildFromTaskId = taskA.id
      触发 taskA 的重建
预期:
  [智能重建] ⛔ 终止：检测到循环引用！
  跳过重建
```

---

## 🚨 七、错误处理和回滚

### 7.1 错误场景

| 错误场景 | 处理策略 | 用户提示 |
|---------|---------|---------|
| 新任务创建失败 | 保留原任务，记录错误 | "重建失败，原任务已保留" |
| 新任务执行失败 | 保留原任务，不删除 | "新任务执行失败，原任务已保留" |
| 删除原任务失败 | 新任务已创建，仅记录警告 | "新任务已创建，但原任务删除失败" |
| TMDB 信息无效 | 跳过重建，继续正常流程 | 无提示（自动跳过） |
| 循环引用检测 | 终止重建，记录告警 | 系统日志记录 |

### 7.2 回滚机制

```javascript
async rebuildTask(params) {
    const { originalTask, tmdbInfo } = params;
    
    let newTask = null;
    
    try {
        // 创建新任务
        newTask = await this.taskService.createTask(...);
        
        // 执行新任务
        const executeResult = await this.taskService.processTask(newTask);
        
        if (!executeResult) {
            // 【回滚】删除新任务，保留原任务
            await this.taskService.deleteTask(newTask.id, true);
            throw new Error('新任务执行失败');
        }
        
        // 删除原任务
        await this.taskService.deleteTask(originalTask.id, true);
        
        return { success: true };
        
    } catch (error) {
        // 【回滚】如果新任务已创建但失败，尝试清理
        if (newTask) {
            try {
                await this.taskService.deleteTask(newTask.id, true);
                logTaskEvent(`[智能重建] 🔄 已回滚：删除创建的新任务`);
            } catch (rollbackError) {
                logTaskEvent(`[智能重建] ⚠️ 回滚失败: ${rollbackError.message}`);
            }
        }
        
        throw error;
    }
}
```

---

## 📊 八、监控和日志

### 8.1 关键日志点

```javascript
// 1. 检查阶段
logTaskEvent(`[智能重建] 检查任务 ${task.id} 是否需要重建...`);

// 2. 终止条件
logTaskEvent(`[智能重建] ⛔ 终止：${reason}`);

// 3. 开始重建
logTaskEvent(`[智能重建] ========== 开始重建任务 ==========`);

// 4. 详细信息
logTaskEvent(`  字段名: 值`);

// 5. 步骤完成
logTaskEvent(`[智能重建] ✅ 步骤描述`);

// 6. 错误
logTaskEvent(`[智能重建] ❌ 错误描述: ${error.message}`);

// 7. 回滚
logTaskEvent(`[智能重建] 🔄 回滚操作`);

// 8. 完成
logTaskEvent(`[智能重建] ========== 重建完成 ==========`);
```

### 8.2 统计指标

```javascript
// 建议添加到系统统计
{
  "rebuildStats": {
    "totalAttempts": 123,        // 总重建尝试次数
    "successCount": 100,         // 成功次数
    "failedCount": 23,           // 失败次数
    "skippedCount": 50,          // 跳过次数
    "loopDetected": 2            // 检测到循环次数
  }
}
```

---

## ✅ 九、验收标准

### 9.1 功能验收

- [ ] 未识别任务能自动触发重建
- [ ] 新任务名称和路径正确
- [ ] 新任务标记字段正确（isRebuiltTask=true）
- [ ] 原任务能正确删除（含网盘文件）
- [ ] 收到重建通知

### 9.2 安全验收

- [ ] 重建任务永不触发重建（终止条件1）
- [ ] 重建次数超限能正确终止（终止条件2）
- [ ] 循环引用能正确检测（终止条件7）
- [ ] 时间间隔能正确防抖（终止条件6）

### 9.3 异常验收

- [ ] TMDB 信息无效时跳过
- [ ] 新任务创建失败时保留原任务
- [ ] 新任务执行失败时回滚
- [ ] 所有错误有详细日志

### 9.4 性能验收

- [ ] 不影响正常任务流程
- [ ] 异步执行不阻塞
- [ ] 内存无泄漏

---

## 📦 十、交付清单

### 10.1 代码文件

```
新增：
  src/services/TaskRebuildService.js         # 重建服务（核心逻辑）
  src/migrations/XXXX-add-rebuild-fields.js  # 数据库迁移

修改：
  src/entities/Task.js                       # 添加字段定义
  src/services/taskEventHandler.js           # 集成重建逻辑
  data/config.json                           # 添加配置项
```

### 10.2 文档文件

```
新增：
  task-rebuild-termination-conditions.md     # 终止条件设计
  task-rebuild-implementation-plan.md        # 本文档
```

### 10.3 测试文件

```
建议新增：
  test/TaskRebuildService.test.js            # 单元测试
```

---

## 🎯 总结

本方案通过以下设计确保**绝对安全**：

1. **7重终止条件** - 防止永动机
2. **数据库字段标记** - 永久可追溯
3. **循环引用检测** - 数学安全保证
4. **完整错误处理** - 异常情况全覆盖
5. **回滚机制** - 失败可恢复
6. **详细日志** - 问题可定位
7. **灵活配置** - 可按需调整

**推荐实施顺序：**
1. ✅ Phase 1 - 数据库迁移（必须先执行）
2. ✅ Phase 2 - 服务实现
3. ✅ Phase 3 - 配置和测试
4. ✅ 验收测试

**实施周期：** 约 1-2 天
**风险等级：** 🟢 低（有完整的安全保障）
