const TaskService = require('./task');
const ConfigService = require('./ConfigService');

class OperationRecommendation {
    constructor() {
        this.taskService = new TaskService();
    }

    async getRecommendations(context = {}) {
        const recommendations = [];

        const taskStats = await this._getTaskStatistics();
        
        recommendations.push(...await this._analyzeFailedTasks(taskStats));
        recommendations.push(...await this._analyzePendingTasks(taskStats));
        recommendations.push(...await this._analyzeSystemStatus(taskStats));
        recommendations.push(...await this._analyzeOptimizations(taskStats));

        return recommendations.sort((a, b) => b.priority - a.priority);
    }

    async _getTaskStatistics() {
        const allTasks = await this.taskService.getTasks({});
        
        return {
            total: allTasks.length,
            active: allTasks.filter(t => t.status === 'active').length,
            completed: allTasks.filter(t => t.status === 'completed').length,
            failed: allTasks.filter(t => t.status === 'failed').length,
            pending: allTasks.filter(t => t.status === 'pending').length,
            paused: allTasks.filter(t => t.status === 'paused').length
        };
    }

    async _analyzeFailedTasks(stats) {
        const recommendations = [];

        if (stats.failed > 0) {
            recommendations.push({
                type: 'critical',
                priority: 100,
                category: 'failure',
                title: `发现 ${stats.failed} 个失败任务`,
                description: '建议查看失败原因并进行处理',
                actions: [
                    {
                        label: '查看失败任务',
                        intent: 'list_tasks',
                        params: { status: 'failed' }
                    },
                    {
                        label: '诊断所有失败',
                        intent: 'batch_diagnose',
                        params: { filter: { status: 'failed' } }
                    }
                ],
                icon: '⚠️'
            });
        }

        return recommendations;
    }

    async _analyzePendingTasks(stats) {
        const recommendations = [];

        if (stats.pending > 5) {
            recommendations.push({
                type: 'suggestion',
                priority: 70,
                category: 'pending',
                title: `有 ${stats.pending} 个待执行任务`,
                description: '任务队列较长，建议分批执行',
                actions: [
                    {
                        label: '查看待执行任务',
                        intent: 'list_tasks',
                        params: { status: 'pending' }
                    },
                    {
                        label: '批量执行',
                        intent: 'batch_operation',
                        params: { operation: 'execute', filter: { status: 'pending' } }
                    }
                ],
                icon: '📋'
            });
        } else if (stats.pending > 0) {
            recommendations.push({
                type: 'suggestion',
                priority: 60,
                category: 'pending',
                title: `${stats.pending} 个任务等待执行`,
                description: '可以开始执行这些任务',
                actions: [
                    {
                        label: '立即执行',
                        intent: 'batch_operation',
                        params: { operation: 'execute', filter: { status: 'pending' } }
                    }
                ],
                icon: '⏳'
            });
        }

        return recommendations;
    }

    async _analyzeSystemStatus(stats) {
        const recommendations = [];

        const resourceUsage = process.memoryUsage();
        const memoryUsagePercent = (resourceUsage.heapUsed / resourceUsage.heapTotal) * 100;

        if (memoryUsagePercent > 80) {
            recommendations.push({
                type: 'warning',
                priority: 80,
                category: 'system',
                title: '内存使用率较高',
                description: `当前内存使用率 ${memoryUsagePercent.toFixed(1)}%`,
                actions: [
                    {
                        label: '查看系统状态',
                        intent: 'get_system_status',
                        params: {}
                    }
                ],
                icon: '💾',
                details: {
                    heapUsed: `${(resourceUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                    heapTotal: `${(resourceUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`
                }
            });
        }

        if (stats.active > 5) {
            recommendations.push({
                type: 'info',
                priority: 50,
                category: 'system',
                title: `${stats.active} 个任务正在执行`,
                description: '系统负载较高，建议等待部分任务完成',
                icon: '🔄'
            });
        }

        return recommendations;
    }

    async _analyzeOptimizations(stats) {
        const recommendations = [];

        const completionRate = stats.total > 0 
            ? (stats.completed / stats.total * 100).toFixed(1)
            : 0;

        if (stats.total > 10 && completionRate < 70) {
            recommendations.push({
                type: 'suggestion',
                priority: 40,
                category: 'optimization',
                title: '任务成功率偏低',
                description: `当前成功率 ${completionRate}%，建议检查失败原因`,
                actions: [
                    {
                        label: '分析失败原因',
                        intent: 'batch_diagnose',
                        params: {}
                    }
                ],
                icon: '📊'
            });
        }

        const aiEnabled = this._checkAIEnabled();
        if (!aiEnabled) {
            recommendations.push({
                type: 'info',
                priority: 30,
                category: 'optimization',
                title: 'AI功能未启用',
                description: '启用AI可以获得智能重命名、自动识别等功能',
                icon: '🤖'
            });
        }

        return recommendations;
    }

    _checkAIEnabled() {
        const config = ConfigService.getConfigValue('openai');
        return config && config.enable && config.apiKey && config.baseUrl;
    }

    async getContextualRecommendation(userMessage, context = {}) {
        const recommendations = [];

        if (/失败|error|问题|为什么/.test(userMessage)) {
            recommendations.push({
                type: 'contextual',
                priority: 90,
                title: '查看失败任务',
                actions: [
                    {
                        label: '查看所有失败',
                        intent: 'list_tasks',
                        params: { status: 'failed' }
                    }
                ]
            });
        }

        if (/执行|开始|运行/.test(userMessage)) {
            const stats = await this._getTaskStatistics();
            if (stats.pending > 0) {
                recommendations.push({
                    type: 'contextual',
                    priority: 85,
                    title: `有 ${stats.pending} 个待执行任务`,
                    actions: [
                        {
                            label: '批量执行',
                            intent: 'batch_operation',
                            params: { operation: 'execute', filter: { status: 'pending' } }
                        }
                    ]
                });
            }
        }

        if (/状态|监控|系统/.test(userMessage)) {
            recommendations.push({
                type: 'contextual',
                priority: 80,
                title: '查看系统状态',
                actions: [
                    {
                        label: '系统状态',
                        intent: 'get_system_status',
                        params: {}
                    }
                ]
            });
        }

        return recommendations;
    }
}

module.exports = OperationRecommendation;
