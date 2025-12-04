import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Project, LogEntry } from '../src/ts/types';

/**
 * Mock Chrome Storage API
 */
const mockGet = jest.fn<(keys: string[]) => Promise<Record<string, any>>>();
const mockSet = jest.fn<(items: Record<string, any>) => Promise<void>>();

globalThis.chrome = {
  storage: {
    local: {
      get: mockGet as any,
      set: mockSet as any,
    },
  },
} as any;

// Import StorageManager after mocking
import { storageManager } from '../src/ts/storageManager';

describe('StorageManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProjects()', () => {
    it('should return empty array when no projects exist', async () => {
      mockGet.mockResolvedValue({});

      const result = await storageManager.getProjects();

      expect(mockGet).toHaveBeenCalledWith(['projects']);
      expect(result).toEqual([]);
    });

    it('should return stored projects', async () => {
      const mockProjects: Project[] = [
        {
          id: '1',
          name: 'Test Project',
          url: 'https://example.com',
          selector: '.test',
          interval: 60000,
          active: true,
          browserNotification: true,
        },
      ];

      mockGet.mockResolvedValue({ projects: mockProjects });

      const result = await storageManager.getProjects();

      expect(result).toEqual(mockProjects);
    });
  });

  describe('setProjects()', () => {
    it('should save projects to storage', async () => {
      const projects: Project[] = [
        {
          id: '1',
          name: 'Test',
          url: 'https://example.com',
          selector: '.test',
          interval: 60000,
          active: true,
          browserNotification: true,
        },
      ];

      mockSet.mockResolvedValue(undefined);

      await storageManager.setProjects(projects);

      expect(mockSet).toHaveBeenCalledWith({ projects });
    });
  });

  describe('addProject()', () => {
    it('should add new project to storage', async () => {
      const existingProjects: Project[] = [];
      const newProject: Project = {
        id: '1',
        name: 'New Project',
        url: 'https://example.com',
        selector: '.test',
        interval: 60000,
        active: true,
        browserNotification: true,
      };

      mockGet.mockResolvedValue({ projects: existingProjects });
      mockSet.mockResolvedValue(undefined);

      await storageManager.addProject(newProject);

      expect(mockGet).toHaveBeenCalledWith(['projects']);
      expect(mockSet).toHaveBeenCalledWith({ projects: [newProject] });
    });

    it('should append project to existing projects', async () => {
      const existingProject: Project = {
        id: '1',
        name: 'Existing',
        url: 'https://example.com',
        selector: '.old',
        interval: 60000,
        active: true,
        browserNotification: true,
      };

      const newProject: Project = {
        id: '2',
        name: 'New',
        url: 'https://test.com',
        selector: '.new',
        interval: 120000,
        active: false,
        browserNotification: false,
      };

      mockGet.mockResolvedValue({ projects: [existingProject] });
      mockSet.mockResolvedValue(undefined);

      await storageManager.addProject(newProject);

      expect(mockSet).toHaveBeenCalledWith({ projects: [existingProject, newProject] });
    });
  });

  describe('updateProject()', () => {
    it('should update existing project', async () => {
      const project: Project = {
        id: '1',
        name: 'Original',
        url: 'https://example.com',
        selector: '.test',
        interval: 60000,
        active: true,
        browserNotification: true,
      };

      mockGet.mockResolvedValue({ projects: [project] });
      mockSet.mockResolvedValue(undefined);

      const updates = { name: 'Updated', interval: 120000 };
      const result = await storageManager.updateProject('1', updates);

      expect(result).toEqual({ ...project, ...updates });
      expect(mockSet).toHaveBeenCalledWith({ projects: [{ ...project, ...updates }] });
    });

    it('should return null when project not found', async () => {
      mockGet.mockResolvedValue({ projects: [] });

      const result = await storageManager.updateProject('nonexistent', { name: 'Test' });

      expect(result).toBeNull();
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should update only specified fields', async () => {
      const project: Project = {
        id: '1',
        name: 'Test',
        url: 'https://example.com',
        selector: '.test',
        interval: 60000,
        active: true,
        browserNotification: true,
      };

      mockGet.mockResolvedValue({ projects: [project] });
      mockSet.mockResolvedValue(undefined);

      await storageManager.updateProject('1', { active: false });

      const expectedProject = { ...project, active: false };
      expect(mockSet).toHaveBeenCalledWith({ projects: [expectedProject] });
    });
  });

  describe('removeProject()', () => {
    it('should remove project from storage', async () => {
      const projects: Project[] = [
        {
          id: '1',
          name: 'Keep',
          url: 'https://example.com',
          selector: '.keep',
          interval: 60000,
          active: true,
          browserNotification: true,
        },
        {
          id: '2',
          name: 'Remove',
          url: 'https://test.com',
          selector: '.remove',
          interval: 60000,
          active: true,
          browserNotification: true,
        },
      ];

      mockGet.mockResolvedValue({ projects });
      mockSet.mockResolvedValue(undefined);

      const result = await storageManager.removeProject('2');

      expect(result).toBe(true);
      expect(mockSet).toHaveBeenCalledWith({ projects: [projects[0]] });
    });

    it('should return false when project not found', async () => {
      mockGet.mockResolvedValue({ projects: [] });

      const result = await storageManager.removeProject('nonexistent');

      expect(result).toBe(false);
      expect(mockSet).not.toHaveBeenCalled();
    });
  });

  describe('Log management', () => {
    describe('addLog()', () => {
      it('should add log entry for project', async () => {
        const logEntry: LogEntry = {
          timestamp: new Date().toISOString(),
          content: 'test content',
          success: true,
        };

        mockGet.mockResolvedValue({ logs: {} });
        mockSet.mockResolvedValue(undefined);

        await storageManager.addLog('project1', logEntry);

        expect(mockSet).toHaveBeenCalledWith({
          logs: { project1: [logEntry] },
        });
      });

      it('should prepend new log to existing logs', async () => {
        const oldLog: LogEntry = {
          timestamp: '2024-01-01T00:00:00Z',
          content: 'old',
          success: true,
        };

        const newLog: LogEntry = {
          timestamp: '2024-01-02T00:00:00Z',
          content: 'new',
          success: true,
        };

        mockGet.mockResolvedValue({ logs: { project1: [oldLog] } });
        mockSet.mockResolvedValue(undefined);

        await storageManager.addLog('project1', newLog);

        expect(mockSet).toHaveBeenCalledWith({
          logs: { project1: [newLog, oldLog] },
        });
      });

      it('should limit logs to MAX_LOGS_PER_PROJECT', async () => {
        const existingLogs: LogEntry[] = Array.from({ length: 100 }, (_, i) => ({
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
          content: `log ${i}`,
          success: true,
        }));

        const newLog: LogEntry = {
          timestamp: new Date().toISOString(),
          content: 'newest',
          success: true,
        };

        mockGet.mockResolvedValue({ logs: { project1: existingLogs } });
        mockSet.mockResolvedValue(undefined);

        await storageManager.addLog('project1', newLog);

        const savedLogs = (mockSet.mock.calls[0][0] as any).logs.project1;
        expect(savedLogs.length).toBe(100); // Should not exceed limit
        expect(savedLogs[0]).toEqual(newLog); // New log should be first
        expect(savedLogs[savedLogs.length - 1]).not.toEqual(existingLogs[existingLogs.length - 1]); // Oldest should be removed
      });
    });

    describe('getProjectLogs()', () => {
      it('should return logs for project', async () => {
        const logs: LogEntry[] = [
          { timestamp: '2024-01-01T00:00:00Z', content: 'test', success: true },
        ];

        mockGet.mockResolvedValue({ logs: { project1: logs } });

        const result = await storageManager.getProjectLogs('project1');

        expect(result).toEqual(logs);
      });

      it('should return empty array when no logs exist', async () => {
        mockGet.mockResolvedValue({ logs: {} });

        const result = await storageManager.getProjectLogs('project1');

        expect(result).toEqual([]);
      });
    });

    describe('clearProjectLogs()', () => {
      it('should remove logs for project', async () => {
        mockGet.mockResolvedValue({
          logs: {
            project1: [{ timestamp: '2024-01-01T00:00:00Z', content: 'test', success: true }],
            project2: [{ timestamp: '2024-01-01T00:00:00Z', content: 'test', success: true }],
          },
        });
        mockSet.mockResolvedValue(undefined);

        await storageManager.clearProjectLogs('project1');

        expect(mockSet).toHaveBeenCalledWith({
          logs: {
            project2: [{ timestamp: '2024-01-01T00:00:00Z', content: 'test', success: true }],
          },
        });
      });
    });
  });

  describe('Settings management', () => {
    it('should get settings', async () => {
      const settings = { defaultInterval: 60, theme: 'dark' };
      mockGet.mockResolvedValue({ settings });

      const result = await storageManager.getSettings();

      expect(result).toEqual(settings);
    });

    it('should return empty object when no settings', async () => {
      mockGet.mockResolvedValue({});

      const result = await storageManager.getSettings();

      expect(result).toEqual({});
    });

    it('should set settings', async () => {
      const settings = { defaultInterval: 120 };
      mockSet.mockResolvedValue(undefined);

      await storageManager.setSettings(settings);

      expect(mockSet).toHaveBeenCalledWith({ settings });
    });
  });

  describe('Race condition prevention', () => {
    it('should execute operations sequentially', async () => {
      const executionOrder: string[] = [];

      // Mock operations that track execution order
      mockGet.mockImplementation(async () => {
        executionOrder.push('get-start');
        await new Promise(resolve => setTimeout(resolve, 10));
        executionOrder.push('get-end');
        return { projects: [] };
      });

      mockSet.mockImplementation(async () => {
        executionOrder.push('set-start');
        await new Promise(resolve => setTimeout(resolve, 10));
        executionOrder.push('set-end');
      });

      // Execute operations concurrently
      const promises = [
        storageManager.getProjects(),
        storageManager.setProjects([]),
        storageManager.getProjects(),
      ];

      await Promise.all(promises);

      // Verify operations executed sequentially, not concurrently
      expect(executionOrder).toEqual([
        'get-start',
        'get-end',
        'set-start',
        'set-end',
        'get-start',
        'get-end',
      ]);
    });
  });
});
