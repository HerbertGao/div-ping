// 设置页面逻辑
class OptionsManager {
  constructor() {
    this.defaultSettings = {
      defaultInterval: 30,
      defaultBrowserNotification: true,
      defaultWebhook: false,
      defaultWebhookUrl: '',
      webhookTimeout: 10,
      autoReload: true,
      soundNotification: false,
      maxRetries: 3
    };
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStats();
    this.attachEventListeners();
  }

  async loadSettings() {
    const data = await chrome.storage.local.get(['settings']);
    const settings = { ...this.defaultSettings, ...(data.settings || {}) };

    // 填充表单
    document.getElementById('defaultInterval').value = settings.defaultInterval;
    document.getElementById('defaultBrowserNotification').checked = settings.defaultBrowserNotification;
    document.getElementById('defaultWebhook').checked = settings.defaultWebhook;
    document.getElementById('defaultWebhookUrl').value = settings.defaultWebhookUrl;
    document.getElementById('webhookTimeout').value = settings.webhookTimeout;
    document.getElementById('autoReload').checked = settings.autoReload;
    document.getElementById('soundNotification').checked = settings.soundNotification;
    document.getElementById('maxRetries').value = settings.maxRetries;
  }

  async loadStats() {
    const data = await chrome.storage.local.get(['projects']);
    const projects = data.projects || [];

    document.getElementById('totalProjects').textContent = projects.length;
    document.getElementById('activeProjects').textContent = projects.filter(p => p.active).length;
    document.getElementById('pausedProjects').textContent = projects.filter(p => !p.active).length;
  }

  async saveSettings() {
    const settings = {
      defaultInterval: parseInt(document.getElementById('defaultInterval').value),
      defaultBrowserNotification: document.getElementById('defaultBrowserNotification').checked,
      defaultWebhook: document.getElementById('defaultWebhook').checked,
      defaultWebhookUrl: document.getElementById('defaultWebhookUrl').value,
      webhookTimeout: parseInt(document.getElementById('webhookTimeout').value),
      autoReload: document.getElementById('autoReload').checked,
      soundNotification: document.getElementById('soundNotification').checked,
      maxRetries: parseInt(document.getElementById('maxRetries').value)
    };

    await chrome.storage.local.set({ settings });
    this.showStatus('设置已保存', 'success');
  }

  async resetSettings() {
    if (confirm('确定要恢复默认设置吗?')) {
      await chrome.storage.local.set({ settings: this.defaultSettings });
      await this.loadSettings();
      this.showStatus('已恢复默认设置', 'success');
    }
  }

  async exportData() {
    const data = await chrome.storage.local.get(['projects', 'settings']);
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      projects: data.projects || [],
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

  async importData() {
    const input = document.getElementById('importFile');
    input.click();
  }

  async handleImportFile(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.projects) {
        throw new Error('无效的配置文件格式');
      }

      if (confirm('导入配置将覆盖现有数据,确定继续吗?')) {
        await chrome.storage.local.set({
          projects: data.projects,
          settings: data.settings || this.defaultSettings
        });

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
      this.showStatus('导入失败: ' + error.message, 'error');
    }
  }

  async clearData() {
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

  showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';

    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }

  attachEventListeners() {
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
      this.resetSettings();
    });

    document.getElementById('exportData').addEventListener('click', () => {
      this.exportData();
    });

    document.getElementById('importData').addEventListener('click', () => {
      this.importData();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleImportFile(e.target.files[0]);
        e.target.value = ''; // 重置文件输入
      }
    });

    document.getElementById('clearData').addEventListener('click', () => {
      this.clearData();
    });
  }
}

// 初始化
const optionsManager = new OptionsManager();
