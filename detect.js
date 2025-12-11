// 获取当前页面信息
const currentUrl = window.location.href;
const currentDomain = window.location.hostname;
const currentPath = window.location.pathname;
const currentHash = window.location.hash;

// 匹配配置
function matchConfig(config) {
    // 正则表达式匹配（优先级最高）
    if (config.regex) {
        try {
            const regex = new RegExp(config.regex);
            return regex.test(currentUrl);
        } catch (e) {
            console.warn('Invalid regex:', config.regex);
        }
    }
    
    // 域名匹配
    if (config.domain && !currentDomain.includes(config.domain)) {
        return false;
    }
    
    // 路径匹配
    if (config.path && !currentPath.includes(config.path)) {
        return false;
    }
    
    // 路由匹配
    if (config.hash && !currentHash.includes(config.hash)) {
        return false;
    }
    
    return true;
}

// 填充输入框
function fill(expectPlaceholder, valueSupplier) {
    const allInput = document.getElementsByTagName("input");
    
    for (let i = 0; i < allInput.length; i++) {
        const input = allInput[i];
        
        if (expectPlaceholder === input.placeholder) {
            const value = valueSupplier();
            const oldValue = input.value;
            
            if (oldValue !== value) {
                input.value = value;
                const event = new Event('input', { bubbles: true });
                input.dispatchEvent(event);
            }
        }
    }
}

// 初始化
async function init() {
    try {
        const result = await chrome.storage.sync.get(['totpConfigs']);
        const configs = result.totpConfigs || [];
        
        // 查找匹配的配置
        const matchedConfig = configs.find(config => matchConfig(config));
        
        if (matchedConfig && matchedConfig.key && matchedConfig.placeholder) {
            setInterval(() => {
                fill(matchedConfig.placeholder, () => generateTOTP(matchedConfig.key, 6));
            }, 1000);
        }
    } catch (error) {
        console.error('TOTP插件初始化失败:', error);
    }
}

// 启动
init();
