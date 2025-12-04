// 后台服务工作器
class MonitorManager {
  constructor() {
    this.monitors = new Map();
    this.init();
  }

  // 验证Webhook URL安全性（防止SSRF攻击）
  validateWebhookUrl(urlString) {
    try {
      const url = new URL(urlString);

      // 只允许HTTP和HTTPS协议
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('只支持 HTTP 和 HTTPS 协议');
      }

      // 警告非HTTPS URL
      if (url.protocol === 'http:') {
        console.warn('警告: Webhook使用HTTP协议，建议使用HTTPS');
      }

      // 获取hostname
      const hostname = url.hostname.toLowerCase();

      // 禁止localhost和127.0.0.1
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        throw new Error('禁止访问本地地址');
      }

      // 检查IPv4地址
      const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const ipv4Match = hostname.match(ipv4Pattern);

      if (ipv4Match) {
        const parts = ipv4Match.slice(1, 5).map(Number);

        // 验证每个八位组的范围
        if (parts.some(part => part > 255)) {
          throw new Error('无效的IPv4地址');
        }

        // 检查私有IP范围和特殊地址
        if (
          parts[0] === 0 || // 0.0.0.0/8 (current network)
          parts[0] === 10 || // 10.0.0.0/8 (private)
          parts[0] === 127 || // 127.0.0.0/8 (loopback - 完整回环地址范围)
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12 (private)
          (parts[0] === 169 && parts[1] === 254) || // 169.254.0.0/16 (link-local)
          (parts[0] === 192 && parts[1] === 168) || // 192.168.0.0/16 (private)
          (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) || // 192.0.0.0/24
          (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) || // 192.0.2.0/24 (TEST-NET-1)
          (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) || // 198.18.0.0/15 (benchmark)
          (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) || // 198.51.100.0/24 (TEST-NET-2)
          (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) || // 203.0.113.0/24 (TEST-NET-3)
          (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // 100.64.0.0/10 (CGN)
          parts[0] >= 224 // 224.0.0.0/4 (multicast), 240+ (reserved/broadcast)
        ) {
          throw new Error('禁止访问私有IP地址或特殊用途地址');
        }
      }

      // 检查IPv6地址
      if (hostname.includes(':')) {
        const lower = hostname.toLowerCase();

        // 禁止回环地址
        if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') {
          throw new Error('禁止访问本地地址');
        }

        // 禁止IPv4映射的IPv6地址 (::ffff:x.x.x.x)
        if (lower.includes('::ffff:')) {
          throw new Error('禁止使用IPv4映射的IPv6地址');
        }

        // 禁止唯一本地地址 (fc00::/7 - 包括fc和fd开头)
        if (lower.startsWith('fc') || lower.startsWith('fd')) {
          throw new Error('禁止访问IPv6私有地址');
        }

        // 禁止链路本地地址 (fe80::/10)
        if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
            lower.startsWith('fea') || lower.startsWith('feb')) {
          throw new Error('禁止访问IPv6链路本地地址');
        }

        // 禁止站点本地地址 (fec0::/10 - 已废弃)
        if (lower.startsWith('fec') || lower.startsWith('fed') ||
            lower.startsWith('fee') || lower.startsWith('fef')) {
          throw new Error('禁止访问IPv6站点本地地址');
        }

        // 禁止多播地址 (ff00::/8)
        if (lower.startsWith('ff')) {
          throw new Error('禁止访问IPv6多播地址');
        }

