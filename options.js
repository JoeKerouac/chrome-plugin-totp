let configs = [];
let originalConfigs = [];
let hasChanges = false;
let pendingConfig = null;

// 页面加载时检查是否有待确认的配置
document.addEventListener('DOMContentLoaded', async () => {
    await checkPendingConfig();
    await loadConfigs();
    setupEventListeners();
});

// 检查待确认的配置
async function checkPendingConfig() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'confirm') {
        try {
            const result = await chrome.storage.local.get(['pendingConfig']);
            if (result.pendingConfig && result.pendingConfig.timestamp > Date.now() - 300000) {
                pendingConfig = result.pendingConfig;
                showPendingConfigDialog();
                // 清除待确认配置
                chrome.storage.local.remove(['pendingConfig']);
            }
        } catch (error) {
            console.error('检查待确认配置失败:', error);
        }
    }
}

// 显示待确认配置对话框
function showPendingConfigDialog() {
    if (!pendingConfig) return;
    
    const customName = prompt(
        `检测到新的TOTP配置：\n\n` +
        `发行方: ${pendingConfig.issuer}\n` +
        `账户: ${pendingConfig.account}\n` +
        `密钥: ${pendingConfig.key.substring(0, 8)}...\n\n` +
        `请输入自定义配置名称:`, 
        pendingConfig.name
    );
    
    if (customName && customName.trim()) {
        addPendingConfig(customName.trim());
    }
}

// 添加待确认的配置
async function addPendingConfig(customName) {
    try {
        // 重新加载最新配置，避免覆盖现有配置
        const result = await chrome.storage.sync.get(['totpConfigs']);
        const currentConfigs = result.totpConfigs || [];
        
        // 检查密钥是否重复
        const existingIndex = currentConfigs.findIndex(c => c.key === pendingConfig.key);
        if (existingIndex >= 0) {
            alert('该密钥已存在，无法添加重复配置');
            return;
        }
        
        // 添加新配置到现有配置中
        const configToAdd = {
            name: customName,
            key: pendingConfig.key,
            issuer: pendingConfig.issuer,
            account: pendingConfig.account
        };
        
        currentConfigs.push(configToAdd);
        await chrome.storage.sync.set({ totpConfigs: currentConfigs });
        
        alert(`配置 "${customName}" 添加成功！`);
        
        // 重新加载配置
        await loadConfigs();
        
    } catch (error) {
        console.error('添加配置失败:', error);
        alert('添加配置失败');
    }
}

// 加载配置
async function loadConfigs() {
    const result = await chrome.storage.sync.get(['totpConfigs']);
    configs = result.totpConfigs || [];
    // 为每个配置添加删除标记
    configs = configs.map(config => ({ ...config, _deleted: false }));
    originalConfigs = JSON.parse(JSON.stringify(configs)); // 深拷贝
    hasChanges = false;
    renderConfigs();
    updateSaveButton();
}

// 检查是否有变更
function checkForChanges() {
    const currentJson = JSON.stringify(configs);
    const originalJson = JSON.stringify(originalConfigs);
    hasChanges = currentJson !== originalJson;
    updateSaveButton();
    highlightChangedItems();
}

// 更新保存按钮状态
function updateSaveButton() {
    const saveBtn = document.querySelector('.btn-primary');
    if (hasChanges) {
        saveBtn.textContent = '💾 保存更改';
        saveBtn.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)';
        saveBtn.style.boxShadow = '0 4px 15px rgba(255, 107, 107, 0.4)';
        saveBtn.style.animation = 'pulse 2s infinite';
        saveBtn.disabled = false;
        saveBtn.style.opacity = '';
    } else {
        saveBtn.textContent = '💾 保存所有配置';
        saveBtn.style.background = '';
        saveBtn.style.boxShadow = '';
        saveBtn.style.animation = '';
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
    }
}

// 高亮变更的配置项
function highlightChangedItems() {
    const configItems = document.querySelectorAll('.config-item');
    
    configItems.forEach((item, index) => {
        if (index < configs.length) {
            const current = configs[index];
            
            // 跳过已删除的项的高亮处理
            if (current._deleted) {
                return;
            }
            
            // 检查是否为新增项
            if (current._isNew) {
                item.classList.add('new-item');
                // 新项的所有非空字段都高亮
                const inputs = item.querySelectorAll('input[data-field]');
                inputs.forEach(input => {
                    if (input.value.trim()) {
                        input.classList.add('field-changed');
                    }
                });
                return;
            }
            
            // 检查现有项的变更
            if (index < originalConfigs.length) {
                const original = originalConfigs[index];
                const configChanged = JSON.stringify(current) !== JSON.stringify(original);
                
                if (configChanged) {
                    item.classList.add('changed');
                    
                    // 检查每个字段的变更并高亮
                    const inputs = item.querySelectorAll('input[data-field]');
                    inputs.forEach(input => {
                        const field = input.dataset.field;
                        const currentValue = current[field] || '';
                        const originalValue = original[field] || '';
                        
                        if (currentValue !== originalValue) {
                            input.classList.add('field-changed');
                        } else {
                            input.classList.remove('field-changed');
                        }
                    });
                } else {
                    item.classList.remove('changed');
                    // 移除所有字段高亮
                    const inputs = item.querySelectorAll('input[data-field]');
                    inputs.forEach(input => {
                        input.classList.remove('field-changed');
                    });
                }
            }
        }
    });
}

