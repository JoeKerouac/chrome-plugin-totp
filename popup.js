let configs = [];
let pendingConfig = null;

// 加载配置
async function loadConfigs() {
  try {
    const result = await chrome.storage.sync.get(['totpConfigs']);
    configs = result.totpConfigs || [];
  } catch (error) {
    console.error('加载配置失败:', error);
    configs = [];
  }
}

// 检查待确认的配置
async function checkPendingConfig() {
  try {
    const result = await chrome.storage.local.get(['pendingConfig']);
    if (result.pendingConfig && result.pendingConfig.timestamp > Date.now() - 300000) {
      pendingConfig = result.pendingConfig;
      showConfigConfirmModal();
      // 清除待确认配置
      chrome.storage.local.remove(['pendingConfig']);
    }
  } catch (error) {
    console.error('检查待确认配置失败:', error);
  }
}

function showConfigConfirmModal() {
  if (!pendingConfig) return;
  
  document.getElementById('config-name-input').value = pendingConfig.name;
  document.getElementById('config-key-display').value = pendingConfig.key;
  document.getElementById('config-issuer-display').value = pendingConfig.issuer;
  document.getElementById('config-confirm-modal').style.display = 'flex';
}

function closeConfigConfirmModal() {
  document.getElementById('config-confirm-modal').style.display = 'none';
  pendingConfig = null;
}

async function confirmConfig() {
  if (!pendingConfig) return;
  
  const customName = document.getElementById('config-name-input').value.trim();
  if (!customName) {
    alert('请输入配置名称');
    return;
  }
  
  // 检查密钥是否重复
  const existingIndex = configs.findIndex(c => c.key === pendingConfig.key);
  if (existingIndex >= 0) {
    alert('该密钥已存在');
    return;
  }
  
  // 使用用户输入的名称
  const configToAdd = {
    ...pendingConfig,
    name: customName
  };
  
  try {
    configs.push(configToAdd);
    await chrome.storage.sync.set({ totpConfigs: configs });
    
    closeConfigConfirmModal();
    updateTotpCodes();
    
    // 显示成功提示
    const feedback = document.createElement('div');
    feedback.className = 'copy-feedback';
    feedback.textContent = '配置添加成功!';
    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), 2000);
    
  } catch (error) {
    console.error('保存配置失败:', error);
    alert('保存配置失败');
  }
}

async function updateTotpCodes() {
  await loadConfigs();
  
  const container = document.getElementById('totp-list');
  container.innerHTML = '';
  
  if (configs.length === 0) {
    container.innerHTML = '<div class="no-config">暂无配置，请点击配置管理添加</div>';
    return;
  }
  
  configs.forEach(config => {
    if (!config.key) return;
    
    const code = generateTOTP(config.key, 6);
    
    const item = document.createElement('div');
    item.className = 'totp-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'totp-name';
    nameSpan.textContent = config.name || '未命名';
    
    const rightSection = document.createElement('div');
    rightSection.style.display = 'flex';
    rightSection.style.alignItems = 'center';
    
    const codeSpan = document.createElement('span');
    codeSpan.className = 'totp-code';
    codeSpan.textContent = code;
    codeSpan.title = '点击复制';
    codeSpan.addEventListener('click', () => copyToClipboard(code));
    
    const qrBtn = document.createElement('button');
    qrBtn.className = 'qr-btn';
    qrBtn.textContent = 'QR';
    qrBtn.title = '显示二维码';
    qrBtn.addEventListener('click', () => showQrCode(config));
    
    rightSection.appendChild(codeSpan);
    rightSection.appendChild(qrBtn);
    
    item.appendChild(nameSpan);
    item.appendChild(rightSection);
    container.appendChild(item);
  });
}

