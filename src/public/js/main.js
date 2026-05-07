async function loadVersion() {
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        const versionStr = data.version || 'unknown';
        // dev 版本添加特殊标识
        if (versionStr.includes('-dev')) {
            document.getElementById('version').innerText = `v${versionStr}`;
            document.getElementById('version').style.color = '#ff9800';  // 开发版用橙色
            document.getElementById('version').title = '开发测试版本';
        } else {
            document.getElementById('version').innerText = `v${versionStr}`;
        }
    } catch (error) {
        console.error('Failed to load version:', error);
    }
}

async function loadDashboardStats() {
    try {
        const response = await fetch('/api/tasks?status=all&search=');
        const data = await response.json();
        if (!data.success) {
            return;
        }
        const tasks = data.data || [];
        const stats = {
            total: tasks.length,
            processing: tasks.filter(task => task.status === 'processing').length,
            completed: tasks.filter(task => task.status === 'completed').length,
            failed: tasks.filter(task => task.status === 'failed' || task.status === 'error').length
        };
        Object.entries(stats).forEach(([key, value]) => {
            const element = document.querySelector(`[data-stat="${key}"]`);
            if (element) {
                element.textContent = value;
            }
        });

        const dashRecentTasks = document.getElementById('dashRecentTasks');
        if (dashRecentTasks && tasks.length > 0) {
            const recent = tasks.sort((a, b) => b.id - a.id); // 移除slice限制，显示所有任务
            
            const formatStatus = (task) => {
                if (task.status === 'completed') return '已完结';
                if (task.status === 'failed') return '失败';
                if (task.status === 'processing') return '追剧中';
                if (task.status === 'pending') {
                    if (task.currentEpisodes > 0) return '追剧中';
                    return '等待中';
                }
                return task.status || '未知';
            };
            
            const getStatusStyle = (task) => {
                if (task.status === 'completed') return 'status-completed';
                if (task.status === 'failed') return 'status-failed';
                if (task.status === 'processing') return 'status-processing';
                if (task.status === 'pending') {
                    if (task.currentEpisodes > 0) return 'status-processing';
                    return 'status-pending';
                }
                return 'status-' + (task.status || 'unknown');
            };
            
            dashRecentTasks.innerHTML = recent.map(task => {
                const taskName = task.shareFolderName ? (task.resourceName + '/' + task.shareFolderName) : task.resourceName || '未命名任务';
                return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-radius: 6px; background: var(--bg-main);">
                    <div style="display: flex; flex-direction: column; gap: 4px; overflow: hidden;">
                        <span style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${taskName}</span>
                        <span style="font-size: 11px; color: var(--text-muted);">${new Date(task.createdAt || Date.now()).toLocaleString()}</span>
                    </div>
                    <span class="status-badge ${getStatusStyle(task)}" style="font-size: 11px; padding: 4px 8px;">${formatStatus(task)}</span>
                </div>
            `}).join('');
        } else if (dashRecentTasks) {
            dashRecentTasks.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">暂无任务</div>';
        }
    } catch (error) {
        console.error('Failed to load dashboard stats:', error);
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 主入口文件
document.addEventListener('DOMContentLoaded', () => {
     // 初始化macos样式
    const appTitle = document.getElementById('appTitle');
    if (appTitle) {
        if(localStorage.getItem('_currentTheme') === 'macos') {
            // 插入新的css
            const newCss = document.createElement('link');
            newCss.rel = 'stylesheet';
            newCss.href = '/css/macos.css';
            document.head.appendChild(newCss);
        }
        appTitle.addEventListener('click', (e) => {
            e.preventDefault();
           const currentTheme = localStorage.getItem('_currentTheme')
           if(currentTheme === 'macos') {
            localStorage.setItem('_currentTheme', '')
            // 移除macos样式
            const macosCss = document.querySelector('link[href="/css/macos.css"]');
            if (macosCss) {
                document.head.removeChild(macosCss);
            }
           } else {
            localStorage.setItem('_currentTheme', 'macos')
            // 插入新的css
           const newCss = document.createElement('link');
           newCss.rel = 'stylesheet';
           newCss.href = '/css/macos.css';
           document.head.appendChild(newCss);
           }
        });
    }
    
    // 侧边栏切换逻辑
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarPin = document.getElementById('sidebarPin');
    const sidebar = document.querySelector('.sidebar');
    
    if (sidebarToggle && sidebar) {
        // 切换按钮：展开/收起侧边栏
        sidebarToggle.addEventListener('click', () => {
            if (sidebar.classList.contains('pinned')) {
                // 如果已固定，取消固定并收起
                sidebar.classList.remove('pinned', 'open');
            } else {
                // 否则切换展开状态
                sidebar.classList.toggle('open');
            }
        });
        
        // 点击侧边栏外部关闭（仅在展开且未固定时）
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && 
                !sidebar.classList.contains('pinned') &&
                !sidebar.contains(e.target) && 
                !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    }
    
    if (sidebarPin && sidebar) {
        // 固定按钮：切换固定状态
        sidebarPin.addEventListener('click', (e) => {
            e.stopPropagation();
            const isPinned = sidebar.classList.toggle('pinned');
            
            if (isPinned) {
                // 固定时确保侧边栏展开
                sidebar.classList.add('open');
                localStorage.setItem('sidebarPinned', 'true');
            } else {
                localStorage.removeItem('sidebarPinned');
            }
        });
        
        // 恢复固定状态
        if (localStorage.getItem('sidebarPinned') === 'true') {
            sidebar.classList.add('pinned', 'open');
        }
    }
    
    // 版本号点击打开GitHub
    const versionBadge = document.querySelector('.sidebar-version .version-badge');
    if (versionBadge) {
        versionBadge.style.cursor = 'pointer';
        versionBadge.addEventListener('click', () => {
            window.open('https://github.com/ymting/my-cloud189-auto-save', '_blank');
        });
    }
    
    // 初始化通知图标
    const notificationBtn = document.querySelector('.notification-btn');
    if (notificationBtn) {
        notificationBtn.style.cursor = 'pointer';
        notificationBtn.addEventListener('click', () => {
            // 创建通知弹窗
            const existing = document.querySelector('.notification-dropdown');
            if (existing) {
                existing.remove();
                return;
            }
            
            const dropdown = document.createElement('div');
            dropdown.className = 'notification-dropdown';
            dropdown.innerHTML = `
                <div class="notification-header">
                    <h3>系统通知</h3>
                    <span class="notification-close">&times;</span>
                </div>
                <div class="notification-body">
                    <div class="notification-stats">
                        <div class="stat-item">
                            <div class="stat-header">
                                <span>本地缓存占用</span>
                                <strong><span id="notifLocalCache">2.4</span> MB</strong>
                            </div>
                            <div class="load-bar"><div class="load-progress" style="width: 15%; background: var(--accent);"></div></div>
                        </div>
                        <div class="stat-item" style="margin-top: 16px;">
                            <div class="stat-header">
                                <span>日志文件大小</span>
                                <strong><span id="notifLogSize">0.8</span> MB</strong>
                            </div>
                            <div class="load-bar"><div class="load-progress" style="width: 5%; background: #10b981;"></div></div>
                        </div>
                    </div>
                    <div class="notification-divider" style="border-top: 1px solid var(--border-color); margin: 16px 0;"></div>
                    <div class="notification-actions">
                        <button onclick="document.getElementById('logsModal').style.display='flex'; document.querySelector('.notification-dropdown').remove();" style="width: 100%; padding: 8px 12px; background: #4B4BFA; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s ease;">
                            <i class="ph ph-file-text" style="margin-right: 6px;"></i>查看系统日志
                        </button>
                    </div>
                </div>
            `;
            
            const rect = notificationBtn.getBoundingClientRect();
            dropdown.style.position = 'fixed';
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
            dropdown.style.top = `${rect.bottom + 8}px`;
            dropdown.style.zIndex = '2000';
            
            document.body.appendChild(dropdown);
            
            dropdown.querySelector('.notification-close').addEventListener('click', () => {
                dropdown.remove();
            });
            
            setTimeout(() => {
                document.addEventListener('click', function closeDropdown(e) {
                    if (!dropdown.contains(e.target) && !notificationBtn.contains(e.target)) {
                        dropdown.remove();
                        document.removeEventListener('click', closeDropdown);
                    }
                });
            }, 0);
        });
    }
    
    // 初始化用户下拉菜单
    const userProfile = document.querySelector('.user-profile');
    if (userProfile) {
        userProfile.style.cursor = 'pointer';
        userProfile.addEventListener('click', () => {
            message.info('用户管理功能开发中，敬请期待');
        });
    }
    
    // 初始化搜索框
    const globalSearch = document.getElementById('globalSearch');
    if (globalSearch) {
        globalSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = globalSearch.value.trim();
                if (query) {
                    taskFilterParams.search = query;
                    fetchTasks();
                }
            }
        });
        
        globalSearch.addEventListener('input', debounce(() => {
            taskFilterParams.search = globalSearch.value.trim();
            fetchTasks();
        }, 500));
    }
    
    // 初始化主题切换（简单模式）
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        let isDark = localStorage.getItem('theme') === 'dark';
        
        const updateTheme = () => {
            if (isDark) {
                document.documentElement.setAttribute('data-theme', 'dark');
                themeToggle.innerHTML = '<i class="ph ph-sun" style="font-size: 18px; color: #f1f5f9;"></i>';
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
                themeToggle.innerHTML = '<i class="ph ph-moon" style="font-size: 18px; color: #64748b;"></i>';
                localStorage.setItem('theme', 'light');
            }
        };
        
        updateTheme();
        
        themeToggle.addEventListener('click', () => {
            isDark = !isDark;
            updateTheme();
        });
    }
    
    // 加载版本号和仪表盘
    loadVersion();
    loadDashboardStats();
    // 初始化所有功能
    initTabs();
    initAccountForm();
    initTaskForm();
    initEditTaskForm();
    // 初始化主题
    initTheme();
    // 初始化日志
    initLogs()

    // 初始化目录选择器
    const folderSelector = new FolderSelector({
        enableFavorites: true,
        favoritesKey: 'createTaskFavorites',
        onSelect: ({ id, name, path }) => {
            document.getElementById('targetFolder').value = path;
            document.getElementById('targetFolderId').value = id;
            if (typeof autoDetectVideoType === 'function') autoDetectVideoType();
        }
    });

    // 修改目录选择触发方式
    document.getElementById('targetFolder').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            message.warning('请先选择账号');
            return;
        }
        folderSelector.show(accountId);
    });

    // 添加常用目录按钮点击事件
    document.getElementById('favoriteFolderBtn').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            message.warning('请先选择账号');
            return;
        }
        folderSelector.showFavorites(accountId);
    });

    // 初始化数据
    fetchAccounts(true);
    fetchTasks();
    loadDashboardStats();

    // 定时刷新数据
    // setInterval(() => {
    //     fetchTasks();
    // }, 30000);
});


// 从缓存获取数据
function getFromCache(key) {
    // 拼接用户 ID
    const userId = document.getElementById('accountId').value;
    return localStorage.getItem(key + '_' + userId);
}
// 保存数据到缓存
function saveToCache(key, value) {
    const userId = document.getElementById('accountId').value;
    localStorage.setItem(key + '_' + userId, value);
}

document.addEventListener('DOMContentLoaded', function() {
    const tooltip = document.getElementById('regexTooltip');

    // 使用事件委托，监听整个文档的点击事件
    document.addEventListener('click', function(e) {
        // 检查点击的是否是帮助图标
        if (e.target.classList.contains('help-icon')) {
            e.stopPropagation();
            const helpIcon = e.target;
            const rect = helpIcon.getBoundingClientRect();
            const isVisible = tooltip.style.display === 'block';
            
            // 关闭弹窗
            if (isVisible && tooltip._currentIcon === helpIcon) {
                tooltip.style.display = 'none';
                return;
            }

            // 显示弹窗
            tooltip.style.display = 'block';
            tooltip._currentIcon = helpIcon;
            tooltip.style.zIndex = 9999;
            
            // 计算位置
            const viewportWidth = window.innerWidth;
            const tooltipWidth = tooltip.offsetWidth;
            
            // 移动端适配
            if (viewportWidth <= 768) {
                tooltip.style.left = '50%';
                tooltip.style.top = '50%';
                tooltip.style.transform = 'translate(-50%, -50%)';
                tooltip.style.maxWidth = '90vw';
                tooltip.style.maxHeight = '80vh';
                tooltip.style.overflow = 'auto';
            } else {
                let left = rect.left;
                if (left + tooltipWidth > viewportWidth) {
                    left = viewportWidth - tooltipWidth - 10;
                }
                tooltip.style.top = `${rect.bottom + 5}px`;
                tooltip.style.left = `${left}px`;
                tooltip.style.transform = 'none';
            }
        } else if (!tooltip.contains(e.target)) {
            // 点击其他地方关闭弹窗
            tooltip.style.display = 'none';
        }
    });

    // 添加 ESC 键关闭
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            tooltip.style.display = 'none';
        }
    });
});

function toggleFloatingBtns() {
    const container = document.getElementById('floatingBtnsContainer');
    const icon = document.getElementById('toggleIcon');
    container.classList.toggle('collapsed');
    icon.classList.toggle('expanded');
}


function toggleHelpText(button) {
    const helpText = button.nextElementSibling;
    if (helpText.style.display === 'block') {
        helpText.style.display = 'none';
        button.textContent = '显示帮助';
    } else {
        helpText.style.display = 'block';
        button.textContent = '隐藏帮助';
    }
}
