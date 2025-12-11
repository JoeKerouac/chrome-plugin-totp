// Service Worker for TOTP extension

// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('TOTP扩展已安装');
});

// 解析otpauth URL
function parseOtpauthUrl(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== 'otpauth:' || urlObj.hostname !== 'totp') {
      return null;
    }
    
    const params = new URLSearchParams(urlObj.search);
    const secret = params.get('secret');
    const issuer = params.get('issuer');
    
    if (!secret) {
      return null;
    }
    
    const pathParts = urlObj.pathname.split('/');
    const accountName = pathParts[pathParts.length - 1];
    
    return {
      name: decodeURIComponent(issuer || accountName || '扫描导入'),
      key: secret,
      issuer: issuer || '',
      account: decodeURIComponent(accountName || '')
    };
  } catch (error) {
    console.error('解析otpauth URL失败:', error);
    return null;
  }
}

// 添加配置到存储
async function addConfigFromQR(configData) {
  try {
    const result = await chrome.storage.sync.get(['totpConfigs']);
    const configs = result.totpConfigs || [];
    
    // 只检查密钥是否重复
    const existingIndex = configs.findIndex(c => c.key === configData.key);
    
    if (existingIndex >= 0) {
      console.error('密钥已存在');
      return false;
    }
    
    // 添加新配置
    configs.push(configData);
    await chrome.storage.sync.set({ totpConfigs: configs });
    return true;
  } catch (error) {
    console.error('保存配置失败:', error);
    return false;
  }
}

// 处理来自内容脚本的消息
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'qrCodeFound') {
    const configData = parseOtpauthUrl(request.data);
    if (configData) {
      // 保存扫描结果
      chrome.storage.local.set({
        pendingConfig: {
          ...configData,
          timestamp: Date.now()
        }
      });
      
      // 直接打开配置管理页面
      chrome.tabs.create({ 
        url: chrome.runtime.getURL('options.html?action=confirm') 
      });
      
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/get_started128.png',
        title: 'TOTP配置导入失败',
        message: '未识别到有效的TOTP配置'
      });
    }
  } else if (request.action === 'qrCodeNotFound') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/get_started128.png',
      title: '二维码扫描失败',
      message: '选择区域未找到二维码或二维码内容错误'
    });
  }
  
  sendResponse({received: true});
  return true;
});
