// 二维码扫描器内容脚本
let isSelecting = false;
let selectionOverlay = null;
let startX, startY, endX, endY;

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startQRSelection') {
        startSelection();
        sendResponse({success: true});
    } else if (request.action === 'stopQRSelection') {
        stopSelection();
        sendResponse({success: true});
    }
});

function startSelection() {
    if (isSelecting) return;
    
    isSelecting = true;
    document.body.style.cursor = 'crosshair';
    
    // 创建选择覆盖层
    createSelectionOverlay();
    
    // 添加事件监听器
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
}

function stopSelection() {
    if (!isSelecting) return;
    
    isSelecting = false;
    document.body.style.cursor = '';
    
    // 移除覆盖层
    if (selectionOverlay) {
        selectionOverlay.remove();
        selectionOverlay = null;
    }
    
    // 移除事件监听器
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
}

function createSelectionOverlay() {
    selectionOverlay = document.createElement('div');
    selectionOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.3);
        z-index: 999999;
        pointer-events: none;
    `;
    document.body.appendChild(selectionOverlay);
}

function onMouseDown(e) {
    if (!isSelecting) return;
    
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    
    // 创建选择框
    const selectionBox = document.createElement('div');
    selectionBox.id = 'qr-selection-box';
    selectionBox.style.cssText = `
        position: fixed;
        border: 2px dashed #4CAF50;
        background: rgba(76, 175, 80, 0.1);
        z-index: 1000000;
        pointer-events: none;
        left: ${startX}px;
        top: ${startY}px;
        width: 0;
        height: 0;
    `;
    document.body.appendChild(selectionBox);
}

function onMouseMove(e) {
    if (!isSelecting) return;
    
    const selectionBox = document.getElementById('qr-selection-box');
    if (!selectionBox) return;
    
    endX = e.clientX;
    endY = e.clientY;
    
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
}

function onMouseUp(e) {
    if (!isSelecting) return;
    
    const selectionBox = document.getElementById('qr-selection-box');
    if (selectionBox) {
        selectionBox.remove();
    }
    
    endX = e.clientX;
    endY = e.clientY;
    
    // 计算选择区域
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    if (width > 10 && height > 10) {
        captureSelectedArea(left, top, width, height);
    }
    
    stopSelection();
}

function onKeyDown(e) {
    if (e.key === 'Escape') {
        stopSelection();
        sendMessageToPopup('qrScanCancelled');
    }
}

function sendMessageToPopup(action, data = null) {
    try {
        chrome.runtime.sendMessage({
            action: action,
            data: data
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('消息发送失败:', chrome.runtime.lastError);
            } else {
                console.log('消息发送成功:', response);
            }
        });
    } catch (error) {
        console.error('发送消息失败:', error);
    }
}

function captureSelectedArea(left, top, width, height) {
    console.log('开始捕获区域:', left, top, width, height);
    
    // 查找选择区域内的所有图像元素
    const images = Array.from(document.querySelectorAll('img, canvas')).filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.left < left + width && 
               rect.right > left && 
               rect.top < top + height && 
               rect.bottom > top;
    });
    
    console.log('找到图像元素:', images.length);
    
    if (images.length > 0) {
        processImages(images);
    } else {
        // 尝试从DOM文本中查找otpauth链接
        findOtpauthInText(left, top, width, height);
    }
}

function processImages(images) {
    let processed = false;
    
    images.forEach(img => {
        if (processed) return;
        
        if (img.tagName === 'IMG' && img.complete && img.naturalWidth > 0) {
            if (analyzeImage(img)) {
                processed = true;
            }
        } else if (img.tagName === 'CANVAS') {
            console.log('分析Canvas');
            if (analyzeCanvas(img)) {
                processed = true;
            }
        }
    });
    
    if (!processed) {
        chrome.runtime.sendMessage({
            action: 'qrCodeNotFound'
        });
    }
}

function analyzeImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    
    try {
        // 检查图片是否跨域
        if (img.crossOrigin === undefined && img.src.startsWith('http') && !img.src.startsWith(window.location.origin)) {
            console.log('跨域图片，跳过分析');
            return false;
        }
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        console.log('图像数据:', imageData.width, 'x', imageData.height);
        
        // 使用jsQR解析二维码
        if (typeof jsQR !== 'undefined') {
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
                // 直接向popup发送消息
                chrome.runtime.sendMessage({
                    action: 'qrCodeFound',
                    data: code.data
                });
                return true;
            }
        } else {
            console.error('jsQR库未加载');
        }
    } catch (error) {
        if (error.name === 'SecurityError') {
            console.log('跨域图片无法分析，跳过');
        } else {
            console.error('图像分析失败:', error);
        }
    }
    
    return false;
}

function analyzeCanvas(canvas) {
    try {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        if (typeof jsQR !== 'undefined') {
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
                sendMessageToPopup('qrCodeFound', code.data);
                return true;
            }
        }
    } catch (error) {
        console.error('Canvas分析失败:', error);
    }
    
    return false;
}

function findOtpauthInText(left, top, width, height) {
    // 查找选择区域内的文本，看是否包含otpauth链接
    const elements = document.elementsFromPoint(left + width/2, top + height/2);
    
    for (let element of elements) {
        const text = element.textContent || element.innerText || '';
        const otpauthMatch = text.match(/otpauth:\/\/totp\/[^?\s]+\?[^?\s]+/i);
        if (otpauthMatch) {
            console.log('在文本中找到otpauth:', otpauthMatch[0]);
            chrome.runtime.sendMessage({
                action: 'qrCodeFound',
                data: otpauthMatch[0]
            });
            return;
        }
    }
    
    console.log('未找到二维码或otpauth链接');
    chrome.runtime.sendMessage({
        action: 'qrCodeNotFound'
    });
}
