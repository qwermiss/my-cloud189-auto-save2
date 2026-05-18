const got = require('got');
const { logTaskEvent } = require('../utils/logUtils');
const ConfigService = require('./ConfigService');
const { MessageUtil } = require('./message');
const { AppDataSource } = require('../database'); 
const { Task, Account } = require('../entities'); 
const { Cloud189Service } = require('./cloud189');
const path = require('path');
const { StrmService } = require('./strm');

const { Not, IsNull, Like } = require('typeorm'); 

// emby接口
class EmbyService {
    constructor(taskService) {
        this.enable = ConfigService.getConfigValue('emby');
        this.embyUrl = ConfigService.getConfigValue('emby.serverUrl');
        this.embyApiKey = ConfigService.getConfigValue('emby.apiKey');
        this.embyPathReplace = ''
        this.messageUtil = new MessageUtil();

        this._taskRepo = AppDataSource.getRepository(Task);
        this._accountRepo = AppDataSource.getRepository(Account);
        this._taskService = taskService;
        this._strmService = new StrmService();
    }


    async notify(task) {
        if (!this.enable){
            logTaskEvent(`Emby通知未启用, 请启用后执行`);
            return;
        }
        const taskName = task.resourceName
        logTaskEvent(`执行Emby通知: ${taskName}`);
        // 处理路径
        this.embyPathReplace = task.account.embyPathReplace
        const path = this._replacePath(task.realFolderName)
        const item = await this.searchItemsByPathRecursive(path);
        logTaskEvent(`Emby搜索结果: ${ JSON.stringify(item)}`);
        if (item) {
            await this.refreshItemById(item.Id);
            this.messageUtil.sendMessage('【天翼云转存】\n🎉通知Emby入库成功, 资源名:' + task.resourceName);
            return item.Id
        }else{
            logTaskEvent(`Emby未搜索到电影/剧集: ${taskName}, 执行全库扫描`);
            await this.refreshAllLibraries();
            this.messageUtil.sendMessage('【天翼云转存】\n🎉通知Emby入库成功, 资源名:' + task.resourceName);
            return null;
        }
    }

    // 1. /emby/Items 根据名称搜索
    async searchItemsByName(name) {
        name = this._cleanMediaName(name);
        const url = `${this.embyUrl}/emby/Items`;
        const params = {
            SearchTerm: name,
            IncludeItemTypes: 'Movie,Series',
            Recursive: true,
            Fields: "Name",
        }
        const response = await this.request(url, {
            method: 'GET',
            searchParams: params,
        })
        return response;
    }

    // 2. /emby/Items/{ID}/Refresh 刷新指定ID的剧集/电影
    async refreshItemById(id) {
        const url = `${this.embyUrl}/emby/Items/${id}/Refresh`;
        await this.request(url, {
            method: 'POST',
        })
        return true;
    }

    // 3. 刷新所有库
    async refreshAllLibraries() {
        const url = `${this.embyUrl}/emby/Library/Refresh`;
        await this.request(url, {
            method: 'POST',
        })
        return true;
    }
    // 4. 根据路径搜索 /Items
    async searchItemsByPath(path) {
        const url = `${this.embyUrl}/Items`;
        const params = {
            Path: path,
            Recursive: true,
        }
        const response = await this.request(url, {
            method: 'GET',
            searchParams: params,
        })
        return response;
    }

    // 传入path, 调用searchItemsByPath, 如果返回结果为空, 则递归调用searchItemsByPath, 直到返回结果不为空
    async searchItemsByPathRecursive(path) {
        try {
            // 防止空路径
            if (!path) return null;
            // 移除路径末尾的斜杠
            const normalizedPath = path.replace(/\/+$/, '');
            // 搜索当前路径
            const result = await this.searchItemsByPath(normalizedPath);
            if (result?.Items?.[0]) {
                logTaskEvent(`在路径 ${normalizedPath} 找到媒体项`);
                return result.Items[0];
            }
            // 获取父路径
            const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
            if (!parentPath) {
                logTaskEvent('已搜索到根路径，未找到媒体项');
                return null;
            }
            // 递归搜索父路径
            logTaskEvent(`在路径 ${parentPath} 继续搜索`);
            return await this.searchItemsByPathRecursive(parentPath);
        } catch (error) {
            logTaskEvent(`路径搜索出错: ${error.message}`);
            return null;
        }
    }