// 渲染配置列表
function renderConfigs() {
    const container = document.getElementById('configs');
    container.innerHTML = '';
    
    if (configs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>暂无配置</h3>
                <p>点击下方按钮添加您的第一个TOTP配置</p>
            </div>
        `;
        return;
    }
    
    configs.forEach((config, index) => {
        const div = document.createElement('div');
        div.className = 'config-item';
        
        const isDeleted = config._deleted;
        const isNew = config._isNew;
        
        // 根据状态决定按钮类型
        let deleteButtonHtml;
        if (isNew) {
            // 新增项直接删除
            deleteButtonHtml = `<button class="btn btn-danger" data-action="remove" data-index="${index}">🗑️ 删除</button>`;
        } else if (isDeleted) {
            // 现有项被删除，显示撤销按钮
            deleteButtonHtml = `<button class="btn btn-undo" data-action="undo" data-index="${index}">↶ 撤销删除</button>`;
        } else {
            // 现有项正常状态
            deleteButtonHtml = `<button class="btn btn-danger" data-action="remove" data-index="${index}">🗑️ 删除</button>`;
        }
        
        div.innerHTML = `
            <div class="config-header">
                <div class="config-title">${config.name || `配置 ${index + 1}`}</div>
                ${deleteButtonHtml}
            </div>
            
            <div class="form-row two-cols">
                <div class="form-group">
                    <label>配置名称</label>
                    <input type="text" value="${config.name || ''}" data-field="name" data-index="${index}" placeholder="例: GitHub">
                </div>
                <div class="form-group">
                    <label>输入框标识</label>
                    <input type="text" value="${config.placeholder || ''}" data-field="placeholder" data-index="${index}" placeholder="输入框的placeholder属性">
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group full-width">
                    <label>TOTP密钥</label>
                    <input type="password" value="${config.key || ''}" data-field="key" data-index="${index}" placeholder="从认证应用获取的密钥">
                </div>
            </div>
            
            <div class="form-row two-cols">
                <div class="form-group">
                    <label>域名匹配</label>
                    <input type="text" value="${config.domain || ''}" data-field="domain" data-index="${index}" placeholder="例: github.com">
                    <div class="placeholder-text">匹配包含此域名的网站</div>
                </div>
                <div class="form-group">
                    <label>路径匹配</label>
                    <input type="text" value="${config.path || ''}" data-field="path" data-index="${index}" placeholder="例: /login">
                    <div class="placeholder-text">匹配包含此路径的URL</div>
                </div>
            </div>
            
            <div class="form-row two-cols">
                <div class="form-group">
                    <label>路由匹配</label>
                    <input type="text" value="${config.hash || ''}" data-field="hash" data-index="${index}" placeholder="例: #/auth">
                    <div class="placeholder-text">匹配包含此hash的页面</div>
                </div>
                <div class="form-group">
                    <label>正则表达式</label>
                    <input type="text" value="${config.regex || ''}" data-field="regex" data-index="${index}" placeholder="例: ^https://.*\\.example\\.com">
                    <div class="placeholder-text">高级匹配规则，优先级最高</div>
                </div>
            </div>
        `;
        
        // 添加状态样式
        if (isNew) {
            div.classList.add('new-item');
        } else if (isDeleted) {
            div.classList.add('deleted');
        }
        
        container.appendChild(div);
    });
    
    // 添加事件监听器
    addEventListeners();
    checkForChanges();
}

// 添加事件监听器
function addEventListeners() {
    // 输入框变更事件
    document.querySelectorAll('input[data-field]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            updateConfig(index, field, e.target.value);
        });
    });
    
    // 删除按钮事件
    document.querySelectorAll('button[data-action="remove"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            removeConfig(index);
        });
    });
    
    // 撤销删除按钮事件
    document.querySelectorAll('button[data-action="undo"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            undoRemoveConfig(index);
        });
    });
}

// 更新配置
function updateConfig(index, field, value) {
    configs[index][field] = value;
    // 更新标题显示
    if (field === 'name') {
        const titleElement = document.querySelector(`.config-item:nth-child(${index + 1}) .config-title`);
        if (titleElement) {
            titleElement.textContent = value || `配置 ${index + 1}`;
        }
    }
    checkForChanges();
}

// 添加新配置
function addConfig() {
    configs.push({
        name: '',
        key: '',
        domain: '',
        path: '',
        hash: '',
        regex: '',
        placeholder: '',
        _deleted: false,
        _isNew: true  // 标记为新增
    });
    renderConfigs();
    
    // 滚动到新添加的配置
    setTimeout(() => {
        const newConfig = document.querySelector('.config-item:last-child');
        if (newConfig) {
            newConfig.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

// 删除配置
function removeConfig(index) {
    const config = configs[index];
    
    if (config._isNew) {
        // 新增项直接删除
        configs.splice(index, 1);
    } else {
        // 现有项软删除
        config._deleted = true;
    }
    
    renderConfigs();
}

// 撤销删除配置
function undoRemoveConfig(index) {
    configs[index]._deleted = false;
    renderConfigs();
}

// 显示保存提示
function showSaveNotification(success, message) {
    const notification = document.createElement('div');
    notification.className = `save-notification ${success ? 'success' : 'error'}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${success ? '✅' : '❌'}</span>
            <span class="notification-text">${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => notification.classList.add('show'), 10);
    
    // 自动隐藏
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 保存配置
async function saveConfigs() {
    // 如果没有变更，直接返回
    if (!hasChanges) {
        return;
    }
    
    const saveBtn = event.target;
    const originalText = saveBtn.textContent;
    
    // 显示保存中状态
    saveBtn.textContent = '⏳ 保存中...';
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.7';
    
    try {
        // 过滤掉删除的配置，移除内部标记
        const configsToSave = configs
            .filter(config => !config._deleted)
            .map(config => {
                const { _deleted, _isNew, ...cleanConfig } = config;
                return cleanConfig;
            });
        
        await chrome.storage.sync.set({ totpConfigs: configsToSave });
        
        // 更新原始配置
        configs = configsToSave.map(config => ({ ...config, _deleted: false, _isNew: false }));
        originalConfigs = JSON.parse(JSON.stringify(configs));
        hasChanges = false;
        
        // 重新渲染以清除所有状态
        renderConfigs();
        updateSaveButton();
        showSaveNotification(true, '配置保存成功！');
        
    } catch (error) {
        console.error('保存失败:', error);
        showSaveNotification(false, '保存失败: ' + error.message);
        
        // 恢复按钮状态
        saveBtn.textContent = originalText;
    } finally {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '';
    }
}

// 导出配置
function exportConfigs() {
    try {
        const exportData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            configs: configs.filter(c => !c._deleted).map(c => ({
                name: c.name,
                key: c.key,
                domain: c.domain || '',
                path: c.path || '',
                hash: c.hash || '',
                regex: c.regex || '',
                placeholder: c.placeholder || '',
                issuer: c.issuer || '',
                account: c.account || ''
            }))
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `totp-configs-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        showNotification('配置导出成功', 'success');
    } catch (error) {
        console.error('导出失败:', error);
        showNotification('导出失败: ' + error.message, 'error');
    }
}

// 导入配置
function importConfigs() {
    document.getElementById('import-file').click();
}

// 处理文件导入
function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            if (!importData.configs || !Array.isArray(importData.configs)) {
                throw new Error('无效的配置文件格式');
            }
            
            let importCount = 0;
            let skipCount = 0;
            
            for (const config of importData.configs) {
                if (!config.name || !config.key) {
                    skipCount++;
                    continue;
                }
                
                // 检查是否已存在相同密钥
                const existingIndex = configs.findIndex(c => c.key === config.key);
                if (existingIndex >= 0) {
                    skipCount++;
                    continue;
                }
                
                // 添加配置
                configs.push({
                    name: config.name,
                    key: config.key,
                    domain: config.domain || '',
                    path: config.path || '',
                    hash: config.hash || '',
                    regex: config.regex || '',
                    placeholder: config.placeholder || '',
                    issuer: config.issuer || '',
                    account: config.account || '',
                    _deleted: false
                });
                importCount++;
            }
            
            if (importCount > 0) {
                checkForChanges();
                renderConfigs();
                showNotification(`成功导入 ${importCount} 个配置，跳过 ${skipCount} 个重复配置`, 'success');
            } else {
                showNotification('没有新配置可导入', 'error');
            }
            
        } catch (error) {
            console.error('导入失败:', error);
            showNotification('导入失败: ' + error.message, 'error');
        }
        
        // 清空文件输入
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    loadConfigs();
    
    // 添加按钮事件监听器
    document.querySelector('.btn-success').addEventListener('click', addConfig);
    document.querySelector('.btn-primary').addEventListener('click', saveConfigs);
    document.getElementById('export-btn').addEventListener('click', exportConfigs);
    document.getElementById('import-btn').addEventListener('click', importConfigs);
    document.getElementById('import-file').addEventListener('change', handleFileImport);
});