        // 禁止未指定地址 (::)
        if (lower === '::' || lower === '0:0:0:0:0:0:0:0') {
          throw new Error('禁止使用未指定的IPv6地址');
        }
      }

      // 禁止内网域名
      if (hostname.endsWith('.local') || hostname.endsWith('.internal') ||
          hostname.endsWith('.localhost')) {
        throw new Error('禁止访问内网域名');
      }

      return true;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('无效的URL格式');
      }
      throw error;
    }
  }

  async init() {
    // 加载已保存的项目并启动活动监控
    const data = await chrome.storage.local.get(['projects']);
    const projects = data.projects || [];

    projects.forEach(project => {
      if (project.active) {
        this.startMonitor(project);
      }
    });

    // 监听消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // 异步处理消息
      this.handleMessage(message, sender, sendResponse).catch(error => {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // 保持消息通道开放以支持异步响应
    });

    // 注意: 现在使用临时标签页,不需要监听标签页关闭事件
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'startMonitor':
          this.startMonitor(message.project);
          sendResponse({ success: true });
          break;
        case 'stopMonitor':
          this.stopMonitor(message.projectId);
          sendResponse({ success: true });
          break;
        case 'getProjectLogs':
          const logs = await this.getProjectLogs(message.projectId);
          sendResponse({ success: true, logs });
          break;
        case 'clearProjectLogs':
          await this.clearProjectLogs(message.projectId);
          sendResponse({ success: true });
          break;
        case 'elementSelected':
          // 创建新项目
          const project = {
            id: Date.now().toString(),
            name: message.name || `监控-${new Date().toLocaleString()}`,
            url: message.url,
            selector: message.selector,
            interval: message.interval || 30000,
            active: true,
            browserNotification: message.browserNotification !== false,
            webhook: message.webhook || { enabled: false },
            lastContent: message.initialContent,
            tabId: sender.tab?.id || null
          };

          // 保存到storage
          const data = await chrome.storage.local.get(['projects']);
          const projects = data.projects || [];
          projects.push(project);
          await chrome.storage.local.set({ projects });

          console.log('Project saved:', project);

          // 启动监控
          this.startMonitor(project);

          sendResponse({ success: true, projectId: project.id });
          break;
        case 'updateProject':
          // 更新现有项目
          const updateData = await chrome.storage.local.get(['projects']);
          const updateProjects = updateData.projects || [];
          const projectIndex = updateProjects.findIndex(p => p.id === message.projectId);

          if (projectIndex === -1) {
            sendResponse({ success: false, error: 'Project not found' });
            break;
          }

          const existingProject = updateProjects[projectIndex];

          // 更新项目信息，保留active状态和lastContent(除非提供了新的)
          updateProjects[projectIndex] = {
            ...existingProject,
            name: message.name,
            selector: message.selector,
            interval: message.interval,
            browserNotification: message.browserNotification,
            webhook: message.webhook || { enabled: false },
            lastContent: message.initialContent || existingProject.lastContent
          };

          await chrome.storage.local.set({ projects: updateProjects });

          console.log('Project updated:', updateProjects[projectIndex]);

          // 如果项目是活跃的，重新启动监控
          if (updateProjects[projectIndex].active) {
            this.stopMonitor(message.projectId);
            this.startMonitor(updateProjects[projectIndex]);
          }

          sendResponse({ success: true, projectId: message.projectId });
          break;
        case 'testBrowserNotification':
          // 测试浏览器通知
          chrome.notifications.create(
            {
              type: 'basic',
              iconUrl: chrome.runtime.getURL('icons/icon128.png'),
              title: 'Div Ping - 测试通知',
              message: '这是一条测试通知\n\n如果你看到这条消息，说明浏览器通知配置正常！',
              priority: 2
            },
            (notificationId) => {
              if (chrome.runtime.lastError) {
                console.error('Notification error:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
              } else {
                console.log('Notification created:', notificationId);
                sendResponse({ success: true, notificationId });
              }
            }
          );
          break;
        case 'testWebhook':
          // 测试Webhook
          try {
            const testResult = await this.testWebhook(message.config);
            sendResponse({ success: true, status: testResult.status, statusText: testResult.statusText });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          break;
        default:
          sendResponse({ success: false, error: 'Unknown action: ' + message.action });
      }
    } catch (error) {
      console.error('Error in handleMessage:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  startMonitor(project) {
    // 停止已存在的监控
    this.stopMonitor(project.id);

    console.log(`Starting monitor for project: ${project.name}`);

    // 创建定时器
    const intervalId = setInterval(() => {
      this.checkElement(project);
    }, project.interval);

    this.monitors.set(project.id, {
      intervalId,
      project
    });

    // 立即检查一次
    this.checkElement(project);
  }

  stopMonitor(projectId) {
    const monitor = this.monitors.get(projectId);
    if (monitor) {
      console.log(`Stopping monitor for project: ${monitor.project.name}`);
      clearInterval(monitor.intervalId);
      this.monitors.delete(projectId);
    }
  }


  async checkElement(project) {
    let tempTab = null;

    try {
      console.log(`[${project.name}] Opening temp tab for URL: ${project.url}`);

      // 在新标签页中打开URL (后台打开,尽可能不打扰用户)
      tempTab = await chrome.tabs.create({
        url: project.url,
        active: false,  // 不激活标签页
        pinned: false   // 不固定标签页
      });

      // 等待页面加载完成
      await this.waitForTabLoad(tempTab.id);

      // 向content script发送检查请求
      const response = await chrome.tabs.sendMessage(tempTab.id, {
        action: 'checkElement',
        selector: project.selector
      });

      if (response.success) {
        const newContent = response.content;

        console.log(`[${project.name}] Content retrieved, length: ${newContent.length}`);

        // 从storage重新读取最新的项目配置，确保使用最新的lastContent和通知设置
        const data = await chrome.storage.local.get(['projects']);
        const projects = data.projects || [];
        const latestProject = projects.find(p => p.id === project.id);

        // 使用最新的lastContent进行比较
        const currentLastContent = latestProject ? latestProject.lastContent : project.lastContent;

        // 检查内容是否变化（基于上一次的内容）
        const hasChanged = currentLastContent && newContent !== currentLastContent;

        if (hasChanged) {
          console.log(`[${project.name}] Content changed!`);

          if (latestProject) {
            this.notifyChange(latestProject, currentLastContent, newContent);
          } else {
            this.notifyChange(project, currentLastContent, newContent);
          }
        } else {
          console.log(`[${project.name}] No change detected`);
        }

        // 记录日志
        await this.addLog(project.id, {
          timestamp: new Date().toISOString(),
          content: newContent,
          oldContent: currentLastContent || null,
          changed: hasChanged,
          success: true
        });

        // 更新最后内容为当前检测到的内容
        await this.updateProjectContent(project.id, newContent);
      } else {
        console.error(`[${project.name}] Failed to check element: ${response.error}`);

        // 记录失败日志
        await this.addLog(project.id, {
          timestamp: new Date().toISOString(),
          error: response.error,
          success: false
        });
      }
    } catch (error) {
      console.error(`[${project.name}] Error checking element:`, error);

      // 记录失败日志
      await this.addLog(project.id, {
        timestamp: new Date().toISOString(),
        error: error.message || 'Unknown error',
        success: false
      });
    } finally {
      // 关闭临时标签页
      if (tempTab && tempTab.id) {
        try {
          await chrome.tabs.remove(tempTab.id);
          console.log(`[${project.name}] Temp tab closed`);
        } catch (closeError) {
          console.error(`[${project.name}] Failed to close temp tab:`, closeError);
        }
      }
    }
  }

  async waitForTabLoad(tabId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkStatus = () => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error('Tab not found'));
            return;
          }

          if (tab.status === 'complete') {
            // 等待额外500ms确保content script已加载
            setTimeout(() => resolve(), 500);
          } else if (Date.now() - startTime > timeout) {
            reject(new Error('Timeout waiting for tab to load'));
          } else {
            setTimeout(checkStatus, 100);
          }
        });
      };

      checkStatus();
    });
  }

  async updateProjectContent(projectId, content) {
    const data = await chrome.storage.local.get(['projects']);
    const projects = data.projects || [];
    const project = projects.find(p => p.id === projectId);

    if (project) {
      project.lastContent = content;
      project.lastChecked = new Date().toISOString();
      await chrome.storage.local.set({ projects });
    }
  }

  async addLog(projectId, logEntry) {
    const data = await chrome.storage.local.get(['logs']);
    const logs = data.logs || {};

    // 初始化项目日志数组
    if (!logs[projectId]) {
      logs[projectId] = [];
    }

    // 添加日志(最多保留100条)
    logs[projectId].unshift(logEntry);
    if (logs[projectId].length > 100) {
      logs[projectId] = logs[projectId].slice(0, 100);
    }

    await chrome.storage.local.set({ logs });
  }

  async getProjectLogs(projectId) {
    const data = await chrome.storage.local.get(['logs']);
    const logs = data.logs || {};
    return logs[projectId] || [];
  }

  async clearProjectLogs(projectId) {
    const data = await chrome.storage.local.get(['logs']);
    const logs = data.logs || {};
    delete logs[projectId];
    await chrome.storage.local.set({ logs });
  }

  async notifyChange(project, oldContent, newContent) {
    const message = `元素内容已变化!\n\n项目: ${project.name}\n页面: ${project.url}`;

    // 浏览器通知
    if (project.browserNotification) {
      chrome.notifications.create(
        {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: 'Div Ping - 元素变化检测',
          message: message,
          priority: 2
        },
        (notificationId) => {
          if (chrome.runtime.lastError) {
            console.error('Failed to create notification:', chrome.runtime.lastError);
          } else {
            console.log('Change notification created:', notificationId);
          }
        }
      );
    }

    // Webhook通知 - 支持新旧格式
    const webhook = project.webhook || (project.webhookUrl ? { enabled: true, url: project.webhookUrl, method: 'POST' } : null);

    if (webhook?.enabled && webhook.url) {
      try {
        await this.sendWebhook(webhook, project, oldContent, newContent);
        console.log('Webhook notification sent successfully');
      } catch (error) {
        console.error('Failed to send webhook notification:', error);
      }
    }
  }

  // 变量替换函数
  replaceVariables(template, variables) {
    if (!template) return template;

    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, encodeURIComponent(String(value)));
    }
    return result;
  }

  // 发送Webhook
  async sendWebhook(webhook, project, oldContent, newContent) {
    const timestamp = new Date().toISOString();

    // 验证Webhook URL（防止SSRF）
    try {
      this.validateWebhookUrl(webhook.url);
    } catch (error) {
      console.error('Webhook URL验证失败:', error.message);
      throw new Error(`Webhook URL验证失败: ${error.message}`);
    }

    // 可用变量
    const variables = {
      projectId: project.id,
      projectName: project.name,
      url: project.url,
      selector: project.selector,
      oldContent: oldContent,
      newContent: newContent,
      timestamp: timestamp
    };

    // 替换URL中的变量
    let url = webhook.url;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      url = url.replace(regex, encodeURIComponent(String(value)));
    }

    // 再次验证替换后的URL
    try {
      this.validateWebhookUrl(url);
    } catch (error) {
      console.error('替换变量后的URL验证失败:', error.message);
      throw new Error(`替换变量后的URL验证失败: ${error.message}`);
    }

    // 准备请求配置
    const fetchOptions = {
      method: webhook.method || 'POST'
    };

    // 处理请求头
    let headers = {};
    if (webhook.headers) {
      try {
        const customHeaders = typeof webhook.headers === 'string'
          ? JSON.parse(webhook.headers)
          : webhook.headers;

        // 替换请求头中的变量
        for (const [key, value] of Object.entries(customHeaders)) {
          headers[key] = this.replaceVariables(value, variables).replace(/%/g, ''); // 解码用于headers
        }
      } catch (error) {
        console.error('Failed to parse webhook headers:', error);
      }
    }
    if (Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }

    // 处理请求体 (仅POST/PUT/PATCH)
    if (['POST', 'PUT', 'PATCH'].includes(fetchOptions.method.toUpperCase())) {
      if (webhook.body) {
        try {
          // 用户自定义body
          const bodyTemplate = typeof webhook.body === 'string'
            ? webhook.body
            : JSON.stringify(webhook.body);

          // 替换变量(不编码,因为是JSON内容)
          let bodyStr = bodyTemplate;
          for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            bodyStr = bodyStr.replace(regex, JSON.stringify(String(value)));
          }

          // 验证JSON并设置body
          const bodyContent = JSON.parse(bodyStr);
          fetchOptions.body = JSON.stringify(bodyContent);
        } catch (error) {
          console.error('Failed to parse webhook body:', error);
          // 如果JSON解析失败，记录错误但不使用默认值
        }
      }
      // 如果webhook.body为空，则不设置body
    }

    // 发送请求（带超时控制）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Webhook请求超时（10秒）');
      }
      throw error;
    }
  }

  // 测试Webhook
  async testWebhook(config) {
    const timestamp = new Date().toISOString();

    // 验证Webhook URL（防止SSRF）
    try {
      this.validateWebhookUrl(config.url);
    } catch (error) {
      console.error('Webhook URL验证失败:', error.message);
      throw new Error(`Webhook URL验证失败: ${error.message}`);
    }

    // 测试用变量
    const variables = {
      projectId: 'test-project-id',
      projectName: '测试项目',
      url: 'https://example.com',
      selector: '.test-selector',
      oldContent: '旧内容示例',
      newContent: '新内容示例',
      timestamp: timestamp
    };

    // 替换URL中的变量
    let url = config.url;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      url = url.replace(regex, encodeURIComponent(String(value)));
    }

    // 再次验证替换后的URL
    try {
      this.validateWebhookUrl(url);
    } catch (error) {
      console.error('替换变量后的URL验证失败:', error.message);
      throw new Error(`替换变量后的URL验证失败: ${error.message}`);
    }

    // 准备请求配置
    const fetchOptions = {
      method: config.method || 'POST'
    };

    // 处理请求头
    let headers = {};
    if (config.headers) {
      try {
        const customHeaders = typeof config.headers === 'string'
          ? JSON.parse(config.headers)
          : config.headers;

        // 替换请求头中的变量
        for (const [key, value] of Object.entries(customHeaders)) {
          headers[key] = this.replaceVariables(value, variables).replace(/%/g, ''); // 解码用于headers
        }
      } catch (error) {
        console.error('Failed to parse webhook headers:', error);
      }
    }
    if (Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }

    // 处理请求体 (仅POST/PUT/PATCH)
    if (['POST', 'PUT', 'PATCH'].includes(fetchOptions.method.toUpperCase())) {
      if (config.body) {
        try {
          // 用户自定义body
          const bodyTemplate = typeof config.body === 'string'
            ? config.body
            : JSON.stringify(config.body);

          // 替换变量(不编码,因为是JSON内容)
          let bodyStr = bodyTemplate;
          for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            bodyStr = bodyStr.replace(regex, JSON.stringify(String(value)));
          }

          // 验证JSON并设置body
          const bodyContent = JSON.parse(bodyStr);
          fetchOptions.body = JSON.stringify(bodyContent);
        } catch (error) {
          console.error('Failed to parse webhook body:', error);
          throw new Error('请求体JSON格式错误: ' + error.message);
        }
      }
      // 如果config.body为空，则不设置body
    }

    // 发送请求（带超时控制）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // 返回响应（无论成功还是失败，让调用方处理）
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Webhook请求超时（10秒）');
      }
      throw error;
    }
  }
}

// 初始化监控管理器
const monitorManager = new MonitorManager();

// 安装时请求通知权限
chrome.runtime.onInstalled.addListener(() => {
  console.log('Div Ping extension installed');
});
