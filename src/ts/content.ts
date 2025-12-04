import { Project, WebhookConfig, MessageRequest, MessageResponse } from './types';
import { DEFAULTS, LIMITS } from './constants';
import { t } from './i18n';

// 元素选择模式
class ElementSelector {
  private isSelecting: boolean = false;
  private highlightedElement: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;

  public start(): void {
    if (this.isSelecting) return;

    this.isSelecting = true;
    this.createOverlay();
    this.attachEventListeners();
    document.body.style.cursor = 'crosshair';
  }

  public stop(): void {
    if (!this.isSelecting) return;

    this.isSelecting = false;
    this.removeOverlay();
    this.removeEventListeners();
    document.body.style.cursor = '';
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = 'div-ping-overlay';
    this.overlay.style.cssText = `
      position: absolute;
      pointer-events: none;
      border: 2px solid #4CAF50;
      background: rgba(76, 175, 80, 0.1);
      z-index: 999999;
      transition: all 0.1s ease;
    `;
    document.body.appendChild(this.overlay);
  }

  private removeOverlay(): void {
    if (this.overlay?.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
      this.overlay = null;
    }
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isSelecting) return;

    e.preventDefault();
    e.stopPropagation();

    const element = e.target as HTMLElement;
    if (element === this.overlay) return;

    this.highlightedElement = element;
    const rect = element.getBoundingClientRect();