async function showQrCode(config) {
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(config.name || '未命名')}?secret=${config.key}&issuer=${encodeURIComponent(config.name || '未命名')}`;
  
  document.getElementById('qr-title').textContent = `${config.name || '未命名'} - TOTP密钥`;
  
  const qrContainer = document.getElementById('qr-code');
  qrContainer.innerHTML = '';
  
  try {
    new QRCode(qrContainer, {
      text: otpauthUrl,
      width: 150,
      height: 150,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (error) {
    console.error('QR码生成失败:', error);
    qrContainer.innerHTML = '<p>QR码生成失败</p>';
  }
  
  document.getElementById('qr-modal').style.display = 'flex';
}

function closeQrModal() {
  document.getElementById('qr-modal').style.display = 'none';
}

function closeScanModal() {
  document.getElementById('qr-scan-modal').style.display = 'none';
  // 停止选择
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'stopQRSelection'});
  });
}

function showScanModal() {
  document.getElementById('qr-scan-modal').style.display = 'flex';
  document.getElementById('scan-result').innerHTML = '';
  document.getElementById('scan-result').className = 'scan-result';
}

function showScanResult(message, type = 'info') {
  const resultDiv = document.getElementById('scan-result');
  resultDiv.textContent = message;
  resultDiv.className = `scan-result ${type}`;
}

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
    
    // 从路径中提取账户名
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

async function addConfigFromQR(configData) {
  try {
    console.log('准备添加配置:', configData);
    console.log('当前配置列表:', configs);
    
    // 检查是否已存在相同配置
    const existingIndex = configs.findIndex(c => 
      c.key === configData.key || 
      (c.name === configData.name && c.issuer === configData.issuer)
    );
    
    if (existingIndex >= 0) {
      console.log('配置已存在，索引:', existingIndex);
      showScanResult('该配置已存在', 'error');
      return;
    }
    
    // 添加新配置
    configs.push(configData);
    console.log('添加后的配置列表:', configs);
    
    // 保存到存储
    await chrome.storage.sync.set({ totpConfigs: configs });
    console.log('配置已保存到存储');
    
    showScanResult(`成功导入配置: ${configData.name}`, 'success');
    
    // 更新显示
    setTimeout(() => {
      closeScanModal();
      updateTotpCodes();
    }, 1500);
    
  } catch (error) {
    console.error('保存配置失败:', error);
    showScanResult('保存配置失败: ' + error.message, 'error');
  }
}

function updateProgress() {
  const now = Math.floor(Date.now() / 1000);
  const timeLeft = 30 - (now % 30);
  const progress = (timeLeft / 30) * 100;
  
  document.getElementById('progress').style.width = progress + '%';
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showCopyFeedback();
  } catch (err) {
    console.error('复制失败:', err);
  }
}

function showCopyFeedback() {
  const feedback = document.createElement('div');
  feedback.className = 'copy-feedback';
  feedback.textContent = '已复制!';
  document.body.appendChild(feedback);
  
  setTimeout(() => {
    feedback.remove();
  }, 1000);
}

// 打开配置管理页面
function openConfigPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
}

// 开始二维码扫描 - 直接开始选择
function startQRScan() {
  console.log('开始二维码扫描');
  
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs.length === 0) {
      alert('无法获取当前标签页');
      return;
    }
    
    chrome.tabs.sendMessage(tabs[0].id, {action: 'startQRSelection'}, (response) => {
      if (chrome.runtime.lastError) {
        console.error('发送消息失败:', chrome.runtime.lastError);
        alert('无法在当前页面启动扫描功能');
        return;
      }
      // 关闭popup让用户选择区域
      window.close();
    });
  });
}

// 开始选择区域
function startSelection() {
  console.log('开始选择区域');
  
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs.length === 0) {
      showScanResult('无法获取当前标签页', 'error');
      return;
    }
    
    chrome.tabs.sendMessage(tabs[0].id, {action: 'startQRSelection'}, (response) => {
      if (chrome.runtime.lastError) {
        console.error('发送消息失败:', chrome.runtime.lastError);
        showScanResult('无法在当前页面启动扫描功能', 'error');
        return;
      }
      showScanResult('请在页面上选择二维码区域，完成后会自动导入', 'info');
    });
  });
}

// 页面加载时检查是否有扫描结果
document.addEventListener('DOMContentLoaded', () => {
  checkForScanResult();
});

// 检查扫描结果
function checkForScanResult() {
  chrome.storage.local.get(['qrScanResult'], (result) => {
    if (result.qrScanResult && result.qrScanResult.timestamp > Date.now() - 60000) {
      console.log('发现扫描结果:', result.qrScanResult);
      
      if (result.qrScanResult.action === 'qrCodeFound') {
        const configData = parseOtpauthUrl(result.qrScanResult.data);
        if (configData) {
          addConfigFromQR(configData);
          showScanModal(); // 显示扫描模态框以显示结果
        }
      }
      
      // 清除结果
      chrome.storage.local.remove(['qrScanResult']);
    }
  });
}

// 测试解析功能
function testQRParsing() {
  console.log('开始测试解析功能');
  
  const testData = 'otpauth://totp/Google:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Google';
  console.log('测试数据:', testData);
  
  const configData = parseOtpauthUrl(testData);
  console.log('解析结果:', configData);
  
  if (configData) {
    addConfigFromQR(configData);
  } else {
    showScanResult('解析失败', 'error');
  }
}

// 模拟接收到二维码数据
function simulateQRFound() {
  console.log('模拟接收二维码数据');
  
  const testData = 'otpauth://totp/TestService:user@test.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=TestService';
  
  // 直接调用处理函数
  const configData = parseOtpauthUrl(testData);
  if (configData) {
    addConfigFromQR(configData);
  } else {
    showScanResult('模拟数据解析失败', 'error');
  }
}

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  
  if (request.action === 'qrCodeFound') {
    const configData = parseOtpauthUrl(request.data);
    console.log('解析后的配置:', configData);
    
    if (configData) {
      addConfigFromQR(configData);
    } else {
      showScanResult('未识别到有效的TOTP配置', 'error');
    }
    sendResponse({received: true});
  } else if (request.action === 'qrCodeNotFound') {
    showScanResult('未在选择区域找到二维码', 'error');
    sendResponse({received: true});
  } else if (request.action === 'qrScanCancelled') {
    closeScanModal();
    sendResponse({received: true});
  }
  
  return true; // 保持消息通道开放
});

// 点击弹窗外部关闭
document.getElementById('qr-modal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeQrModal();
  }
});

document.getElementById('qr-scan-modal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeScanModal();
  }
});

// 事件监听器
document.getElementById('close-qr-btn').addEventListener('click', closeQrModal);
document.getElementById('config-btn').addEventListener('click', openConfigPage);
document.getElementById('scan-qr-btn').addEventListener('click', startQRScan);
document.getElementById('confirm-config-btn').addEventListener('click', confirmConfig);
document.getElementById('cancel-config-btn').addEventListener('click', closeConfigConfirmModal);

// 页面加载时检查待确认配置
checkPendingConfig();
updateTotpCodes();
updateProgress();

setInterval(() => {
  updateTotpCodes();
  updateProgress();
}, 1000);
