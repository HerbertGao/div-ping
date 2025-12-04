import { Settings, ExportData } from './types';
import { storageManager } from './storageManager';

// 设置页面逻辑
class OptionsManager {
  private defaultSettings: Settings = {
    defaultInterval: 30,
    defaultBrowserNotification: true,
    defaultWebhook: false,
    defaultWebhookUrl: '',
    webhookTimeout: 10,
    autoReload: true,
    soundNotification: false,
    maxRetries: 3
  };

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    await this.loadSettings();
    await this.loadStats();
    this.attachEventListeners();
  }

  private async loadSettings(): Promise<void> {
    const data = await storageManager.getSettings<Settings>();
    const settings: Settings = { ...this.defaultSettings, ...data };

    // 填充表单
    this.getElement<HTMLInputElement>('defaultInterval').value = settings.defaultInterval.toString();
    this.getElement<HTMLInputElement>('defaultBrowserNotification').checked = settings.defaultBrowserNotification;
    this.getElement<HTMLInputElement>('defaultWebhook').checked = settings.defaultWebhook;
    this.getElement<HTMLInputElement>('defaultWebhookUrl').value = settings.defaultWebhookUrl;
    this.getElement<HTMLInputElement>('webhookTimeout').value = settings.webhookTimeout.toString();
    this.getElement<HTMLInputElement>('autoReload').checked = settings.autoReload;
    this.getElement<HTMLInputElement>('soundNotification').checked = settings.soundNotification;
    this.getElement<HTMLInputElement>('maxRetries').value = settings.maxRetries.toString();
  }

  private async loadStats(): Promise<void> {
    const projects = await storageManager.getProjects();

    this.getElement('totalProjects').textContent = projects.length.toString();
    this.getElement('activeProjects').textContent = projects.filter(p => p.active).length.toString();
    this.getElement('pausedProjects').textContent = projects.filter(p => !p.active).length.toString();
  }

  private async saveSettings(): Promise<void> {
    const settings: Settings = {
      defaultInterval: parseInt(this.getElement<HTMLInputElement>('defaultInterval').value),
      defaultBrowserNotification: this.getElement<HTMLInputElement>('defaultBrowserNotification').checked,
      defaultWebhook: this.getElement<HTMLInputElement>('defaultWebhook').checked,
      defaultWebhookUrl: this.getElement<HTMLInputElement>('defaultWebhookUrl').value,
      webhookTimeout: parseInt(this.getElement<HTMLInputElement>('webhookTimeout').value),
      autoReload: this.getElement<HTMLInputElement>('autoReload').checked,
      soundNotification: this.getElement<HTMLInputElement>('soundNotification').checked,
      maxRetries: parseInt(this.getElement<HTMLInputElement>('maxRetries').value)
    };

    await storageManager.setSettings(settings);
    this.showStatus('设置已保存', 'success');
  }

  private async resetSettings(): Promise<void> {
    if (confirm('确定要恢复默认设置吗?')) {
      await storageManager.setSettings(this.defaultSettings);
      await this.loadSettings();
      this.showStatus('已恢复默认设置', 'success');
    }
  }

  private async exportData(): Promise<void> {
    const data = await storageManager.getAllData<Settings>();
    const exportData: ExportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      projects: data.projects,
      settings: data.settings || this.defaultSettings
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `div-ping-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.showStatus('配置已导出', 'success');
  }

  private async importData(): Promise<void> {
    const input = this.getElement<HTMLInputElement>('importFile');
    input.click();
  }

  private async handleImportFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const data: ExportData = JSON.parse(text);

      if (!data.version || !data.projects) {
        throw new Error('无效的配置文件格式');
      }

      if (confirm('导入配置将覆盖现有数据,确定继续吗?')) {
        await storageManager.setProjects(data.projects);
        await storageManager.setSettings(data.settings || this.defaultSettings);

        await this.loadSettings();
        await this.loadStats();
        this.showStatus('配置已导入', 'success');

        // 重启所有活动监控
        data.projects.forEach(project => {
          if (project.active) {
            chrome.runtime.sendMessage({ action: 'startMonitor', project });
          }
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.showStatus('导入失败: ' + errorMessage, 'error');
    }
  }

  private async clearData(): Promise<void> {
    const confirmation = prompt('此操作将删除所有监控项目和设置。请输入"DELETE"确认:');
    if (confirmation === 'DELETE') {
      await chrome.storage.local.clear();
      await this.loadSettings();
      await this.loadStats();
      this.showStatus('所有数据已清除', 'success');

      // 停止所有监控
      chrome.runtime.sendMessage({ action: 'stopAllMonitors' });
    }
  }

  private showStatus(message: string, type: 'success' | 'error'): void {
    const statusEl = this.getElement('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';

    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }

  private attachEventListeners(): void {
    this.getElement('saveBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    this.getElement('resetBtn').addEventListener('click', () => {
      this.resetSettings();
    });

    this.getElement('exportData').addEventListener('click', () => {
      this.exportData();
    });

    this.getElement('importData').addEventListener('click', () => {
      this.importData();
    });

    this.getElement<HTMLInputElement>('importFile').addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        this.handleImportFile(target.files[0]);
        target.value = ''; // 重置文件输入
      }
    });

    this.getElement('clearData').addEventListener('click', () => {
      this.clearData();
    });
  }

  private getElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element with id "${id}" not found`);
    }
    return element as T;
  }
}

// 初始化
new OptionsManager();
