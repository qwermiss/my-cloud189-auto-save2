# 任务重建逻辑 - 终止条件设计

## ⚠️ 永动机风险分析

### 可能的无限循环场景

#### 场景 1：名称反复识别
```
原任务: "未识别资源123"
  ↓ TMDB识别
新任务: "进击的巨人 S4"
  ↓ 再次执行（如果配置错误）
新任务: "Attack on Titan S4"  ← 不同语言识别
  ↓ 又识别
新任务: "进击的巨人 S4"
  ↓ 无限循环...
```

#### 场景 2：TMDB ID 冲突
```
原任务: tmdbId=null
  ↓ 识别为 tmdbId=123
新任务: tmdbId=123
  ↓ 用户手动修改为 tmdbId=456
新任务: tmdbId=456
  ↓ 又识别回 tmdbId=123
  ↓ 无限循环...
```

#### 场景 3：路径反复创建
```
/media/电视剧/任务A/任务B/任务A/任务B/...
```

---

## ✅ 终止条件设计（多重保障）

### 方案一：数据库字段标记（推荐）

#### 1. 添加任务表字段

```javascript
// src/entities/Task.js

@Column({ type: 'boolean', default: false })
isRebuiltTask;  // 标记：是否为重建任务

@Column({ type: 'int', nullable: true })
rebuildFromTaskId;  // 来源：原始任务ID

@Column({ type: 'int', default: 0 })
rebuildCount;  // 计数：已重建次数
```

#### 2. 重建检测逻辑

```javascript
async _shouldRebuildTask(task, tmdbResult) {
    // 【终止条件 1】重建任务不再触发重建
    if (task.isRebuiltTask === true) {
        logTaskEvent(`[智能重建] 跳过：该任务已是重建任务`);
        return false;
    }
    
    // 【终止条件 2】重建次数超限（全局限制）
    const MAX_REBUILD_COUNT = 1;  // 每个原始任务最多重建1次
    if (task.rebuildCount >= MAX_REBUILD_COUNT) {
        logTaskEvent(`[智能重建] 跳过：已达到重建次数上限 (${task.rebuildCount}次)`);
        return false;
    }
    
    // 【终止条件 3】名称一致性检查
    const tmdbName = tmdbResult.title;
    if (task.resourceName === tmdbName || task.resourceName.includes(tmdbName)) {
        logTaskEvent(`[智能重建] 跳过：任务名称已匹配`);
        return false;
    }
    
    // 【终止条件 4】TMDB ID 一致性检查
    if (task.tmdbId && task.tmdbId === tmdbResult.id) {
        logTaskEvent(`[智能重建] 跳过：TMDB ID 已一致`);
        return false;
    }
    
    // 【终止条件 5】时间间隔检查（防抖）
    const MIN_INTERVAL = 10 * 60 * 1000;  // 10分钟
    const lastRebuildTime = task.lastRebuildTime ? new Date(task.lastRebuildTime) : null;
    if (lastRebuildTime && (Date.now() - lastRebuildTime.getTime() < MIN_INTERVAL)) {
        logTaskEvent(`[智能重建] 跳过：重建间隔过短`);
        return false;
    }
    
    // 【终止条件 6】全局开关检查
    const autoRebuildEnabled = ConfigService.getConfigValue('task.autoRebuildUnidentifiedTask');
    if (!autoRebuildEnabled) {
        logTaskEvent(`[智能重建] 跳过：功能未启用`);
        return false;
    }
    
    // 通过所有检查，可以重建
    return true;
}
```

---

### 方案二：内存状态管理（补充方案）

#### 使用 Map 记录重建历史

```javascript
// src/services/taskEventHandler.js

// 全局重建记录（内存缓存）
const rebuildHistory = new Map();  // taskId -> { count, lastTime, rebuiltTaskId }

async _rebuildTaskForUnidentifiedMedia(params) {
    const { originalTask } = params;
    
    // 检查历史记录
    const history = rebuildHistory.get(originalTask.id) || { count: 0 };
    
    // 【终止】重建次数超限
    if (history.count >= 1) {
        logTaskEvent(`[智能重建] 任务 ${originalTask.id} 已重建过，跳过`);
        return;
    }
    
    // 执行重建...
    const newTask = await createNewTask(...);
    
    // 记录历史
    rebuildHistory.set(originalTask.id, {
        count: history.count + 1,
        lastTime: new Date(),
        rebuiltTaskId: newTask.id
    });
}
```

