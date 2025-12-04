import { Project, LogEntry } from './types';
import { LIMITS } from './constants';

/**
 * Storage Manager with mutex lock to prevent race conditions
 *
 * Problem: Multiple concurrent reads and writes to chrome.storage.local can cause data loss
 * Solution: Queue all operations and execute them sequentially
 */
class StorageManager {
  private operationQueue: Promise<unknown> = Promise.resolve();

  /**
   * Execute an operation with mutex lock
   * Ensures operations are executed sequentially to prevent race conditions
   */
  private async executeWithLock<T>(operation: () => Promise<T>): Promise<T> {
    // Chain the new operation after the current queue
    const currentOperation = this.operationQueue.then(operation);

    // Update queue to point to the new operation (ignoring errors from previous operations)
    this.operationQueue = currentOperation.catch((error) => {
      // Log errors but don't block the queue
      console.error('Storage operation failed:', error);
      // Note: Individual operations will still reject with their errors
      // This catch is only to prevent queue blocking
    });

    return currentOperation;
  }

  /**
   * Get projects from storage
   */
  async getProjects(): Promise<Project[]> {
    return this.executeWithLock(async () => {
      const data = await chrome.storage.local.get(['projects']);
      return (data.projects as Project[] | undefined) || [];
    });
  }

  /**
   * Set projects to storage
   */
  async setProjects(projects: Project[]): Promise<void> {
    return this.executeWithLock(async () => {
      await chrome.storage.local.set({ projects });
    });
  }

  /**
   * Update a single project atomically
   */
  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project | null> {
    return this.executeWithLock(async () => {
      const projects = await chrome.storage.local.get(['projects']).then(
        data => (data.projects as Project[] | undefined) || []
      );

      const index = projects.findIndex(p => p.id === projectId);
      if (index === -1) return null;

      // Apply updates
      projects[index] = { ...projects[index], ...updates };

      await chrome.storage.local.set({ projects });
      return projects[index];
    });
  }

  /**
   * Add a new project
   */
  async addProject(project: Project): Promise<void> {
    return this.executeWithLock(async () => {
      const projects = await chrome.storage.local.get(['projects']).then(
        data => (data.projects as Project[] | undefined) || []
      );

      projects.push(project);
      await chrome.storage.local.set({ projects });
    });
  }

  /**
   * Remove a project
   */
  async removeProject(projectId: string): Promise<boolean> {
    return this.executeWithLock(async () => {
      const projects = await chrome.storage.local.get(['projects']).then(
        data => (data.projects as Project[] | undefined) || []
      );

      const initialLength = projects.length;
      const filtered = projects.filter(p => p.id !== projectId);

      if (filtered.length === initialLength) return false;

      await chrome.storage.local.set({ projects: filtered });
      return true;
    });
  }

  /**
   * Get logs for a project
   */
  async getProjectLogs(projectId: string): Promise<LogEntry[]> {
    return this.executeWithLock(async () => {
      const data = await chrome.storage.local.get(['logs']);
      const logs: Record<string, LogEntry[]> = (data.logs as Record<string, LogEntry[]> | undefined) || {};
      return logs[projectId] || [];
    });
  }

  /**
   * Add a log entry for a project
   */
  async addLog(projectId: string, logEntry: LogEntry): Promise<void> {
    return this.executeWithLock(async () => {
      const data = await chrome.storage.local.get(['logs']);
      const logs: Record<string, LogEntry[]> = (data.logs as Record<string, LogEntry[]> | undefined) || {};

      if (!logs[projectId]) {
        logs[projectId] = [];
      }

      logs[projectId].unshift(logEntry);

      // Keep only last N logs per project
      if (logs[projectId].length > LIMITS.MAX_LOGS_PER_PROJECT) {
        logs[projectId] = logs[projectId].slice(0, LIMITS.MAX_LOGS_PER_PROJECT);
      }

      await chrome.storage.local.set({ logs });
    });
  }

  /**
   * Clear logs for a project
   */
  async clearProjectLogs(projectId: string): Promise<void> {
    return this.executeWithLock(async () => {
      const data = await chrome.storage.local.get(['logs']);
      const logs: Record<string, LogEntry[]> = (data.logs as Record<string, LogEntry[]> | undefined) || {};

      delete logs[projectId];
      await chrome.storage.local.set({ logs });
    });
  }

  /**
   * Get settings from storage
   */
  async getSettings<T = Record<string, unknown>>(): Promise<T> {
    return this.executeWithLock(async () => {
      const data = await chrome.storage.local.get(['settings']);
      return (data.settings as T | undefined) || ({} as T);
    });
  }

  /**
   * Set settings to storage
   */
  async setSettings<T = Record<string, unknown>>(settings: T): Promise<void> {
    return this.executeWithLock(async () => {
      await chrome.storage.local.set({ settings });
    });
  }

  /**
   * Get all data (for export)
   */
  async getAllData<T = Record<string, unknown>>(): Promise<{ projects: Project[]; settings: T }> {
    return this.executeWithLock(async () => {
      const data = await chrome.storage.local.get(['projects', 'settings']);
      return {
        projects: (data.projects as Project[] | undefined) || [],
        settings: (data.settings as T | undefined) || ({} as T)
      };
    });
  }
}

// Export singleton instance
export const storageManager = new StorageManager();