    // 统一请求接口
    async request(url, options) {
        try {
            const headers = {
                'Authorization': 'MediaBrowser Token="' + this.embyApiKey + '"',
            }
            const response = await got(url, {
                method: options.method,
                headers: headers,
                responseType: 'json',
                searchParams: options?.searchParams,
                form: options?.form,
                json: options?.json,
                throwHttpErrors: false // 禁用自动抛出HTTP错误
            });

            if (response.statusCode === 401) {
                logTaskEvent(`Emby认证失败: API Key无效`);
                return null;
            } else if (response.statusCode < 200 || response.statusCode >= 300) {
                logTaskEvent(`Emby接口请求失败: 状态码 ${response.statusCode}`);
                return null;
            }
            return response.body;
        } catch (error) {
            logTaskEvent(`Emby接口请求异常: ${error.message}`);
            return null;
        }
    }

    // 处理媒体名称，去除年份、清晰度等信息
    _cleanMediaName(name) {
        return name
            // 移除括号内的年份，如：沙尘暴 (2025)
            .replace(/\s*[\(\[【］\[]?\d{4}[\)\]】］\]]?\s*/g, '')
            // 移除清晰度标识，如：4K、1080P、720P等
            .replace(/\s*[0-9]+[Kk](?![a-zA-Z])/g, '')
            .replace(/\s*[0-9]+[Pp](?![a-zA-Z])/g, '')
            // 移除其他常见标识，如：HDR、HEVC等
            .replace(/\s*(HDR|HEVC|H265|H264|X265|X264|REMUX)\s*/gi, '')
            // 移除额外的空格
            .trim();
    }
    /**
     * 解析路径映射配置
     * 支持多行配置，每行一个映射关系
     * 支持中英文冒号分隔
     * @returns {Array<{cloudPath: string, localPath: string}>} 映射数组，按路径长度降序排列
     */
    _parsePathMappings() {
        if (!this.embyPathReplace) return [];

        // 支持换行符和分号分隔
        const lines = this.embyPathReplace.split(/[\n;]/).filter(line => line.trim());

        return lines.map(line => {
            // 兼容中英文冒号
            const parts = line.trim().split(/[:：]/);
            if (parts.length >= 2) {
                return {
                    cloudPath: parts[0].trim(),
                    localPath: parts[1].trim()
                };
            }
            return null;
        }).filter(Boolean)
          .sort((a, b) => b.cloudPath.length - a.cloudPath.length); // 按路径长度降序，优先匹配最长路径
    }

    // 路径替换：网盘路径 → Emby本地路径
    _replacePath(path) {
        if (!path.startsWith('/')) {
            path = '/' + path;
        }

        const mappings = this._parsePathMappings();
        for (const mapping of mappings) {
            if (path.startsWith(mapping.cloudPath)) {
                path = path.replace(mapping.cloudPath, mapping.localPath);
                break; // 匹配到最长的路径后退出
            }
        }

        // 如果结尾有斜杠, 则移除
        path = path.replace(/\/+$/, '');
        return path;
    }


