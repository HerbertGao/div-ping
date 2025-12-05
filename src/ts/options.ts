import { Settings, ExportData } from './types';
import { storageManager } from './storageManager';
import { t, initI18nForHTML } from './i18n';

// Options page logic
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
    initI18nForHTML();
    await this.loadSettings();
    await this.loadStats();
    this.attachEventListeners();
    this.updateVariablesList();
  }

  private async loadSettings(): Promise<void> {
    const data = await storageManager.getSettings<Settings>();
    const settings: Settings = { ...this.defaultSettings, ...data };

    // Fill form
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

  private updateVariablesList(): void {
    const variablesList = this.getElement('variablesList');
    if (variablesList) {
      variablesList.textContent = `{{projectId}}      - ${t('variablesProjectId')}
{{projectName}}    - ${t('variablesProjectName')}
{{url}}            - ${t('variablesUrl')}
{{selector}}       - ${t('variablesSelector')}
{{oldContent}}     - ${t('variablesOldContent')}
{{newContent}}     - ${t('variablesNewContent')}
{{timestamp}}      - ${t('variablesTimestamp')}`;
    }
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
    this.showStatus(t('settingsSaved'), 'success');
  }

  private async resetSettings(): Promise<void> {
    if (confirm(t('dataClearedConfirm'))) {
      await storageManager.setSettings(this.defaultSettings);
      await this.loadSettings();
      this.showStatus(t('settingsReset'), 'success');
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

    this.showStatus(t('dataExported'), 'success');
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
        throw new Error(t('invalidFile'));
      }

      if (confirm(t('dataClearedConfirm'))) {
        await storageManager.setProjects(data.projects);
        await storageManager.setSettings(data.settings || this.defaultSettings);

        await this.loadSettings();
        await this.loadStats();
        this.showStatus(t('dataImported'), 'success');

        // Restart all active monitors
        data.projects.forEach(project => {
          if (project.active) {
            chrome.runtime.sendMessage({ action: 'startMonitor', project });
          }
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('error');
      this.showStatus(t('invalidFile') + ': ' + errorMessage, 'error');
    }
  }

  private async clearData(): Promise<void> {
    const confirmation = prompt(t('dataClearedConfirm'));
    if (confirmation === 'DELETE') {
      await chrome.storage.local.clear();
      await this.loadSettings();
      await this.loadStats();
      this.showStatus(t('dataCleared'), 'success');

      // Stop all monitors
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
        const file = target.files[0];
        if (file) {
          this.handleImportFile(file);
          target.value = ''; // Reset file input
        }
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

// Initialize
new OptionsManager();
