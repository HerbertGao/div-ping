import { Project, LogEntry, MessageResponse } from './types';
import { storageManager } from './storageManager';
import { t, initI18nForHTML } from './i18n';

// 监控项目管理
class ProjectManager {
  private projects: Project[] = [];

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    await this.loadProjects();
    this.render();
    this.attachEventListeners();
  }

  public async loadProjects(): Promise<void> {
    this.projects = await storageManager.getProjects();
  }

  private async saveProjects(): Promise<void> {
    await storageManager.setProjects(this.projects);
  }

  private async removeProject(id: string): Promise<void> {
    await storageManager.removeProject(id);
    await this.loadProjects(); // Reload after deletion
    this.render();
    // 通知后台停止监控
    chrome.runtime.sendMessage({ action: 'stopMonitor', projectId: id });
  }

  private async toggleProject(id: string): Promise<void> {
    const project = this.projects.find(p => p.id === id);
    if (project) {
      project.active = !project.active;
      await this.saveProjects();
      this.render();

      // 通知后台更新监控状态
      if (project.active) {
        chrome.runtime.sendMessage({ action: 'startMonitor', project });
      } else {
        chrome.runtime.sendMessage({ action: 'stopMonitor', projectId: id });
      }
    }
  }

  public render(): void {
    const container = document.getElementById('projectsList');
    if (!container) return;

    if (this.projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p>${t('noProjects')}</p>
          <p style="font-size: 12px; margin-top: 8px;">${t('clickToStart')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.projects.map(project => `
      <div class="project-item" data-id="${project.id}">
        <div class="project-header">
          <span class="project-name">${this.escapeHtml(project.name)}</span>
          <div class="project-status">
            <span class="status-indicator ${project.active ? 'active' : 'inactive'}"></span>
            <span style="font-size: 12px; color: #666;">${project.active ? t('running') : t('paused')}</span>
          </div>
        </div>
        <div class="project-info">
          <div>${t('page')}: ${this.escapeHtml(project.url)}</div>
          <div>${t('selector')}: ${this.escapeHtml(project.selector)}</div>
          <div>${t('refreshInterval')}: ${project.interval / 1000}${t('seconds')}</div>
          <div>${t('notificationMethod')}: ${this.getNotificationMethods(project)}</div>
        </div>
        <div class="project-actions">
          <button class="btn-small btn-toggle" data-action="toggle">
            ${project.active ? t('pause') : t('start')}
          </button>
          <button class="btn-small btn-edit" data-action="edit">${t('edit')}</button>
          <button class="btn-small btn-log" data-action="logs">${t('logs')}</button>
          <button class="btn-small btn-danger" data-action="delete">${t('delete')}</button>
        </div>
      </div>
    `).join('');
  }

  private getNotificationMethods(project: Project): string {
    const methods: string[] = [];
    if (project.browserNotification) methods.push(t('browserNotification'));
    if (project.webhook?.enabled) {
      const method = project.webhook?.method || 'POST';
      methods.push(`Webhook(${method})`);
    }
    return methods.length > 0 ? methods.join(', ') : t('none');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private attachEventListeners(): void {
    const projectsList = document.getElementById('projectsList');
    if (!projectsList) return;

    projectsList.addEventListener('click', async (e: Event) => {
      const button = (e.target as HTMLElement).closest('button');
      if (!button) return;

      const projectItem = button.closest('.project-item') as HTMLElement;
      if (!projectItem) return;

      const projectId = projectItem.dataset.id;
      if (!projectId) return;

      const action = (button as HTMLElement).dataset.action;

      switch (action) {
        case 'toggle':
          await this.toggleProject(projectId);
          break;
        case 'delete':
          if (confirm(t('confirmDelete'))) {
            await this.removeProject(projectId);
          }
          break;
        case 'edit':
          this.editProject(projectId);
          break;
        case 'logs':
          await this.showProjectLogs(projectId);
          break;
      }
    });
  }

  private async editProject(projectId: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    // 获取项目对应的标签页
    const tabs = await chrome.tabs.query({ url: project.url });
    let targetTab: chrome.tabs.Tab | undefined = tabs.length > 0 ? tabs[0] : undefined;

    // 如果没有找到对应的标签页，尝试打开一个新的
    if (!targetTab) {
      targetTab = await chrome.tabs.create({ url: project.url, active: true });
      // 等待页面加载，设置超时避免永久等待
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error('Tab load timeout'));
        }, 30000); // 30秒超时

        const listener = (tabId: number, info: { status?: string }) => {
          if (tabId === targetTab!.id && info.status === 'complete') {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      }).catch((error) => {
        console.warn('Tab load timeout:', error);
        // 即使超时也继续执行，可能页面已经部分加载
      });
    } else {
      // 切换到该标签页
      await chrome.tabs.update(targetTab.id!, { active: true });
    }

    // 发送消息到content script显示编辑对话框
    chrome.tabs.sendMessage(targetTab.id!, {
      action: 'editProject',
      project: project
    }, () => {
      if (chrome.runtime.lastError) {
        alert(t('cannotOpenEditDialog'));
      }
    });

    // 关闭popup
    window.close();
  }

  private async showProjectLogs(projectId: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const response: MessageResponse = await chrome.runtime.sendMessage({
      action: 'getProjectLogs',
      projectId: projectId
    });

    if (!response.success) {
      alert(t('getLogsFailed'));
      return;
    }

    const logs: LogEntry[] = response.logs || [];
    this.displayLogsDialog(project, logs, projectId);
  }

  private displayLogsDialog(project: Project, logs: LogEntry[], projectId: string): void {
    const dialog = document.createElement('div');
    dialog.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999999; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; width: 90%; max-width: 800px; height: 80vh; border-radius: 8px; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
          <div style="padding: 12px 16px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
            <h2 style="margin: 0; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;">${this.escapeHtml(project.name)} - ${t('logsTitle')}</h2>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
              <button id="clearLogsBtn" style="padding: 4px 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap;">${t('clearLogs')}</button>
              <button id="closeLogsBtn" style="padding: 4px 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap;">${t('close')}</button>
            </div>
          </div>
          <div id="logsContent" style="flex: 1; overflow-y: auto; padding: 16px;">
            ${logs.length === 0 ? `<div style="text-align: center; color: #999; padding: 40px;">${t('noLogs')}</div>` : this.renderLogs(logs)}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const logsContent = dialog.querySelector<HTMLElement>('#logsContent')!;

    // 追踪已显示的日志数量
    let displayedLogsCount = logs.length;

    // 使用事件委托处理展开/折叠 - 避免重复绑定
    logsContent.addEventListener('click', (e: Event) => {
      const toggle = (e.target as HTMLElement).closest('.log-toggle') as HTMLElement;
      if (toggle) {
        const targetId = toggle.dataset.target;
        if (!targetId) return;

        const content = document.getElementById(targetId);
        const toggleText = toggle.querySelector<HTMLElement>('div:last-child');

        if (content && toggleText) {
          if (content.style.display === 'none') {
            content.style.display = 'block';
            toggleText.textContent = t('collapse');
          } else {
            content.style.display = 'none';
            toggleText.textContent = t('expand');
          }
        }
      }
    });

    // 定时刷新日志数据 - 增量更新
    const refreshLogs = async (): Promise<void> => {
      // 安全检查：如果dialog已被移除，停止刷新
      if (!document.body.contains(dialog)) {
        clearInterval(refreshInterval);
        observer.disconnect();
        return;
      }

      const response: MessageResponse = await chrome.runtime.sendMessage({
        action: 'getProjectLogs',
        projectId
      });

      if (response?.success) {
        const newLogs: LogEntry[] = response.logs || [];

        // 检查是否有新日志
        if (newLogs.length > displayedLogsCount) {
          // 有新日志，只渲染新增的部分
          const newLogsToAdd = newLogs.slice(0, newLogs.length - displayedLogsCount);

          // 保存当前滚动位置
          const scrollTop = logsContent.scrollTop;
          const isAtBottom = scrollTop + logsContent.clientHeight >= logsContent.scrollHeight - 10;

          // 移除"暂无日志"提示（如果存在）
          const emptyMsg = logsContent.querySelector('div[style*="text-align: center"]');
          if (emptyMsg) {
            emptyMsg.remove();
          }

          // 创建临时容器解析新日志HTML
          const tempContainer = document.createElement('div');
          tempContainer.innerHTML = this.renderLogs(newLogsToAdd);

          // 将新日志插入到最前面
          const firstChild = logsContent.firstChild;
          while (tempContainer.firstChild) {
            if (firstChild) {
              logsContent.insertBefore(tempContainer.firstChild, firstChild);
            } else {
              logsContent.appendChild(tempContainer.firstChild);
            }
          }

          // 更新已显示日志数量
          displayedLogsCount = newLogs.length;

          // 如果之前在底部，滚动到底部
          if (isAtBottom) {
            logsContent.scrollTop = logsContent.scrollHeight;
          }
          // 否则保持原位置，不需要额外操作
        } else if (newLogs.length < displayedLogsCount) {
          // 日志被清空或减少，需要完全重新渲染
          logsContent.innerHTML = newLogs.length === 0
            ? `<div style="text-align: center; color: #999; padding: 40px;">${t('noLogs')}</div>`
            : this.renderLogs(newLogs);

          displayedLogsCount = newLogs.length;
        }
        // 如果数量相同，不做任何操作，保持现有状态
      }
    };

    // 每3秒刷新一次日志
    const refreshInterval = setInterval(refreshLogs, 3000);

    // 使用MutationObserver检测dialog被移除
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const removedNodesArray = Array.from(mutation.removedNodes);
        for (const node of removedNodesArray) {
          if (node === dialog) {
            clearInterval(refreshInterval);
            observer.disconnect();
            window.removeEventListener('beforeunload', cleanupHandler);
            break;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });

    // 清理函数 - 确保清理所有资源
    const cleanup = (): void => {
      clearInterval(refreshInterval);
      observer.disconnect();
      window.removeEventListener('beforeunload', cleanupHandler);
      dialog.remove();
    };

    // Beforeunload处理器（需要命名以便移除）
    const cleanupHandler = (): void => {
      clearInterval(refreshInterval);
      observer.disconnect();
    };

    // 页面卸载时清理
    window.addEventListener('beforeunload', cleanupHandler);

    dialog.querySelector<HTMLButtonElement>('#closeLogsBtn')!.addEventListener('click', cleanup);

    dialog.querySelector<HTMLButtonElement>('#clearLogsBtn')!.addEventListener('click', async () => {
      if (confirm(t('confirmClearLogs'))) {
        await chrome.runtime.sendMessage({ action: 'clearProjectLogs', projectId });
        cleanup();
      }
    });

    // 点击背景关闭时也清理
    dialog.querySelector<HTMLElement>('div')!.addEventListener('click', (e: Event) => {
      if (e.target === e.currentTarget) {
        cleanup();
      }
    });
  }

  private renderLogs(logs: LogEntry[]): string {
    const uniqueId = Date.now();
    return logs.map((log, index) => {
      const timestamp = new Date(log.timestamp).toLocaleString('zh-CN');
      const isChanged = log.changed;
      const logId = `log-${uniqueId}-${index}`;

      if (!log.success) {
        return `<div style="border: 1px solid #f44336; border-radius: 4px; padding: 12px; margin-bottom: 12px; background: #ffebee;">
          <div style="font-size: 12px; color: #666; margin-bottom: 8px;">${timestamp} - <span style="color: #f44336; font-weight: bold;">${t('checkFailed')}</span></div>
          <div style="color: #f44336; font-size: 14px;">${t('error')}: ${this.escapeHtml(log.error || '')}</div>
        </div>`;
      }

      const contentPreview = (content?: string | null): string => this.escapeHtml((content || '').substring(0, 500)) + (content && content.length > 500 ? '...' : '');

      // 有变化的日志：默认展开
      if (isChanged && log.oldContent) {
        return `<div style="border: 1px solid #4CAF50; border-radius: 4px; padding: 12px; margin-bottom: 12px; background: #f1f8f4;">
          <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
            ${timestamp} - <span style="color: #4CAF50; font-weight: bold;">${t('changeDetected')}</span>
          </div>
          <div style="margin-bottom: 8px;">
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${t('oldContent')}:</div>
            <div style="font-family: monospace; font-size: 13px; padding: 8px; background: #fff3e0; border-radius: 4px; max-height: 100px; overflow: auto; word-break: break-all;">${contentPreview(log.oldContent)}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${t('newContent')}:</div>
            <div style="font-family: monospace; font-size: 13px; padding: 8px; background: #e8f5e9; border-radius: 4px; max-height: 100px; overflow: auto; word-break: break-all;">${contentPreview(log.content)}</div>
          </div>
        </div>`;
      }

      // 无变化的日志：默认折叠，不显示预览
      return `<div style="border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 12px; background: #fafafa;">
        <div class="log-toggle" data-target="${logId}" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
          <div style="font-size: 12px; color: #666; flex: 1; min-width: 0;">
            ${timestamp} - <span style="color: #666;">${t('noChange')}</span>
          </div>
          <div style="color: #999; font-size: 11px; white-space: nowrap; margin-left: 8px;">${t('expand')}</div>
        </div>
        <div id="${logId}" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e0e0e0;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${t('content')}:</div>
          <div style="font-family: monospace; font-size: 13px; padding: 8px; background: white; border-radius: 4px; max-height: 100px; overflow: auto; word-break: break-all;">${contentPreview(log.content)}</div>
        </div>
      </div>`;
    }).join('');
  }
}

// 初始化 i18n
initI18nForHTML();

// 初始化
const projectManager = new ProjectManager();

// 选择元素按钮
const selectElementBtn = document.getElementById('selectElement');
if (selectElementBtn) {
  selectElementBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 注入选择器脚本
    chrome.tabs.sendMessage(tab.id!, { action: 'startSelection' }, () => {
      if (chrome.runtime.lastError) {
        alert(t('cannotStartSelection'));
      } else {
        window.close();
      }
    });
  });
}

// 打开设置页面
const openOptionsBtn = document.getElementById('openOptions');
if (openOptionsBtn) {
  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// 监听storage变化以自动刷新列表
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.projects) {
    projectManager.loadProjects().then(() => {
      projectManager.render();
    });
  }
});