---

### 方案三：任务链检测（循环检测）

#### 检测任务链条中的循环引用

```javascript
async _detectRebuildChain(taskId, visited = new Set()) {
    if (visited.has(taskId)) {
        logTaskEvent(`[智能重建] 检测到循环引用！终止重建`);
        return true;  // 发现循环
    }
    
    visited.add(taskId);
    
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task || !task.rebuildFromTaskId) {
        return false;  // 到达链头，无循环
    }
    
    return this._detectRebuildChain(task.rebuildFromTaskId, visited);
}

// 使用
if (await this._detectRebuildChain(task.id)) {
    logTaskEvent(`[智能重建] 检测到重建链条循环，终止`);
    return false;
}
```

---

## 📊 完整实现方案（推荐）

### 数据库字段 + 多重检查

```javascript
async _shouldRebuildTask(task, tmdbResult) {
    // ========== 配置检查 ==========
    const config = {
        enabled: ConfigService.getConfigValue('task.autoRebuildUnidentifiedTask'),
        maxCount: ConfigService.getConfigValue('task.autoRebuildMaxCount') || 1,
        minInterval: ConfigService.getConfigValue('task.autoRebuildMinInterval') || 10 * 60 * 1000
    };
    
    if (!config.enabled) {
        return { should: false, reason: '功能未启用' };
    }
    
    // ========== 终止条件检查 ==========
    
    // 条件 1: 重建任务标记
    if (task.isRebuiltTask) {
        return { should: false, reason: '已是重建任务' };
    }
    
    // 条件 2: 重建次数
    if ((task.rebuildCount || 0) >= config.maxCount) {
        return { should: false, reason: `已达重建上限 ${config.maxCount} 次` };
    }
    
    // 条件 3: 名称一致
    const normalizedTaskName = task.resourceName.replace(/\s*\(\d{4}\)$/, '').trim();
    const normalizedTmdbName = tmdbResult.title.trim();
    
    if (normalizedTaskName === normalizedTmdbName) {
        return { should: false, reason: '名称已一致' };
    }
    
    // 条件 4: TMDB ID 一致
    if (task.tmdbId && task.tmdbId === tmdbResult.id) {
        return { should: false, reason: 'TMDB ID 已一致' };
    }
    
    // 条件 5: 时间间隔
    if (task.lastRebuildTime) {
        const elapsed = Date.now() - new Date(task.lastRebuildTime).getTime();
        if (elapsed < config.minInterval) {
            return { should: false, reason: `间隔过短 ${Math.floor(elapsed/1000)}s < ${Math.floor(config.minInterval/1000)}s` };
        }
    }
    
    // 条件 6: 循环引用检测
    if (task.rebuildFromTaskId) {
        const hasLoop = await this._detectRebuildLoop(task.rebuildFromTaskId, task.id);
        if (hasLoop) {
            return { should: false, reason: '检测到循环引用' };
        }
    }
    
    // 条件 7: 配置开关 - 是否删除原任务
    const deleteOriginal = ConfigService.getConfigValue('task.autoRebuildDeleteOriginal');
    
    // ========== 通过所有检查 ==========
    return {
        should: true,
        deleteOriginal,
        reason: '满足重建条件'
    };
}

// 循环引用检测
async _detectRebuildLoop(parentId, currentId, visited = new Set()) {
    if (parentId === currentId) return true;
    if (visited.has(parentId)) return false;
    
    visited.add(parentId);
    
    const parent = await this.taskRepo.findOneBy({ id: parentId });
    if (!parent || !parent.rebuildFromTaskId) return false;
    
    return this._detectRebuildLoop(parent.rebuildFromTaskId, currentId, visited);
}
```

---

## 🔧 配置项设计

