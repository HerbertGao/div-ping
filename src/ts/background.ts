import { Project, WebhookConfig, LogEntry, MessageRequest, MessageResponse, Settings } from './types';
import * as ipaddr from 'ipaddr.js';
import { storageManager } from './storageManager';
import { TIMEOUTS, LIMITS } from './constants';
import { t } from './i18n';
import { validateProjectName, validateSelector, validateUrl, validateInterval, validateWebhookBody, validateWebhookHeaders } from './validation';

// Monitor info interface (no longer needs intervalId)
interface MonitorInfo {
  project: Project;
}

// Tab retrieval result interface
interface TabResult {
  tab: chrome.tabs.Tab;
  isNewlyCreated: boolean;
}

// Webhook variables interface
interface WebhookVariables {
  projectId: string;
  projectName: string;
  url: string;
  selector: string;
  oldContent: string;
  newContent: string;
  timestamp: string;
}

// Background service worker
class MonitorManager {
  private monitors: Map<string, MonitorInfo> = new Map();
  private tabCache: Map<string, number> = new Map(); // Cache tab ID for each URL

  constructor() {
    this.init();
    this.setupTabCleanup();
  }

  // Setup tab cleanup listeners
  private setupTabCleanup(): void {
    // Listen for tab close events and clean cache
    chrome.tabs.onRemoved.addListener((tabId) => {
      // Find and remove tab from cache
      for (const [url, cachedTabId] of this.tabCache.entries()) {
        if (cachedTabId === tabId) {
          this.tabCache.delete(url);
          console.log(`Tab ${tabId} for URL ${url} closed, removed from cache`);
          break;
        }
      }
    });

    // Listen for tab update events (update cache when URL changes)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.url) {
        // Remove old URL from cache
        for (const [url, cachedTabId] of this.tabCache.entries()) {
          if (cachedTabId === tabId) {
            this.tabCache.delete(url);
            break;
          }
        }
        // Add new URL to cache, but check cache size limit first
        this.addToTabCache(changeInfo.url, tabId);
      }
    });
  }

  // Add tab to cache with size limit enforcement
  private addToTabCache(url: string, tabId: number): void {
    // If cache is full, remove oldest entry (FIFO strategy)
    if (this.tabCache.size >= LIMITS.MAX_TAB_CACHE_SIZE) {
      const firstKey = this.tabCache.keys().next().value;
      if (firstKey) {
        console.log(`Tab cache full, removing oldest entry: ${firstKey}`);
        this.tabCache.delete(firstKey);
      }
    }
    this.tabCache.set(url, tabId);
  }

  // Validate webhook URL security (prevent SSRF attacks)
  private validateWebhookUrl(urlString: string): boolean {
    try {
      const url = new URL(urlString);

      // Only allow HTTP and HTTPS protocols
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(t('ssrfHttpOnly'));
      }

      // Warn about non-HTTPS URLs
      if (url.protocol === 'http:') {
        console.warn(t('ssrfHttpWarning'));
      }

      // Get hostname
      const hostname = url.hostname.toLowerCase();

      // Block specific localhost hostnames
      if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        throw new Error(t('ssrfLocalhostBlocked'));
      }

      // Block internal domain suffixes
      if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        throw new Error(t('ssrfInternalDomainBlocked'));
      }

      // Try to parse as IP address
      if (ipaddr.isValid(hostname)) {
        const addr = ipaddr.parse(hostname);

        // Check IP address range
        const range = addr.range();

        // Forbidden IP address ranges
        const forbiddenRanges = [
          'unspecified',    // 0.0.0.0 or ::
          'broadcast',      // 255.255.255.255
          'multicast',      // 224.0.0.0/4 or ff00::/8
          'linkLocal',      // 169.254.0.0/16 or fe80::/10
          'loopback',       // 127.0.0.0/8 or ::1
          'private',        // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 or fc00::/7
          'reserved',       // Reserved addresses
          'carrierGradeNat', // 100.64.0.0/10
          'uniqueLocal'     // IPv6 unique local addresses fc00::/7
        ];

        if (forbiddenRanges.includes(range)) {
          throw new Error(t('ssrfIpRangeBlocked', [range]));
        }

        // IPv4 special checks: test networks and benchmark networks
        if (addr.kind() === 'ipv4') {
          const bytes = addr.toByteArray();

          // 192.0.0.0/24 (IETF Protocol Assignments)
          if (bytes[0] === 192 && bytes[1] === 0 && bytes[2] === 0) {
            throw new Error(t('ssrfIetfAddressBlocked'));
          }

          // 192.0.2.0/24 (TEST-NET-1)
          if (bytes[0] === 192 && bytes[1] === 0 && bytes[2] === 2) {
            throw new Error(t('ssrfTestNetworkBlocked'));
          }

          // 198.18.0.0/15 (Benchmarking)
          if (bytes[0] === 198 && (bytes[1] === 18 || bytes[1] === 19)) {
            throw new Error(t('ssrfBenchmarkBlocked'));
          }

          // 198.51.100.0/24 (TEST-NET-2)
          if (bytes[0] === 198 && bytes[1] === 51 && bytes[2] === 100) {
            throw new Error(t('ssrfTestNetworkBlocked'));
          }

          // 203.0.113.0/24 (TEST-NET-3)
          if (bytes[0] === 203 && bytes[1] === 0 && bytes[2] === 113) {
            throw new Error(t('ssrfTestNetworkBlocked'));
          }
        }

        // IPv6 special checks: IPv4-mapped addresses
        if (addr.kind() === 'ipv6') {
          const ipv6Addr = addr as ipaddr.IPv6;
          if (ipv6Addr.isIPv4MappedAddress()) {
            // Get mapped IPv4 address and check recursively
            const ipv4 = ipv6Addr.toIPv4Address();
            const ipv4Range = ipv4.range();

            if (forbiddenRanges.includes(ipv4Range)) {
              throw new Error(t('ssrfIpv4MappedBlocked', [ipv4Range]));
            }
          }
        }
      }

      return true;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(t('invalidUrlFormat'));
      }
      throw error;
    }
  }

  private async init(): Promise<void> {
    // Load saved projects and start active monitors
    const projects = await storageManager.getProjects();

    projects.forEach(project => {
      if (project.active) {
        this.startMonitor(project);
      }
    });

    // Listen for messages
    chrome.runtime.onMessage.addListener((message: MessageRequest, sender: chrome.runtime.MessageSender, sendResponse: (response: MessageResponse) => void) => {
      // Handle messages asynchronously
      this.handleMessage(message, sender, sendResponse).catch(error => {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      });
      return true; // Keep message channel open for async responses
    });

    // Note: Now using temporary tabs, no need to listen for tab close events
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
          // Create new project
          if (!message.url || !message.selector) {
            sendResponse({ success: false, error: 'URL and selector are required' });
            break;
          }

          // Validate inputs
          const projectName = message.name || `${t('monitorPrefix')}${new Date().toLocaleString()}`;
          const nameValidation = validateProjectName(projectName);
          if (!nameValidation.valid) {
            sendResponse({ success: false, error: nameValidation.error });
            break;
          }

          const urlValidation = validateUrl(message.url);
          if (!urlValidation.valid) {
            sendResponse({ success: false, error: urlValidation.error });
            break;
          }

          const selectorValidation = validateSelector(message.selector);
          if (!selectorValidation.valid) {
            sendResponse({ success: false, error: selectorValidation.error });
            break;
          }

          const interval = message.interval || 30000;
          const intervalValidation = validateInterval(interval);
          if (!intervalValidation.valid) {
            sendResponse({ success: false, error: intervalValidation.error });
            break;
          }

          // Validate webhook configuration if present
          if (message.webhook?.enabled) {
            if (message.webhook.body) {
              const bodyValidation = validateWebhookBody(message.webhook.body);
              if (!bodyValidation.valid) {
                sendResponse({ success: false, error: bodyValidation.error });
                break;
              }
            }
            if (message.webhook.headers) {
              const headersValidation = validateWebhookHeaders(message.webhook.headers);
              if (!headersValidation.valid) {
                sendResponse({ success: false, error: headersValidation.error });
                break;
              }
            }
          }

          const project: Project = {
            id: Date.now().toString(),
            name: projectName,
            url: message.url,
            selector: message.selector,
            interval: interval,
            active: true,
            browserNotification: message.browserNotification !== false,
            webhook: message.webhook || { enabled: false },
            lastContent: message.initialContent,
            tabId: sender.tab?.id || null
          };

          // Save to storage
          await storageManager.addProject(project);

          console.log('Project saved:', project);

          // Start monitoring
          this.startMonitor(project);

          sendResponse({ success: true, projectId: project.id });
          break;
        }

        case 'updateProject': {
          // Update existing project
          if (!message.projectId || !message.name || !message.selector || message.interval === undefined || message.browserNotification === undefined) {
            sendResponse({ success: false, error: 'Required fields missing for update' });
            break;
          }

          // Use storageManager for atomic update
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

          // If project is active, restart monitoring
          if (updatedProject.active) {
            this.stopMonitor(message.projectId);
            this.startMonitor(updatedProject);
          }

          sendResponse({ success: true, projectId: message.projectId });
          break;
        }

        case 'testBrowserNotification': {
          // Test browser notification
          chrome.notifications.create(
            {
              type: 'basic',
              iconUrl: chrome.runtime.getURL('icons/icon128.png'),
              title: t('testNotificationTitle'),
              message: t('testNotificationMessage'),
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
          // Test webhook
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
    // Stop existing monitor
    this.stopMonitor(project.id);

    console.log(`Starting monitor for project: ${project.name}`);

    // Use chrome.alarms API instead of setInterval
    // Use project.id as alarm name identifier
    const alarmName = `monitor_${project.id}`;

    // Create periodic alarm, convert interval to minutes (alarms API minimum is 1 minute)
    const periodInMinutes = Math.max(1, project.interval / 60000);

    chrome.alarms.create(alarmName, {
      delayInMinutes: 0, // Trigger immediately first time
      periodInMinutes: periodInMinutes
    });

    // Save monitor info
    this.monitors.set(project.id, {
      project
    });

    console.log(`Alarm created: ${alarmName} with period ${periodInMinutes} minutes`);

    // Check immediately (do not wait for alarm to trigger)
    this.checkElement(project);
  }

  private stopMonitor(projectId: string): void {
    const monitor = this.monitors.get(projectId);
    if (monitor) {
      console.log(`Stopping monitor for project: ${monitor.project.name}`);

      // Clear alarm
      const alarmName = `monitor_${projectId}`;
      chrome.alarms.clear(alarmName);

      this.monitors.delete(projectId);
    }
  }

  /**
   * 获取或创建用于检测的标签页
   * 优先重用已存在的标签页，减少资源消耗
   */
  private async getOrCreateTab(url: string): Promise<TabResult> {
    // 1. Check if there is a cached tab for this URL
    const cachedTabId = this.tabCache.get(url);
    if (cachedTabId) {
      try {
        const tab = await chrome.tabs.get(cachedTabId);
        // Verify tab is still valid and URL matches
        if (tab && tab.url === url) {
          console.log(`Reusing cached tab ${cachedTabId} for URL: ${url}`);
          return { tab, isNewlyCreated: false };
        } else {
          // Cache invalid, clean up
          this.tabCache.delete(url);
        }
      } catch (error) {
        // Tab no longer exists, clean cache
        console.warn(`Tab ${cachedTabId} no longer exists:`, error);
        this.tabCache.delete(url);
      }
    }

    // 2. Query for other open tabs
    const existingTabs = await chrome.tabs.query({ url });
    if (existingTabs.length > 0) {
      const tab = existingTabs[0];
      if (tab && tab.id) {
        console.log(`Found existing tab ${tab.id} for URL: ${url}`);
        // Update cache
        this.addToTabCache(url, tab.id);
        return { tab, isNewlyCreated: false };
      }
    }

    // 3. Create new tab (open in background)
    console.log(`Creating new background tab for URL: ${url}`);
    const newTab = await chrome.tabs.create({
      url,
      active: false,  // Do not activate tab
      pinned: false   // Do not pin tab
    });

    // Add to cache
    this.addToTabCache(url, newTab.id!);

    return { tab: newTab, isNewlyCreated: true };
  }

  public async checkElement(project: Project): Promise<void> {
    let tab: chrome.tabs.Tab | null = null;
    let isNewlyCreatedTab = false;

    try {
      console.log(`[${project.name}] Getting or creating tab for URL: ${project.url}`);

      // Get or create tab, return result contains tab and isNewlyCreated flag
      const tabResult = await this.getOrCreateTab(project.url);
      tab = tabResult.tab;
      isNewlyCreatedTab = tabResult.isNewlyCreated;

      // Wait for page to load
      await this.waitForTabLoad(tab.id!);

      // Send check request to content script
      const response = await chrome.tabs.sendMessage(tab.id!, {
        action: 'checkElement',
        selector: project.selector
      });

      if (response.success) {
        const newContent: string = response.content;

        console.log(`[${project.name}] Content retrieved, length: ${newContent.length}`);

        // Use atomic update to prevent race conditions
        // Update content first, updateProject returns state before update
        const updatedProject = await storageManager.updateProject(project.id, {
          lastContent: newContent,
          lastChecked: new Date().toISOString()
        });

        if (!updatedProject) {
          console.error(`[${project.name}] Project not found during update`);
          return;
        }

        // Use lastContent before update for comparison
        const currentLastContent = updatedProject.lastContent;

        // Check if content has changed (based on last content)
        const hasChanged = currentLastContent && newContent !== currentLastContent;

        if (hasChanged) {
          console.log(`[${project.name}] Content changed!`);
          this.notifyChange(updatedProject, currentLastContent!, newContent);
        } else {
          console.log(`[${project.name}] No change detected`);
        }

        // Log entry
        await this.addLog(project.id, {
          timestamp: new Date().toISOString(),
          content: newContent,
          oldContent: currentLastContent || null,
          changed: hasChanged || false,
          success: true
        });
      } else {
        console.error(`[${project.name}] Failed to check element: ${response.error}`);

        // Log failure
        await this.addLog(project.id, {
          timestamp: new Date().toISOString(),
          error: response.error,
          success: false
        });
      }
    } catch (error) {
      console.error(`[${project.name}] Error checking element:`, error);

      // Log failure
      await this.addLog(project.id, {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
    } finally {
      // Only close newly created temporary tabs, not reused tabs
      if (isNewlyCreatedTab && tab?.id) {
        try {
          await chrome.tabs.remove(tab.id);
          console.log(`[${project.name}] Temp tab ${tab.id} closed successfully`);
        } catch (closeError) {
          console.error(`[${project.name}] Failed to close temp tab ${tab.id}:`, closeError);
          // Remove from cache even if close fails to avoid cache pollution
          // This ensures next time a new tab is created instead of reusing potentially invalid tab
        } finally {
          // Remove from cache regardless of close success
          this.tabCache.delete(project.url);
        }
      } else if (tab?.id) {
        console.log(`[${project.name}] Reused tab ${tab.id}, keeping it open`);
      }
    }
  }

  private async waitForTabLoad(tabId: number, timeout: number = TIMEOUTS.TAB_LOAD): Promise<void> {
    const startTime = Date.now();

    // Poll tab status with async/await instead of recursive callbacks
    while (Date.now() - startTime < timeout) {
      try {
        const tab = await chrome.tabs.get(tabId);

        if (tab.status === 'complete') {
          // Wait extra time to ensure content script is loaded
          await new Promise(resolve => setTimeout(resolve, TIMEOUTS.TAB_LOAD_EXTRA_DELAY));
          return;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.TAB_STATUS_CHECK));
      } catch {
        throw new Error('Tab not found');
      }
    }

    throw new Error('Timeout waiting for tab to load');
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
    const message = t('changeNotificationBody', [project.name, project.url]);

    // Browser notification
    if (project.browserNotification) {
      chrome.notifications.create(
        {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: t('changeNotificationTitleShort'),
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

    // Webhook notification
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

  // Variable replacement function - for URL parameters
  private replaceVariablesInUrl(template: string, variables: WebhookVariables): string {
    if (!template) return template;

    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, encodeURIComponent(String(value)));
    }
    return result;
  }

  // Variable replacement function - for request headers (no URL encoding)
  private replaceVariablesInHeader(template: string, variables: WebhookVariables): string {
    if (!template) return template;

    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      // For HTTP headers, only replace values without URL encoding
      // Remove control characters and newlines to prevent header injection
      // eslint-disable-next-line no-control-regex -- Intentionally matching control characters for security (header injection prevention)
      const sanitizedValue = String(value).replace(/[\r\n\x00-\x1F\x7F]/g, '');
      result = result.replace(regex, sanitizedValue);
    }
    return result;
  }

  // Variable replacement function - for JSON body (properly handle JSON string escaping)
  private replaceVariablesInJson(template: string, variables: WebhookVariables): string {
    if (!template) return template;

    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      // Convert value to JSON string, then remove outer quotes
      // This correctly handles special characters in strings (like quotes, newlines, etc.)
      const jsonValue = JSON.stringify(String(value));
      // Remove outer quotes added by JSON.stringify
      const valueWithoutOuterQuotes = jsonValue.slice(1, -1);
      result = result.replace(regex, valueWithoutOuterQuotes);
    }
    return result;
  }

  // Send webhook
  private async sendWebhook(webhook: WebhookConfig, project: Project, oldContent: string, newContent: string): Promise<Response> {
    const timestamp = new Date().toISOString();

    if (!webhook.url) {
      throw new Error('Webhook URL is required');
    }

    // Get user-configured timeout setting
    const settings = await storageManager.getSettings<Settings>();
    const timeoutMs = (settings.webhookTimeout || 10) * 1000; // Convert to milliseconds, default 10 seconds

    // Validate webhook URL (prevent SSRF)
    try {
      this.validateWebhookUrl(webhook.url);
    } catch (error) {
      console.error(t('webhookUrlValidationFailed'), error instanceof Error ? error.message : 'Unknown error');
      throw new Error(t('webhookUrlValidationFailedWithError', [error instanceof Error ? error.message : 'Unknown error']));
    }

    // Available variables
    const variables: WebhookVariables = {
      projectId: project.id,
      projectName: project.name,
      url: project.url,
      selector: project.selector,
      oldContent: oldContent,
      newContent: newContent,
      timestamp: timestamp
    };

    // Replace variables in URL
    let url = this.replaceVariablesInUrl(webhook.url, variables);

    // Validate URL again after substitution
    try {
      this.validateWebhookUrl(url);
    } catch (error) {
      console.error(t('webhookUrlAfterSubstitutionFailed'), error instanceof Error ? error.message : 'Unknown error');
      throw new Error(t('webhookUrlAfterSubstitutionFailedWithError', [error instanceof Error ? error.message : 'Unknown error']));
    }

    // Prepare request configuration
    const fetchOptions: RequestInit = {
      method: webhook.method || 'POST',
      redirect: 'manual'  // Prevent redirect to internal addresses (SSRF protection)
    };

    // Handle request headers
    const headers: Record<string, string> = {};
    if (webhook.headers) {
      try {
        const customHeaders = typeof webhook.headers === 'string'
          ? JSON.parse(webhook.headers)
          : webhook.headers;

        // Replace variables in request headers
        for (const [key, value] of Object.entries(customHeaders)) {
          headers[key] = this.replaceVariablesInHeader(String(value), variables);
        }

        // Validate headers after substitution (format and size)
        const headersValidation = validateWebhookHeaders(headers);
        if (!headersValidation.valid) {
          throw new Error(headersValidation.error);
        }
      } catch (error) {
        console.error('Failed to parse or validate webhook headers:', error);
        throw error;
      }
    }
    if (Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }

    // Handle request body (POST/PUT/PATCH only)
    if (['POST', 'PUT', 'PATCH'].includes((fetchOptions.method as string).toUpperCase())) {
      if (webhook.body) {
        try {
          // User-defined body
          const bodyTemplate = typeof webhook.body === 'string'
            ? webhook.body
            : JSON.stringify(webhook.body);

          // Replace variables using dedicated JSON replacement function for proper escaping
          const bodyStr = this.replaceVariablesInJson(bodyTemplate, variables);

          // Validate JSON and set body
          const bodyContent = JSON.parse(bodyStr);
          fetchOptions.body = JSON.stringify(bodyContent);

          // Validate body size after variable substitution
          const finalBodySize = new Blob([fetchOptions.body]).size;
          if (finalBodySize > LIMITS.MAX_WEBHOOK_BODY_SIZE) {
            throw new Error(t('webhookBodySizeExceeded', [finalBodySize.toString(), LIMITS.MAX_WEBHOOK_BODY_SIZE.toString()]));
          }

          // Set Content-Type header for JSON body if not already set
          if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/json';
            fetchOptions.headers = headers;
          }
        } catch (error) {
          console.error('Failed to parse webhook body:', error);
          throw new Error(t('webhookBodyJsonError') + (error instanceof Error ? error.message : 'Unknown error'));
        }
      }
      // If webhook.body is empty, do not set body
    }

    // Send request (with timeout control)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // Check if response is redirect (SSRF protection)
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        const redirectLocation = response.headers.get('location');
        throw new Error(t('webhookRedirectBlocked', [redirectLocation ? ` (${t('redirectTarget')}: ${redirectLocation})` : '']));
      }

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new Error(t('webhookTimeoutError', [(timeoutMs / 1000).toString()]));
      }
      throw error;
    }
  }

  // Test webhook
  private async testWebhook(config: WebhookConfig): Promise<Response> {
    const timestamp = new Date().toISOString();

    if (!config.url) {
      throw new Error('Webhook URL is required');
    }

    // Get user-configured timeout setting
    const settings = await storageManager.getSettings<Settings>();
    const timeoutMs = (settings.webhookTimeout || 10) * 1000; // Convert to milliseconds, default 10 seconds

    // Validate webhook URL (prevent SSRF)
    try {
      this.validateWebhookUrl(config.url);
    } catch (error) {
      console.error(t('webhookUrlValidationFailed'), error instanceof Error ? error.message : 'Unknown error');
      throw new Error(t('webhookUrlValidationFailedWithError', [error instanceof Error ? error.message : 'Unknown error']));
    }

    // Test variables
    const variables: WebhookVariables = {
      projectId: 'test-project-id',
      projectName: t('testProjectName'),
      url: 'https://example.com',
      selector: '.test-selector',
      oldContent: t('testOldContent'),
      newContent: t('testNewContent'),
      timestamp: timestamp
    };

    // Replace variables in URL
    let url = this.replaceVariablesInUrl(config.url, variables);

    // Validate URL again after substitution
    try {
      this.validateWebhookUrl(url);
    } catch (error) {
      console.error(t('webhookUrlAfterSubstitutionFailed'), error instanceof Error ? error.message : 'Unknown error');
      throw new Error(t('webhookUrlAfterSubstitutionFailedWithError', [error instanceof Error ? error.message : 'Unknown error']));
    }

    // Prepare request configuration
    const fetchOptions: RequestInit = {
      method: config.method || 'POST',
      redirect: 'manual'  // Prevent redirect to internal addresses (SSRF protection)
    };

    // Handle request headers
    const headers: Record<string, string> = {};
    if (config.headers) {
      try {
        const customHeaders = typeof config.headers === 'string'
          ? JSON.parse(config.headers)
          : config.headers;

        // Replace variables in request headers
        for (const [key, value] of Object.entries(customHeaders)) {
          headers[key] = this.replaceVariablesInHeader(String(value), variables);
        }

        // Validate headers after substitution (format and size)
        const headersValidation = validateWebhookHeaders(headers);
        if (!headersValidation.valid) {
          throw new Error(headersValidation.error);
        }
      } catch (error) {
        console.error('Failed to parse or validate webhook headers:', error);
        throw error;
      }
    }
    if (Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }

    // Handle request body (POST/PUT/PATCH only)
    if (['POST', 'PUT', 'PATCH'].includes((fetchOptions.method as string).toUpperCase())) {
      if (config.body) {
        try {
          // User-defined body
          const bodyTemplate = typeof config.body === 'string'
            ? config.body
            : JSON.stringify(config.body);

          // Replace variables using dedicated JSON replacement function for proper escaping
          const bodyStr = this.replaceVariablesInJson(bodyTemplate, variables);

          // Validate JSON and set body
          const bodyContent = JSON.parse(bodyStr);
          fetchOptions.body = JSON.stringify(bodyContent);

          // Validate body size after variable substitution
          const finalBodySize = new Blob([fetchOptions.body]).size;
          if (finalBodySize > LIMITS.MAX_WEBHOOK_BODY_SIZE) {
            throw new Error(t('webhookBodySizeExceeded', [finalBodySize.toString(), LIMITS.MAX_WEBHOOK_BODY_SIZE.toString()]));
          }

          // Set Content-Type header for JSON body if not already set
          if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/json';
            fetchOptions.headers = headers;
          }
        } catch (error) {
          console.error('Failed to parse webhook body:', error);
          throw new Error(t('requestBodyJsonError') + (error instanceof Error ? error.message : 'Unknown error'));
        }
      }
      // If config.body is empty, do not set body
    }

    // Send request (with timeout control)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // Check if response is redirect (SSRF protection)
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        const redirectLocation = response.headers.get('location');
        throw new Error(t('webhookRedirectBlocked', [redirectLocation ? ` (${t('redirectTarget')}: ${redirectLocation})` : '']));
      }

      // Return response (whether success or failure, let caller handle)
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new Error(t('webhookTimeoutError', [(timeoutMs / 1000).toString()]));
      }
      throw error;
    }
  }
}

// Initialize monitor manager
const monitorManager = new MonitorManager();

// Listen for alarm trigger events
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`Alarm triggered: ${alarm.name}`);

  // Check if this is a monitor alarm
  if (alarm.name.startsWith('monitor_')) {
    const projectId = alarm.name.replace('monitor_', '');

    // Reload project info from storage (ensure using latest config)
    storageManager.getProjects().then((projects) => {
      const project = projects.find(p => p.id === projectId);

      if (project && project.active) {
        // Perform check
        monitorManager.checkElement(project);
      } else {
        // Project does not exist or is inactive, clear alarm
        console.log(`Project ${projectId} not found or inactive, clearing alarm`);
        chrome.alarms.clear(alarm.name);
      }
    });
  }
});

// Request notification permission on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('div-ping extension installed');
});