    /**
     * 处理来自 Emby 的 Webhook 通知
     * @param {object} payload - Webhook 的 JSON 数据
     */
    async handleWebhookNotification(payload) {
        logTaskEvent(`收到 Emby Webhook 通知: ${payload.Event}`);

        // 我们只关心删除事件
        // Emby 原生删除事件: library.deleted library.new(新剧集入库)
        const supportedEvents = ['library.deleted'];

        if (!supportedEvents.includes(payload.Event?.toLowerCase())) {
            // logTaskEvent(`忽略不相关的 Emby 事件: ${payload.Event}`);
            return;
        }

        let itemPath = payload.Item?.Path;
        if (!itemPath) {
            logTaskEvent('Webhook 通知中缺少有效的 Item.Path');
            return;
        }
        const isFolder = payload.Item?.IsFolder;
        const type = payload.Item?.Type;

        logTaskEvent(`检测到删除事件，路径: ${itemPath}, 类型: ${type}, 是否文件夹: ${isFolder}`);

        try {
            // 根据path获取对应的task
            // 1. 首先获取所有embyPathReplacex不为空的account
            const accounts = await this._accountRepo.find({
                where: [
                    { embyPathReplace: Not(IsNull()) }
                ]
            })
            // 2. 遍历accounts, 用路径映射将Emby本地路径反向替换为网盘路径
            const tasks = [];
            for (const account of accounts) {
                // 解析多行映射配置，兼容中英文冒号
                const lines = account.embyPathReplace.split(/[\n;]/).filter(l => l.trim());
                const mappings = lines.map(line => {
                    const parts = line.trim().split(/[:：]/);
                    if (parts.length >= 2) {
                        return { cloudPath: parts[0].trim(), localPath: parts[1].trim() };
                    }
                    return null;
                }).filter(Boolean).sort((a, b) => b.localPath.length - a.localPath.length); // 按本地路径长度降序

                // 检查itemPath是否匹配某个本地路径
                for (const mapping of mappings) {
                    if (itemPath.startsWith(mapping.localPath)) {
                        // 将Emby本地路径替换为网盘路径
                        let cloudItemPath = itemPath.replace(mapping.localPath, mapping.cloudPath).replace(/^\/+|\/+$/g, '');
                        if (!isFolder) {
                            cloudItemPath = path.dirname(cloudItemPath);
                        }
                        const task = await this._taskRepo.findOne({
                            where: {
                                accountId: account.id,
                                realFolderName: Like(`%${cloudItemPath}%`)
                            },
                            relations: {
                                account: true
                            },
                            select: {
                                account: {
                                    username: true,
                                    password: true,
                                    cookies: true,
                                    localStrmPrefix: true,
                                    cloudStrmPrefix: true,
                                    embyPathReplace: true
                                }
                            }
                        })
                        if (task) {
                            tasks.push(task);
                        }
                        break; // 匹配到最长的路径后退出
                    }
                }
            }
            if (tasks.length === 0) {
                logTaskEvent(`未找到对应的任务, 路径: ${itemPath}`);
                return;
            }
            logTaskEvent(`找到对应的任务, 任务数量: ${tasks.length}, 任务名称: ${tasks.map(task => task.resourceName).join(', ')}`);
            // 4. 遍历tasks, 删除本地strm, 删除任务和网盘
            for (const task of tasks) {
                if (!isFolder) {
                    // 如果是剧集文件，只删除对应的单个文件
                    logTaskEvent(`删除单个剧集文件, 任务id: ${task.id}, 文件路径: ${itemPath}`);
                    const cloud189 = Cloud189Service.getInstance(task.account);
                    const folderInfo = await cloud189.listFiles(task.realFolderId);
                    if (!folderInfo || !folderInfo.fileListAO) {
                        logTaskEvent(`未找到对应的网盘文件列表: 跳过删除`);
                        continue;
                    }
                    const fileList = [...(folderInfo.fileListAO.fileList || [])];
                    const fileName = path.basename(itemPath);
                    const fileNameWithoutExt = path.parse(fileName).name;
                    const targetFile = fileList.find(file => path.parse(file.name).name === fileNameWithoutExt);
                    if (targetFile) {
                        await this._taskService.deleteCloudFile(cloud189, {
                            id: targetFile.id,
                            name: targetFile.name
                        }, false)
                        logTaskEvent(`成功删除文件: ${fileName}`);
                    } else {
                        logTaskEvent(`未找到对应的网盘文件: ${fileName}`);
                    }
                }else{
                    logTaskEvent(`删除任务和网盘, 任务id: ${task.id}`);
                    // 删掉任务并且删掉网盘
                    this._taskService.deleteTasks(tasks.map(task => task.id), true)
                }
            }


        } catch (error) {
            logTaskEvent(`处理 Emby Webhook 时发生错误: ${error.message}`);
            console.error('处理 Emby Webhook 异常:', error);
        }
    }

}
module.exports = { EmbyService };