    if (this.overlay) {
      this.overlay.style.top = (rect.top + window.scrollY) + 'px';
      this.overlay.style.left = (rect.left + window.scrollX) + 'px';
      this.overlay.style.width = rect.width + 'px';
      this.overlay.style.height = rect.height + 'px';
    }
  }

  private handleClick = (e: MouseEvent): void => {
    if (!this.isSelecting) return;

    e.preventDefault();
    e.stopPropagation();

    const element = this.highlightedElement;
    if (!element) return;

    this.stop();
    this.showConfigDialog(element);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isSelecting) {
      this.stop();
    }
  }

  private attachEventListeners(): void {
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
  }

  private removeEventListeners(): void {
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
  }

  private getSelector(element: HTMLElement): string {
    // 优先使用ID
    if (element.id) {
      return `#${element.id}`;
    }

    // 使用类名和标签
    const tag = element.tagName.toLowerCase();
    const classes = Array.from(element.classList).slice(0, 3).join('.');

    if (classes) {
      const selector = `${tag}.${classes}`;
      // 检查选择器是否唯一
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }

    // 使用nth-child
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      const parentSelector = this.getSelector(parent);
      return `${parentSelector} > ${tag}:nth-child(${index})`;
    }

    return tag;
  }

  public showConfigDialog(element: HTMLElement | null, existingProject?: Project): void {
    const selector = existingProject ? existingProject.selector : this.getSelector(element!);

    // Safely get initial content:
    // - For existing projects: use lastContent if available, otherwise try element if it exists, else empty string
    // - For new projects: element must exist (non-null assertion is safe here)
    const initialContent = existingProject
      ? existingProject.lastContent || (element ? this.getElementContent(element) : '')
      : this.getElementContent(element!);

    // 创建配置对话框
    const dialog = document.createElement('div');
    dialog.id = 'div-ping-config-dialog';
    dialog.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 24px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 1000000;
        min-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #333;">${t('projectConfig')}</h2>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 14px; color: #666;">${t('projectName')}:</label>
          <input type="text" id="projectName" value="${existingProject ? this.escapeHtml(existingProject.name) : t('monitorPrefix') + new Date().toLocaleString()}" style="
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
          ">
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 14px; color: #666;">${t('selector')}:</label>
          <input type="text" id="elementSelector" value="${this.escapeHtml(selector)}" style="
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            font-family: monospace;
          ">
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 14px; color: #666;">${t('intervalSeconds')}:</label>
          <input type="number" id="refreshInterval" value="${existingProject ? existingProject.interval / 1000 : DEFAULTS.INTERVAL_SECONDS}" min="${LIMITS.MIN_INTERVAL_SECONDS}" style="
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
          ">
          <div style="font-size: 12px; color: #FF9800; margin-top: 4px;">${t('minIntervalWarning', [LIMITS.MIN_INTERVAL_SECONDS.toString()])}</div>
        </div>

        <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
          <label style="display: flex; align-items: center; font-size: 14px; color: #666;">
            <input type="checkbox" id="browserNotification" ${existingProject ? (existingProject.browserNotification ? 'checked' : '') : 'checked'} style="margin-right: 8px;">
            ${t('enableBrowserNotification')}
          </label>
          <button id="testBrowserNotification" ${existingProject ? (existingProject.browserNotification ? '' : 'disabled') : ''} style="padding: 4px 12px; font-size: 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">${t('test')}</button>
        </div>

        <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
          <label style="display: flex; align-items: center; font-size: 14px; color: #666;">
            <input type="checkbox" id="enableWebhook" ${existingProject && existingProject.webhook?.enabled ? 'checked' : ''} style="margin-right: 8px;">
            ${t('enableWebhook')}
          </label>
          <button id="testWebhook" ${existingProject && existingProject.webhook?.enabled ? '' : 'disabled'} style="padding: 4px 12px; font-size: 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">${t('test')}</button>
        </div>

        <div id="webhookConfig" style="display: ${existingProject && existingProject.webhook?.enabled ? 'block' : 'none'}; margin-bottom: 12px; border: 1px solid #ddd; border-radius: 4px; padding: 12px;">
          <div style="margin-bottom: 8px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #666;">${t('webhookMethod')}:</label>
            <select id="webhookMethod" style="
              width: 100%;
              padding: 8px;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 14px;
            ">
              <option value="GET" ${existingProject && existingProject.webhook?.method === 'GET' ? 'selected' : ''}>GET</option>
              <option value="POST" ${!existingProject || !existingProject.webhook?.method || existingProject.webhook?.method === 'POST' ? 'selected' : ''}>POST</option>
              <option value="PUT" ${existingProject && existingProject.webhook?.method === 'PUT' ? 'selected' : ''}>PUT</option>
            </select>
          </div>

          <div style="margin-bottom: 8px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #666;">${t('webhookUrl')}:</label>
            <input type="url" id="webhookUrl" value="${existingProject && existingProject.webhook?.url ? this.escapeHtml(existingProject.webhook.url) : ''}" placeholder="https://example.com/webhook?key={{oldContent}}" style="
              width: 100%;
              padding: 8px;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 13px;
              font-family: monospace;
            ">
            <div style="font-size: 11px; color: #999; margin-top: 4px;">
              ${t('webhookVariablesHelp')}
            </div>
          </div>

          <div style="margin-bottom: 8px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #666;">${t('webhookHeaders')}:</label>
            <textarea id="webhookHeaders" placeholder='{"Authorization": "Bearer {{token}}"}'style="
              width: 100%;
              padding: 8px;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 13px;
              font-family: monospace;
              min-height: 50px;
            ">${existingProject && existingProject.webhook?.headers ? this.escapeHtml(typeof existingProject.webhook.headers === 'string' ? existingProject.webhook.headers : JSON.stringify(existingProject.webhook.headers)) : ''}</textarea>
          </div>

          <div style="margin-bottom: 0;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #666;">${t('webhookBody')}:</label>
            <textarea id="webhookBody" placeholder='{"project": "{{projectName}}", "old": "{{oldContent}}", "new": "{{newContent}}"}'style="
              width: 100%;
              padding: 8px;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 13px;
              font-family: monospace;
              min-height: 60px;
            ">${existingProject && existingProject.webhook?.body ? this.escapeHtml(typeof existingProject.webhook.body === 'string' ? existingProject.webhook.body : JSON.stringify(existingProject.webhook.body)) : ''}</textarea>
            <div style="font-size: 11px; color: #999; margin-top: 4px;">
              ${t('webhookBodyHelp')}
            </div>
          </div>
        </div>

        <div style="margin-bottom: 16px; padding: 12px; background: #f5f5f5; border-radius: 4px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${t('currentContentPreview')}</div>
          <div style="font-size: 13px; color: #333; max-height: 100px; overflow: auto; word-break: break-all;">
            ${this.escapeHtml(initialContent.substring(0, 200))}${initialContent.length > 200 ? '...' : ''}
          </div>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="cancelBtn" style="
            padding: 8px 16px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
            cursor: pointer;
            font-size: 14px;
          ">${t('cancel')}</button>
          <button id="confirmBtn" style="
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            background: #4CAF50;
            color: white;
            cursor: pointer;
            font-size: 14px;
          ">${t('save')}</button>
        </div>
      </div>
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 999999;
      "></div>
    `;

    document.body.appendChild(dialog);

    // 获取元素引用
    const browserNotificationCheckbox = dialog.querySelector<HTMLInputElement>('#browserNotification')!;
    const enableWebhook = dialog.querySelector<HTMLInputElement>('#enableWebhook')!;
    const webhookConfig = dialog.querySelector<HTMLElement>('#webhookConfig')!;
    const testBrowserBtn = dialog.querySelector<HTMLButtonElement>('#testBrowserNotification')!;
    const testWebhookBtn = dialog.querySelector<HTMLButtonElement>('#testWebhook')!;

    // 浏览器通知开关 - 控制测试按钮状态
    browserNotificationCheckbox.addEventListener('change', () => {
      testBrowserBtn.disabled = !browserNotificationCheckbox.checked;
    });

    // Webhook开关 - 控制配置区域和测试按钮状态
    enableWebhook.addEventListener('change', () => {
      webhookConfig.style.display = enableWebhook.checked ? 'block' : 'none';
      testWebhookBtn.disabled = !enableWebhook.checked;
    });

    // 测试浏览器通知按钮
    testBrowserBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'testBrowserNotification'
      }, (response: MessageResponse) => {
        if (chrome.runtime.lastError) {
          alert(t('communicationFailed', [chrome.runtime.lastError.message || t('unknownError')]));
        } else if (response?.success) {
          // 通知已发送，无需额外提示（用户会在系统中看到通知）
          console.log('Test notification sent successfully');
        } else {
          alert(t('notificationTestFailed', [response?.error || t('unknownError')]));
        }
      });
    });

    // 测试Webhook按钮
    testWebhookBtn.addEventListener('click', async () => {
      const webhookUrl = dialog.querySelector<HTMLInputElement>('#webhookUrl')!.value.trim();
      const webhookMethod = dialog.querySelector<HTMLSelectElement>('#webhookMethod')!.value;
      const webhookHeaders = dialog.querySelector<HTMLTextAreaElement>('#webhookHeaders')!.value.trim();
      const webhookBody = dialog.querySelector<HTMLTextAreaElement>('#webhookBody')!.value.trim();

      if (!webhookUrl) {
        alert(t('webhookUrlEmpty'));
        return;
      }

      // 禁用按钮，显示加载状态
      testWebhookBtn.disabled = true;
      testWebhookBtn.textContent = t('sending');

      try {
        // 准备webhook配置
        const webhookConfig: WebhookConfig = {
          enabled: true,
          url: webhookUrl,
          method: webhookMethod as 'GET' | 'POST' | 'PUT'
        };

        // 添加headers（如果有）
        if (webhookHeaders) {
          try {
            const parsedHeaders = JSON.parse(webhookHeaders);
            webhookConfig.headers = typeof parsedHeaders === 'string' ? parsedHeaders : JSON.stringify(parsedHeaders);
          } catch (error) {
            alert(t('webhookHeadersError', [error instanceof Error ? error.message : t('unknownError')]));
            testWebhookBtn.disabled = false;
            testWebhookBtn.textContent = t('test');
            return;
          }
        }

        // 添加body（如果有）
        if (webhookBody) {
          try {
            const parsedBody = JSON.parse(webhookBody);
            webhookConfig.body = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody);
          } catch (error) {
            alert(t('webhookBodyError', [error instanceof Error ? error.message : t('unknownError')]));
            testWebhookBtn.disabled = false;
            testWebhookBtn.textContent = t('test');
            return;
          }
        }

        // 发送消息到background script
        chrome.runtime.sendMessage({
          action: 'testWebhook',
          config: webhookConfig
        }, (response: MessageResponse) => {
          if (response?.success && response.status !== undefined) {
            if (response.status >= 200 && response.status < 300) {
              alert(t('webhookTestSuccess', [response.status.toString(), response.statusText || '']));
            } else {
              alert(t('webhookTestWarning', [response.status.toString(), response.statusText || '']));
            }
          } else {
            alert(t('webhookTestFailed', [response?.error || t('unknownError')]));
          }

          // 恢复按钮状态
          testWebhookBtn.disabled = false;
          testWebhookBtn.textContent = t('test');
        });
      } catch (error) {
        alert(t('webhookTestFailed', [error instanceof Error ? error.message : t('unknownError')]));
        testWebhookBtn.disabled = false;
        testWebhookBtn.textContent = t('test');
      }
    });

    // 取消按钮
    dialog.querySelector<HTMLButtonElement>('#cancelBtn')!.addEventListener('click', () => {
      dialog.remove();
    });

    // 确认按钮
    dialog.querySelector<HTMLButtonElement>('#confirmBtn')!.addEventListener('click', () => {
      // 验证刷新间隔
      const intervalInput = dialog.querySelector<HTMLInputElement>('#refreshInterval')!;
      const intervalValue = parseInt(intervalInput.value);

      if (isNaN(intervalValue) || intervalValue < LIMITS.MIN_INTERVAL_SECONDS) {
        alert(t('intervalTooSmall', [LIMITS.MIN_INTERVAL_SECONDS.toString()]));
        intervalInput.focus();
        return;
      }

      const webhookEnabled = enableWebhook.checked;
      const config: MessageRequest = {
        action: existingProject ? 'updateProject' : 'elementSelected',
        name: dialog.querySelector<HTMLInputElement>('#projectName')!.value,
        selector: dialog.querySelector<HTMLInputElement>('#elementSelector')!.value,
        interval: intervalValue * 1000,
        browserNotification: dialog.querySelector<HTMLInputElement>('#browserNotification')!.checked,
        url: existingProject ? existingProject.url : window.location.href,
        initialContent: initialContent
      };

      // Webhook配置
      if (webhookEnabled) {
        config.webhook = {
          enabled: true,
          url: dialog.querySelector<HTMLInputElement>('#webhookUrl')!.value,
          method: dialog.querySelector<HTMLSelectElement>('#webhookMethod')!.value as 'GET' | 'POST' | 'PUT',
          headers: dialog.querySelector<HTMLTextAreaElement>('#webhookHeaders')!.value.trim(),
          body: dialog.querySelector<HTMLTextAreaElement>('#webhookBody')!.value.trim()
        };
      } else {
        config.webhook = { enabled: false };
      }

      // 如果是编辑模式，添加项目ID
      if (existingProject) {
        config.projectId = existingProject.id;
      }

      // 发送到background
      chrome.runtime.sendMessage(config, (response: MessageResponse) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to save project:', chrome.runtime.lastError);
          alert(t('saveFailed', [chrome.runtime.lastError.message || t('unknownError')]));
        } else if (response?.success) {
          console.log('Project saved successfully:', response.projectId);
          // 显示成功提示
          const successMsg = document.createElement('div');
          successMsg.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 16px 24px;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10000000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          `;
          successMsg.textContent = existingProject ? t('projectUpdated') : t('projectCreated');
          document.body.appendChild(successMsg);
          setTimeout(() => successMsg.remove(), 3000);
        }
      });

      dialog.remove();
    });
  }

  public getElementContent(element: HTMLElement | null): string {
    // 获取元素的文本内容和HTML
    if (!element) {
      return '';
    }
    return element.innerText || element.textContent || element.innerHTML;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化选择器
const selector = new ElementSelector();

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message: MessageRequest, _sender: chrome.runtime.MessageSender, sendResponse: (response: MessageResponse) => void) => {
  if (message.action === 'startSelection') {
    selector.start();
    sendResponse({ success: true });
  } else if (message.action === 'editProject') {
    // 显示编辑对话框
    try {
      // 先尝试找到元素以获取当前内容
      let element: HTMLElement | null = null;
      try {
        if (message.project) {
          element = document.querySelector<HTMLElement>(message.project.selector);
        }
      } catch {
        // 选择器可能无效，使用保存的内容
      }
      selector.showConfigDialog(element, message.project);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
    return true;
  } else if (message.action === 'checkElement') {
    // 检查元素内容
    try {
      if (!message.selector) {
        sendResponse({ success: false, error: 'Selector is required' });
        return true;
      }
      const element = document.querySelector<HTMLElement>(message.selector);
      if (element) {
        const content = selector.getElementContent(element);
        sendResponse({ success: true, content });
      } else {
        sendResponse({ success: false, error: 'Element not found' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
    return true; // 保持消息通道开放
  }
  return false;
});
