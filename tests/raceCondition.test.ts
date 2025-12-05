import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock chrome storage
const mockStorageData: Record<string, unknown> = {};

globalThis.chrome = {
  storage: {
    local: {
      get: jest.fn((keys) => {
        const result: Record<string, unknown> = {};
        if (Array.isArray(keys)) {
          keys.forEach((key) => {
            if (key in mockStorageData) {
              result[key] = mockStorageData[key];
            }
          });
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items) => {
        Object.assign(mockStorageData, items);
        return Promise.resolve();
      }),
    },
  },
} as any;

import { storageManager } from '../src/ts/storageManager';
import type { Project } from '../src/ts/types';

describe('Race Condition Prevention in checkElement', () => {
  beforeEach(() => {
    // Clear mock storage before each test
    Object.keys(mockStorageData).forEach(key => delete mockStorageData[key]);
    jest.clearAllMocks();
  });

  describe('Atomic updateProject operations', () => {
    it('should prevent race condition when updating lastContent', async () => {
      // Setup: Create a project with initial lastContent
      const initialProject: Project = {
        id: 'test-project-1',
        name: 'Test Project',
        url: 'https://example.com',
        selector: '.test',
        interval: 60000,
        active: true,
        browserNotification: true,
        lastContent: 'initial content',
      };

      await storageManager.setProjects([initialProject]);

      // Simulate two concurrent updates
      const update1 = storageManager.updateProject('test-project-1', {
        lastContent: 'updated content 1',
        lastChecked: '2024-01-01T10:00:00Z',
      });

      const update2 = storageManager.updateProject('test-project-1', {
        lastContent: 'updated content 2',
        lastChecked: '2024-01-01T10:00:01Z',
      });

      // Wait for both updates to complete
      const [result1, result2] = await Promise.all([update1, update2]);

      // Both should succeed and return the project state
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();

      // Get final state
      const projects = await storageManager.getProjects();
      const finalProject = projects.find(p => p.id === 'test-project-1');

      // Final state should be one of the updates (last one wins due to sequential execution)
      expect(finalProject?.lastContent).toMatch(/^updated content [12]$/);
    });

    it('should return old project state before update', async () => {
      const project: Project = {
        id: 'test-project-2',
        name: 'Test Project 2',
        url: 'https://example.com',
        selector: '.test',
        interval: 60000,
        active: true,
        browserNotification: true,
        lastContent: 'old content',
      };

      await storageManager.setProjects([project]);

      // Update the project
      const updatedProject = await storageManager.updateProject('test-project-2', {
        lastContent: 'new content',
      });

      // updateProject should return the state BEFORE the update
      expect(updatedProject).not.toBeNull();
      expect(updatedProject?.lastContent).toBe('old content');

      // But storage should have the new content
      const projects = await storageManager.getProjects();
      const currentProject = projects.find(p => p.id === 'test-project-2');
      expect(currentProject?.lastContent).toBe('new content');
    });

    it('should handle multiple rapid updates sequentially', async () => {
      const project: Project = {
        id: 'test-project-3',
        name: 'Test Project 3',
        url: 'https://example.com',
        selector: '.test',
        interval: 60000,
        active: true,
        browserNotification: true,
        lastContent: 'content-0',
      };

      await storageManager.setProjects([project]);

      // Fire off 10 rapid updates
      const updates = Array.from({ length: 10 }, (_, i) =>
        storageManager.updateProject('test-project-3', {
          lastContent: `content-${i + 1}`,
        })
      );

      const results = await Promise.all(updates);

      // All updates should succeed
      results.forEach(result => {
        expect(result).not.toBeNull();
      });

      // Each update should have seen a different previous state
      const previousContents = results.map(r => r?.lastContent);

      // At least some should be different (proving sequential execution)
      const uniqueContents = new Set(previousContents);
      expect(uniqueContents.size).toBeGreaterThan(1);
    });

    it('should prevent duplicate notifications in concurrent checks', async () => {
      // This test simulates the actual checkElement scenario
      const project: Project = {
        id: 'test-project-4',
        name: 'Test Project 4',
        url: 'https://example.com',
        selector: '.test',
        interval: 60000,
        active: true,
        browserNotification: true,
        lastContent: 'old content',
      };

      await storageManager.setProjects([project]);

      // Simulate two concurrent checks detecting the same new content
      const newContent = 'new content';

      // Each "check" atomically updates and gets the old value
      const check1Promise = storageManager.updateProject('test-project-4', {
        lastContent: newContent,
        lastChecked: new Date().toISOString(),
      });

      const check2Promise = storageManager.updateProject('test-project-4', {
        lastContent: newContent,
        lastChecked: new Date().toISOString(),
      });

      const [check1Result, check2Result] = await Promise.all([check1Promise, check2Promise]);

      // Due to sequential execution:
      // - First update sees 'old content'
      // - Second update sees 'new content' (already updated by first)

      const oldContents = [check1Result?.lastContent, check2Result?.lastContent];

      // One should see old content, one should see new content
      expect(oldContents).toContain('old content');
      expect(oldContents).toContain('new content');

      // This proves only ONE would trigger a notification (the one that saw 'old content')
      const wouldNotify = oldContents.filter(content => content === 'old content');
      expect(wouldNotify).toHaveLength(1);
    });
  });

  describe('updateProject edge cases', () => {
    it('should return null when project does not exist', async () => {
      const result = await storageManager.updateProject('non-existent', {
        lastContent: 'test',
      });

      expect(result).toBeNull();
    });

    it('should handle partial updates correctly', async () => {
      const project: Project = {
        id: 'test-project-5',
        name: 'Test Project 5',
        url: 'https://example.com',
        selector: '.test',
        interval: 60000,
        active: true,
        browserNotification: true,
        lastContent: 'content',
      };

      await storageManager.setProjects([project]);

      // Update only lastChecked, not lastContent
      const updated = await storageManager.updateProject('test-project-5', {
        lastChecked: '2024-01-01T12:00:00Z',
      });

      expect(updated?.lastContent).toBe('content');

      // Verify storage
      const projects = await storageManager.getProjects();
      const savedProject = projects.find(p => p.id === 'test-project-5');
      expect(savedProject?.lastContent).toBe('content');
      expect(savedProject?.lastChecked).toBe('2024-01-01T12:00:00Z');
    });
  });

  describe('Performance under concurrent load', () => {
    it('should handle 50 concurrent operations without data corruption', async () => {
      const projects: Project[] = Array.from({ length: 5 }, (_, i) => ({
        id: `project-${i}`,
        name: `Project ${i}`,
        url: 'https://example.com',
        selector: '.test',
        interval: 60000,
        active: true,
        browserNotification: true,
        lastContent: `initial-${i}`,
      }));

      await storageManager.setProjects(projects);

      // Create 50 concurrent operations across different projects
      const operations = Array.from({ length: 50 }, (_, i) => {
        const projectId = `project-${i % 5}`;
        return storageManager.updateProject(projectId, {
          lastContent: `update-${i}`,
        });
      });

      const results = await Promise.all(operations);

      // All operations should complete successfully
      expect(results.filter(r => r !== null)).toHaveLength(50);

      // Verify data integrity
      const finalProjects = await storageManager.getProjects();
      expect(finalProjects).toHaveLength(5);

      // Each project should have one of the updates
      finalProjects.forEach(project => {
        expect(project.lastContent).toMatch(/^update-\d+$/);
      });
    });
  });
});