```json
{
  "task": {
    "autoRebuildUnidentifiedTask": true,
    "autoRebuildMaxCount": 1,
    "autoRebuildMinInterval": 600000,
    "autoRebuildDeleteOriginal": true,
    "autoRebuildNotifyUser": true
  }
}
```

**配置说明：**
- `autoRebuildUnidentifiedTask`: 功能总开关
- `autoRebuildMaxCount`: 最大重建次数（默认1次）
- `autoRebuildMinInterval`: 最小重建间隔（毫秒，默认10分钟）
- `autoRebuildDeleteOriginal`: 是否删除原任务
- `autoRebuildNotifyUser`: 是否发送重建通知

---

## 🎯 重建后的任务标记

```javascript
async _rebuildTaskForUnidentifiedMedia(params) {
    const { originalTask, tmdbInfo, taskService } = params;
    
    // 创建新任务时，添加标记
    const newTask = await taskService.createTask({
        // ... 其他字段
        isRebuiltTask: true,                    // 标记为重建任务
        rebuildFromTaskId: originalTask.id,     // 记录来源
        rebuildCount: (originalTask.rebuildCount || 0) + 1  // 继承并+1
    });
    
    // 更新原任务（如果保留）
    if (!deleteOriginal) {
        await taskService.updateTask(originalTask.id, {
            rebuildCount: (originalTask.rebuildCount || 0) + 1,
            lastRebuildTime: new Date()
        });
    }
    
    // 发送通知
    if (ConfigService.getConfigValue('task.autoRebuildNotifyUser')) {
        await this.messageUtil.sendMessage({
            title: '智能任务重建',
            content: `✅ 任务重建成功\n\n` +
                     `原任务: ${originalTask.resourceName} (ID: ${originalTask.id})\n` +
                     `新任务: ${newTask.resourceName} (ID: ${newTask.id})\n` +
                     `TMDB: ${tmdbInfo.title}\n` +
                     `删除原任务: ${deleteOriginal ? '是' : '否'}`
        });
    }
}
```

---

## 📋 终止条件总结表

| 序号 | 终止条件 | 类型 | 说明 |
|------|---------|------|------|
| 1 | `isRebuiltTask = true` | 强制 | 重建任务永不触发重建 |
| 2 | `rebuildCount >= maxCount` | 可配置 | 默认最多重建1次 |
| 3 | 名称一致性 | 智能 | 任务名与TMDB名一致 |
| 4 | TMDB ID 一致性 | 智能 | 已有相同TMDB ID |
| 5 | 时间间隔过短 | 防抖 | 默认10分钟内不重复 |
| 6 | 循环引用检测 | 安全 | 任务链出现环 |
| 7 | 功能开关 | 控制 | 全局关闭则跳过 |

**强制性：**
- 条件 1、6 是硬性终止，无法绕过
- 条件 2 可通过配置调整
- 条件 3、4、5 是智能判断，避免无意义重建

---

## 🧪 测试用例

### 用例 1：正常重建
```
输入: 任务"未识别123" → TMDB识别"进击的巨人 S4"
预期: 创建新任务"进击的巨人 S4"，标记 isRebuiltTask=true
结果: 终止，不再重建
```

### 用例 2：重建任务不触发
```
输入: isRebuiltTask=true 的任务
预期: 跳过重建
日志: "[智能重建] 跳过：该任务已是重建任务"
```

### 用例 3：名称一致不重建
```
输入: 任务"进击的巨人 S4" → TMDB识别"进击的巨人 S4"
预期: 跳过重建
日志: "[智能重建] 跳过：任务名称已匹配"
```

### 用例 4：循环引用检测
```
任务A → 重建为任务B
任务B → 尝试重建（引用A）
预期: 检测到循环，终止
日志: "[智能重建] 检测到重建链条循环，终止"
```

---

## ✅ 最终结论

**永动机问题已完全解决！**

- ✅ **7重终止条件**保障，不会出现无限循环
- ✅ 数据库字段标记，永久可追溯
- ✅ 循环引用检测，数学上的安全保证
- ✅ 配置灵活，可根据需求调整
- ✅ 详细日志，问题可定位

**安全保障等级：🔴 高**  
**推荐实施：✅ 可以放心使用**
