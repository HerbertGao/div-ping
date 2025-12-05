import { ALARM, LIMITS, NOTIFICATION, TIMEOUTS, WEBHOOK_RATE_LIMIT } from './constants';
import { t } from './i18n';
import { storageManager } from './storageManager';
import { LogEntry, MessageRequest, MessageResponse, Project, Settings, WebhookConfig } from './types';
import { validateInterval, validateProjectName, validateSelector, validateUrl, validateWebhookBody, validateWebhookHeaders, validateWebhookUrl } from './validation';

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
    // Note: FIFO is used instead of LRU for simplicity. Given typical monitoring patterns
    // where projects are checked at regular intervals, FIFO provides acceptable performance.
    // LRU would be beneficial for irregular access patterns but adds implementation complexity.
    if (this.tabCache.size >= LIMITS.MAX_TAB_CACHE_SIZE) {
      // Map iteration order is insertion-order (ES2015 spec), so first key is the oldest entry
      const firstKey = this.tabCache.keys().next().value;
      if (firstKey) {
        console.log(`Tab cache full, removing oldest entry: ${firstKey}`);
        this.tabCache.delete(firstKey);
      }
    }
    this.tabCache.set(url, tabId);
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
        console.error('Error handling message action:', message.action, error);
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

          // Validate all inputs before creating project (fail fast)
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

          // Validate inputs before updating
          const nameValidation = validateProjectName(message.name);
          if (!nameValidation.valid) {
            sendResponse({ success: false, error: nameValidation.error });
            break;
          }

          const selectorValidation = validateSelector(message.selector);
          if (!selectorValidation.valid) {
            sendResponse({ success: false, error: selectorValidation.error });
            break;
          }

          const intervalValidation = validateInterval(message.interval);
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
              priority: NOTIFICATION.PRIORITY
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
      delayInMinutes: ALARM.INITIAL_DELAY_MINUTES, // Trigger immediately first time
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
   * Request host permission for a specific URL
   * @param url - The URL to request permission for
   * @returns Promise<boolean> - Whether permission was granted
   */
  private async requestHostPermission(url: string): Promise<boolean> {
    try {
      // Extract origin from URL
      const urlObj = new URL(url);
      const origin = `${urlObj.protocol}//${urlObj.host}/*`;

      // Check if we already have permission
      const hasPermission = await chrome.permissions.contains({
        origins: [origin]
      });

      if (hasPermission) {
        console.log(`Already have permission for: ${origin}`);
        return true;
      }

      // Request permission
      console.log(`Requesting permission for: ${origin}`);
      const granted = await chrome.permissions.request({
        origins: [origin]
      });

      if (granted) {
        console.log(`Permission granted for: ${origin}`);
      } else {
        console.warn(`Permission denied for: ${origin}`);
      }

      return granted;
    } catch (error) {
      console.error('Error requesting host permission:', error);
      return false;
    }
  }

  /**
   * Inject content script into a tab
   * @param tabId - The tab ID to inject the script into
   */
  private async injectContentScript(tabId: number): Promise<void> {
    try {
      // Inject CSS first
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['css/content.css']
      });

      // Then inject JavaScript
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['js/content.js']
      });

      console.log(`Content script injected into tab ${tabId}`);
    } catch (error) {
      // Script might already be injected, which is fine
      console.log(`Content script injection for tab ${tabId}:`, error);
    }
  }

  /**
   * Get or create a tab for content detection
   * Prioritizes reusing existing tabs to reduce resource consumption
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
    if (newTab.id !== undefined) {
      this.addToTabCache(url, newTab.id);
    }

    return { tab: newTab, isNewlyCreated: true };
  }

  public async checkElement(project: Project): Promise<void> {
    let tab: chrome.tabs.Tab | null = null;
    let isNewlyCreatedTab = false;

    try {
      console.log(`[${project.name}] Getting or creating tab for URL: ${project.url}`);

      // Request host permission for the URL
      const hasPermission = await this.requestHostPermission(project.url);
      if (!hasPermission) {
        throw new Error('Host permission not granted for: ' + project.url);
      }

      // Get or create tab, return result contains tab and isNewlyCreated flag
      const tabResult = await this.getOrCreateTab(project.url);
      tab = tabResult.tab;
      isNewlyCreatedTab = tabResult.isNewlyCreated;

      // Check tab ID is valid
      if (tab.id === undefined) {
        throw new Error('Tab created without ID');
      }

      // Wait for page to load
      await this.waitForTabLoad(tab.id);

      // Inject content script into the tab
      await this.injectContentScript(tab.id);

      // Send check request to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
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

        if (hasChanged && currentLastContent) {
          console.log(`[${project.name}] Content changed!`);
          this.notifyChange(updatedProject, currentLastContent, newContent);
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
          priority: NOTIFICATION.PRIORITY
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

    // Webhook notification with rate limiting
    const webhook = project.webhook;

    if (webhook?.enabled && webhook.url) {
      // Check rate limiting
      const now = Date.now();
      const lastWebhookTime = project.lastWebhookTime ? new Date(project.lastWebhookTime).getTime() : 0;
      const timeSinceLastWebhook = now - lastWebhookTime;

      if (timeSinceLastWebhook < WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS) {
        const waitTime = Math.ceil((WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS - timeSinceLastWebhook) / 1000);
        console.warn(`[${project.name}] Webhook rate limited. Need to wait ${waitTime} more seconds before next call.`);
        return;
      }

      try {
        await this.sendWebhook(webhook, project, oldContent, newContent);
        console.log('Webhook notification sent successfully');

        // Update lastWebhookTime after successful webhook call
        await storageManager.updateProject(project.id, {
          lastWebhookTime: new Date().toISOString()
        });
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
    const urlValidation = validateWebhookUrl(webhook.url);
    if (!urlValidation.valid) {
      console.error(t('webhookUrlValidationFailed'), urlValidation.error);
      throw new Error(t('webhookUrlValidationFailedWithError', [urlValidation.error || 'Unknown error']));
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
    const urlAfterSubValidation = validateWebhookUrl(url);
    if (!urlAfterSubValidation.valid) {
      console.error(t('webhookUrlAfterSubstitutionFailed'), urlAfterSubValidation.error);
      throw new Error(t('webhookUrlAfterSubstitutionFailedWithError', [urlAfterSubValidation.error || 'Unknown error']));
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
    const testUrlValidation = validateWebhookUrl(config.url);
    if (!testUrlValidation.valid) {
      console.error(t('webhookUrlValidationFailed'), testUrlValidation.error);
      throw new Error(t('webhookUrlValidationFailedWithError', [testUrlValidation.error || 'Unknown error']));
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
    const urlAfterSubValidation = validateWebhookUrl(url);
    if (!urlAfterSubValidation.valid) {
      console.error(t('webhookUrlAfterSubstitutionFailed'), urlAfterSubValidation.error);
      throw new Error(t('webhookUrlAfterSubstitutionFailedWithError', [urlAfterSubValidation.error || 'Unknown error']));
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
