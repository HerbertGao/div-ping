import { Project, WebhookConfig, LogEntry, MessageRequest, MessageResponse } from './types';
import * as ipaddr from 'ipaddr.js';
import { storageManager } from './storageManager';
import { TIMEOUTS } from './constants';

// 监控信息接口（不再需要 intervalId）
interface MonitorInfo {
  project: Project;
}

// Webhook变量接口
interface WebhookVariables {
  projectId: string;
  projectName: string;
  url: string;
  selector: string;
  oldContent: string;
  newContent: string;
  timestamp: string;
}

// 后台服务工作器
class MonitorManager {
  private monitors: Map<string, MonitorInfo> = new Map();
  private tabCache: Map<string, number> = new Map(); // 缓存每个URL对应的标签页ID

  constructor() {
    this.init();
    this.setupTabCleanup();
  }

  // 设置标签页清理监听器
  private setupTabCleanup(): void {
    // 监听标签页关闭事件，清理缓存
    chrome.tabs.onRemoved.addListener((tabId) => {
      // 查找并删除缓存中的标签页
      for (const [url, cachedTabId] of this.tabCache.entries()) {
        if (cachedTabId === tabId) {
          this.tabCache.delete(url);
          console.log(`Tab ${tabId} for URL ${url} closed, removed from cache`);
          break;
        }
      }
    });

    // 监听标签页更新事件（URL改变时更新缓存）
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.url) {
        // 移除旧URL的缓存
        for (const [url, cachedTabId] of this.tabCache.entries()) {
          if (cachedTabId === tabId) {
            this.tabCache.delete(url);
            break;
          }
        }
        // 添加新URL的缓存
        this.tabCache.set(changeInfo.url, tabId);
      }
    });
  }

  // 验证Webhook URL安全性（防止SSRF攻击）
  private validateWebhookUrl(urlString: string): boolean {
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

      // 禁止特定的localhost主机名
      if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        throw new Error('禁止访问本地地址');
      }

      // 禁止内网域名后缀
      if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        throw new Error('禁止访问内网域名');
      }

      // 尝试解析为IP地址
      if (ipaddr.isValid(hostname)) {
        const addr = ipaddr.parse(hostname);

        // 检查IP地址范围
        const range = addr.range();

        // 禁止的IP地址范围
        const forbiddenRanges = [
          'unspecified',    // 0.0.0.0 或 ::
          'broadcast',      // 255.255.255.255
          'multicast',      // 224.0.0.0/4 或 ff00::/8
          'linkLocal',      // 169.254.0.0/16 或 fe80::/10
          'loopback',       // 127.0.0.0/8 或 ::1
          'private',        // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 或 fc00::/7
          'reserved',       // 保留地址
          'carrierGradeNat', // 100.64.0.0/10
          'uniqueLocal'     // IPv6 唯一本地地址 fc00::/7
        ];

        if (forbiddenRanges.includes(range)) {
          throw new Error(`禁止访问${range}类型的IP地址`);
        }

        // IPv4特殊检查：测试网络和基准测试网络
        if (addr.kind() === 'ipv4') {
          const bytes = addr.toByteArray();

          // 192.0.0.0/24 (IETF协议分配)
          if (bytes[0] === 192 && bytes[1] === 0 && bytes[2] === 0) {
            throw new Error('禁止访问IETF协议分配地址段');
          }

          // 192.0.2.0/24 (TEST-NET-1)
          if (bytes[0] === 192 && bytes[1] === 0 && bytes[2] === 2) {
            throw new Error('禁止访问测试网络地址');
          }

          // 198.18.0.0/15 (基准测试)
          if (bytes[0] === 198 && (bytes[1] === 18 || bytes[1] === 19)) {
            throw new Error('禁止访问基准测试地址段');
          }

          // 198.51.100.0/24 (TEST-NET-2)
          if (bytes[0] === 198 && bytes[1] === 51 && bytes[2] === 100) {
            throw new Error('禁止访问测试网络地址');
          }

          // 203.0.113.0/24 (TEST-NET-3)
          if (bytes[0] === 203 && bytes[1] === 0 && bytes[2] === 113) {
            throw new Error('禁止访问测试网络地址');
          }
        }

        // IPv6特殊检查：IPv4映射地址
        if (addr.kind() === 'ipv6') {
          const ipv6Addr = addr as ipaddr.IPv6;
          if (ipv6Addr.isIPv4MappedAddress()) {
            // 获取映射的IPv4地址并递归检查
            const ipv4 = ipv6Addr.toIPv4Address();
            const ipv4Range = ipv4.range();

            if (forbiddenRanges.includes(ipv4Range)) {
              throw new Error(`禁止使用映射到${ipv4Range}类型的IPv4地址`);
            }
          }
        }
      }

      return true;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('无效的URL格式');
      }
      throw error;
    }
  }

  private async init(): Promise<void> {
    // 加载已保存的项目并启动活动监控
    const projects = await storageManager.getProjects();

    projects.forEach(project => {
      if (project.active) {
        this.startMonitor(project);
      }
    });

    // 监听消息
    chrome.runtime.onMessage.addListener((message: MessageRequest, sender: chrome.runtime.MessageSender, sendResponse: (response: MessageResponse) => void) => {
      // 异步处理消息
      this.handleMessage(message, sender, sendResponse).catch(error => {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      });
      return true; // 保持消息通道开放以支持异步响应
    });

    // 注意: 现在使用临时标签页,不需要监听标签页关闭事件
  }

  private async handleMessage(message: MessageRequest, sender: chrome.runtime.MessageSender, sendResponse: (response: MessageResponse) => void): Promise<void> {
    try {
      switch (message.action) {
        case 'startMonitor':
          if (!message.project) {
            sendResponse({ success: false, error: 'Project is required' });
            break;
          }
          this.startMonitor(message.project);
          sendResponse({ success: true });
          break;

        case 'stopMonitor':
          if (!message.projectId) {
            sendResponse({ success: false, error: 'ProjectId is required' });
            break;
          }
          this.stopMonitor(message.projectId);
          sendResponse({ success: true });
          break;

        case 'getProjectLogs': {
          if (!message.projectId) {
            sendResponse({ success: false, error: 'ProjectId is required' });
            break;
          }
          const logs = await this.getProjectLogs(message.projectId);
          sendResponse({ success: true, logs });
          break;
        }

        case 'clearProjectLogs': {
          if (!message.projectId) {
            sendResponse({ success: false, error: 'ProjectId is required' });
            break;
          }
          await this.clearProjectLogs(message.projectId);
          sendResponse({ success: true });
          break;
        }

        case 'elementSelected': {
          // 创建新项目
          if (!message.url || !message.selector) {
            sendResponse({ success: false, error: 'URL and selector are required' });
            break;
          }

          const project: Project = {
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
          await storageManager.addProject(project);

          console.log('Project saved:', project);

          // 启动监控
          this.startMonitor(project);

          sendResponse({ success: true, projectId: project.id });
          break;
        }

        case 'updateProject': {
          // 更新现有项目
          if (!message.projectId || !message.name || !message.selector || message.interval === undefined || message.browserNotification === undefined) {
            sendResponse({ success: false, error: 'Required fields missing for update' });
            break;
          }

          // 使用 storageManager 原子性更新
          const updatedProject = await storageManager.updateProject(message.projectId, {
            name: message.name,
            selector: message.selector,
            interval: message.interval,
            browserNotification: message.browserNotification,
            webhook: message.webhook || { enabled: false },
            lastContent: message.initialContent
          });

          if (!updatedProject) {
            sendResponse({ success: false, error: 'Project not found' });
            break;
          }

          console.log('Project updated:', updatedProject);

          // 如果项目是活跃的，重新启动监控
          if (updatedProject.active) {
            this.stopMonitor(message.projectId);
            this.startMonitor(updatedProject);
          }

          sendResponse({ success: true, projectId: message.projectId });
          break;
        }

        case 'testBrowserNotification': {
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
        }

        case 'testWebhook': {
          // 测试Webhook
          if (!message.config) {
            sendResponse({ success: false, error: 'Webhook config is required' });
            break;
          }
          try {
            const testResult = await this.testWebhook(message.config);
            sendResponse({ success: true, status: testResult.status, statusText: testResult.statusText });
          } catch (error) {
            sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
          }
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown action: ' + message.action });
      }
    } catch (error) {
      console.error('Error in handleMessage:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private startMonitor(project: Project): void {
    // 停止已存在的监控
    this.stopMonitor(project.id);

    console.log(`Starting monitor for project: ${project.name}`);

    // 使用 chrome.alarms API 代替 setInterval
    // alarm 名称使用 project.id 作为标识
    const alarmName = `monitor_${project.id}`;

    // 创建周期性 alarm，间隔时间转换为分钟（alarms API 最小间隔是 1 分钟）
    const periodInMinutes = Math.max(1, project.interval / 60000);

    chrome.alarms.create(alarmName, {
      delayInMinutes: 0, // 立即触发第一次
      periodInMinutes: periodInMinutes
    });

    // 保存监控信息
    this.monitors.set(project.id, {
      project
    });

    console.log(`Alarm created: ${alarmName} with period ${periodInMinutes} minutes`);

    // 立即检查一次（不等待 alarm 触发）
    this.checkElement(project);
  }

  private stopMonitor(projectId: string): void {
    const monitor = this.monitors.get(projectId);
    if (monitor) {
      console.log(`Stopping monitor for project: ${monitor.project.name}`);

      // 清除 alarm
      const alarmName = `monitor_${projectId}`;
      chrome.alarms.clear(alarmName);

      this.monitors.delete(projectId);
    }
  }

  /**
   * 获取或创建用于检测的标签页
   * 优先重用已存在的标签页，减少资源消耗
   */
  private async getOrCreateTab(url: string): Promise<chrome.tabs.Tab> {
    // 1. 检查缓存中是否有该URL的标签页
    const cachedTabId = this.tabCache.get(url);
    if (cachedTabId) {
      try {
        const tab = await chrome.tabs.get(cachedTabId);
        // 验证标签页是否仍然有效且URL匹配
        if (tab && tab.url === url) {
          console.log(`Reusing cached tab ${cachedTabId} for URL: ${url}`);
          return tab;
        } else {
          // 缓存失效，清理
          this.tabCache.delete(url);
        }
      } catch {
        // 标签页已不存在，清理缓存
        this.tabCache.delete(url);
      }
    }

    // 2. 查询是否有其他打开的标签页
    const existingTabs = await chrome.tabs.query({ url });
    if (existingTabs.length > 0) {
      const tab = existingTabs[0];
      console.log(`Found existing tab ${tab.id} for URL: ${url}`);
      // 更新缓存
      this.tabCache.set(url, tab.id!);
      return tab;
    }

    // 3. 创建新标签页（后台打开）
    console.log(`Creating new background tab for URL: ${url}`);
    const newTab = await chrome.tabs.create({
      url,
      active: false,  // 不激活标签页
      pinned: false   // 不固定标签页
    });

    // 添加到缓存
    this.tabCache.set(url, newTab.id!);

    return newTab;
  }

  public async checkElement(project: Project): Promise<void> {
    let tab: chrome.tabs.Tab | null = null;
    let isNewlyCreatedTab = false;

    try {
      console.log(`[${project.name}] Getting or creating tab for URL: ${project.url}`);

      // 获取或创建标签页（优先重用现有标签页）
      // 跟踪缓存状态以确定是否为新创建的标签页
      const initialCacheSize = this.tabCache.size;
      const hadCachedTab = this.tabCache.has(project.url);

      tab = await this.getOrCreateTab(project.url);

      // 只有在以下情况才关闭标签页：
      // 1. 之前缓存中没有这个URL
      // 2. 缓存大小增加了（说明是新创建的标签页，而不是通过query找到的）
      isNewlyCreatedTab = !hadCachedTab && this.tabCache.size > initialCacheSize;

      // 等待页面加载完成
      await this.waitForTabLoad(tab.id!);

      // 向content script发送检查请求
      const response = await chrome.tabs.sendMessage(tab.id!, {
        action: 'checkElement',
        selector: project.selector
      });

      if (response.success) {
        const newContent: string = response.content;

        console.log(`[${project.name}] Content retrieved, length: ${newContent.length}`);

        // 从storage重新读取最新的项目配置，确保使用最新的lastContent和通知设置
        const projects = await storageManager.getProjects();
        const latestProject = projects.find(p => p.id === project.id);

        // 使用最新的lastContent进行比较
        const currentLastContent = latestProject ? latestProject.lastContent : project.lastContent;

        // 检查内容是否变化（基于上一次的内容）
        const hasChanged = currentLastContent && newContent !== currentLastContent;

        if (hasChanged) {
          console.log(`[${project.name}] Content changed!`);

          if (latestProject) {
            this.notifyChange(latestProject, currentLastContent!, newContent);
          } else {
            this.notifyChange(project, currentLastContent!, newContent);
          }
        } else {
          console.log(`[${project.name}] No change detected`);
        }

        // 记录日志
        await this.addLog(project.id, {
          timestamp: new Date().toISOString(),
          content: newContent,
          oldContent: currentLastContent || null,
          changed: hasChanged || false,
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
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
    } finally {
      // 只关闭新创建的临时标签页，不关闭重用的标签页
      if (isNewlyCreatedTab && tab?.id) {
        try {
          await chrome.tabs.remove(tab.id);
          this.tabCache.delete(project.url);
          console.log(`[${project.name}] Temp tab closed`);
        } catch (closeError) {
          console.error(`[${project.name}] Failed to close temp tab:`, closeError);
        }
      } else if (tab?.id) {
        console.log(`[${project.name}] Reused tab ${tab.id}, keeping it open`);
      }
    }
  }

  private async waitForTabLoad(tabId: number, timeout: number = TIMEOUTS.TAB_LOAD): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkStatus = (): void => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error('Tab not found'));
            return;
          }

          if (tab.status === 'complete') {
            // 等待额外时间确保content script已加载
            setTimeout(() => resolve(), TIMEOUTS.TAB_LOAD_EXTRA_DELAY);
          } else if (Date.now() - startTime > timeout) {
            reject(new Error('Timeout waiting for tab to load'));
          } else {
            setTimeout(checkStatus, TIMEOUTS.TAB_STATUS_CHECK);
          }
        });
      };

      checkStatus();
    });
  }

  private async updateProjectContent(projectId: string, content: string): Promise<void> {
    await storageManager.updateProject(projectId, {
      lastContent: content,
      lastChecked: new Date().toISOString()
    });
  }

  private async addLog(projectId: string, logEntry: LogEntry): Promise<void> {
    await storageManager.addLog(projectId, logEntry);
  }

  private async getProjectLogs(projectId: string): Promise<LogEntry[]> {
    return storageManager.getProjectLogs(projectId);
  }

  private async clearProjectLogs(projectId: string): Promise<void> {
    await storageManager.clearProjectLogs(projectId);
  }

  private async notifyChange(project: Project, oldContent: string, newContent: string): Promise<void> {
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

    // Webhook通知
    const webhook = project.webhook;

    if (webhook?.enabled && webhook.url) {
      try {
        await this.sendWebhook(webhook, project, oldContent, newContent);
        console.log('Webhook notification sent successfully');
      } catch (error) {
        console.error('Failed to send webhook notification:', error);
      }
    }
  }

  // 变量替换函数 - 用于URL参数
  private replaceVariablesInUrl(template: string, variables: WebhookVariables): string {
    if (!template) return template;

    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, encodeURIComponent(String(value)));
    }
    return result;
  }

  // 变量替换函数 - 用于请求头（不使用URL编码）
  private replaceVariablesInHeader(template: string, variables: WebhookVariables): string {
    if (!template) return template;

    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      // 对于HTTP头，只替换值，不进行URL编码
      // 移除控制字符和换行符以防止头注入攻击
      const sanitizedValue = String(value).replace(/[\r\n\x00-\x1F\x7F]/g, '');
      result = result.replace(regex, sanitizedValue);
    }
    return result;
  }

  // 变量替换函数 - 用于JSON body（正确处理JSON字符串转义）
  private replaceVariablesInJson(template: string, variables: WebhookVariables): string {
    if (!template) return template;

    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      // 将值转为JSON字符串，然后移除外层引号
      // 这样可以正确处理字符串中的特殊字符（如双引号、换行符等）
      const jsonValue = JSON.stringify(String(value));
      // 移除 JSON.stringify 添加的外层引号
      const valueWithoutOuterQuotes = jsonValue.slice(1, -1);
      result = result.replace(regex, valueWithoutOuterQuotes);
    }
    return result;
  }

  // 发送Webhook
  private async sendWebhook(webhook: WebhookConfig, project: Project, oldContent: string, newContent: string): Promise<Response> {
    const timestamp = new Date().toISOString();

    if (!webhook.url) {
      throw new Error('Webhook URL is required');
    }

    // 验证Webhook URL（防止SSRF）
    try {
      this.validateWebhookUrl(webhook.url);
    } catch (error) {
      console.error('Webhook URL验证失败:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`Webhook URL验证失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 可用变量
    const variables: WebhookVariables = {
      projectId: project.id,
      projectName: project.name,
      url: project.url,
      selector: project.selector,
      oldContent: oldContent,
      newContent: newContent,
      timestamp: timestamp
    };

    // 替换URL中的变量
    let url = this.replaceVariablesInUrl(webhook.url, variables);

    // 再次验证替换后的URL
    try {
      this.validateWebhookUrl(url);
    } catch (error) {
      console.error('替换变量后的URL验证失败:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`替换变量后的URL验证失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 准备请求配置
    const fetchOptions: RequestInit = {
      method: webhook.method || 'POST',
      redirect: 'manual'  // 防止重定向到内网地址（SSRF保护）
    };

    // 处理请求头
    const headers: Record<string, string> = {};
    if (webhook.headers) {
      try {
        const customHeaders = typeof webhook.headers === 'string'
          ? JSON.parse(webhook.headers)
          : webhook.headers;

        // 替换请求头中的变量
        for (const [key, value] of Object.entries(customHeaders)) {
          headers[key] = this.replaceVariablesInHeader(String(value), variables);
        }
      } catch (error) {
        console.error('Failed to parse webhook headers:', error);
      }
    }
    if (Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }

    // 处理请求体 (仅POST/PUT/PATCH)
    if (['POST', 'PUT', 'PATCH'].includes((fetchOptions.method as string).toUpperCase())) {
      if (webhook.body) {
        try {
          // 用户自定义body
          const bodyTemplate = typeof webhook.body === 'string'
            ? webhook.body
            : JSON.stringify(webhook.body);

          // 替换变量，使用专门的JSON替换函数正确处理转义
          const bodyStr = this.replaceVariablesInJson(bodyTemplate, variables);

          // 验证JSON并设置body
          const bodyContent = JSON.parse(bodyStr);
          fetchOptions.body = JSON.stringify(bodyContent);
        } catch (error) {
          console.error('Failed to parse webhook body:', error);
          throw new Error('Webhook body JSON格式错误或变量替换失败: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      }
      // 如果webhook.body为空，则不设置body
    }

    // 发送请求（带超时控制）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.WEBHOOK_REQUEST);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // 检查是否为重定向响应（SSRF保护）
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        const redirectLocation = response.headers.get('location');
        throw new Error(`Webhook不允许重定向。如需访问重定向后的地址，请直接配置目标URL。${redirectLocation ? ` (重定向目标: ${redirectLocation})` : ''}`);
      }

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Webhook请求超时（${TIMEOUTS.WEBHOOK_REQUEST / 1000}秒）`);
      }
      throw error;
    }
  }

  // 测试Webhook
  private async testWebhook(config: WebhookConfig): Promise<Response> {
    const timestamp = new Date().toISOString();

    if (!config.url) {
      throw new Error('Webhook URL is required');
    }

    // 验证Webhook URL（防止SSRF）
    try {
      this.validateWebhookUrl(config.url);
    } catch (error) {
      console.error('Webhook URL验证失败:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`Webhook URL验证失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 测试用变量
    const variables: WebhookVariables = {
      projectId: 'test-project-id',
      projectName: '测试项目',
      url: 'https://example.com',
      selector: '.test-selector',
      oldContent: '旧内容示例',
      newContent: '新内容示例',
      timestamp: timestamp
    };

    // 替换URL中的变量
    let url = this.replaceVariablesInUrl(config.url, variables);

    // 再次验证替换后的URL
    try {
      this.validateWebhookUrl(url);
    } catch (error) {
      console.error('替换变量后的URL验证失败:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`替换变量后的URL验证失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 准备请求配置
    const fetchOptions: RequestInit = {
      method: config.method || 'POST',
      redirect: 'manual'  // 防止重定向到内网地址（SSRF保护）
    };

    // 处理请求头
    const headers: Record<string, string> = {};
    if (config.headers) {
      try {
        const customHeaders = typeof config.headers === 'string'
          ? JSON.parse(config.headers)
          : config.headers;

        // 替换请求头中的变量
        for (const [key, value] of Object.entries(customHeaders)) {
          headers[key] = this.replaceVariablesInHeader(String(value), variables);
        }
      } catch (error) {
        console.error('Failed to parse webhook headers:', error);
      }
    }
    if (Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }

    // 处理请求体 (仅POST/PUT/PATCH)
    if (['POST', 'PUT', 'PATCH'].includes((fetchOptions.method as string).toUpperCase())) {
      if (config.body) {
        try {
          // 用户自定义body
          const bodyTemplate = typeof config.body === 'string'
            ? config.body
            : JSON.stringify(config.body);

          // 替换变量，使用专门的JSON替换函数正确处理转义
          const bodyStr = this.replaceVariablesInJson(bodyTemplate, variables);

          // 验证JSON并设置body
          const bodyContent = JSON.parse(bodyStr);
          fetchOptions.body = JSON.stringify(bodyContent);
        } catch (error) {
          console.error('Failed to parse webhook body:', error);
          throw new Error('请求体JSON格式错误或变量替换失败: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      }
      // 如果config.body为空，则不设置body
    }

    // 发送请求（带超时控制）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.WEBHOOK_REQUEST);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // 检查是否为重定向响应（SSRF保护）
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        const redirectLocation = response.headers.get('location');
        throw new Error(`Webhook不允许重定向。如需访问重定向后的地址，请直接配置目标URL。${redirectLocation ? ` (重定向目标: ${redirectLocation})` : ''}`);
      }

      // 返回响应（无论成功还是失败，让调用方处理）
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Webhook请求超时（${TIMEOUTS.WEBHOOK_REQUEST / 1000}秒）`);
      }
      throw error;
    }
  }
}

// 初始化监控管理器
const monitorManager = new MonitorManager();

// 监听 alarms 触发事件
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`Alarm triggered: ${alarm.name}`);

  // 检查是否是监控 alarm
  if (alarm.name.startsWith('monitor_')) {
    const projectId = alarm.name.replace('monitor_', '');

    // 从 storage 重新加载项目信息（确保使用最新配置）
    storageManager.getProjects().then((projects) => {
      const project = projects.find(p => p.id === projectId);

      if (project && project.active) {
        // 执行检查
        monitorManager.checkElement(project);
      } else {
        // 项目不存在或已停用，清除 alarm
        console.log(`Project ${projectId} not found or inactive, clearing alarm`);
        chrome.alarms.clear(alarm.name);
      }
    });
  }
});

// 安装时请求通知权限
chrome.runtime.onInstalled.addListener(() => {
  console.log('Div Ping extension installed');
});
