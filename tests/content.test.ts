import { describe, expect, it } from '@jest/globals';

/**
 * Tests for content script functionality
 * Focus on edge cases and null safety
 */

describe('Content Script - Element Selection', () => {
  describe('getElementContent()', () => {
    // Mock function to simulate getElementContent behavior
    const getElementContent = (element: HTMLElement | null): string => {
      if (!element) {
        return '';
      }
      return element.innerText || element.textContent || element.innerHTML || '';
    };

    it('should return empty string when element is null', () => {
      const result = getElementContent(null);
      expect(result).toBe('');
    });

    it('should return innerText when available', () => {
      const element = {
        innerText: 'Test Content',
        textContent: 'Fallback',
        innerHTML: '<span>HTML</span>'
      } as HTMLElement;

      const result = getElementContent(element);
      expect(result).toBe('Test Content');
    });

    it('should fallback to textContent when innerText is empty', () => {
      const element = {
        innerText: '',
        textContent: 'Text Content',
        innerHTML: '<span>HTML</span>'
      } as HTMLElement;

      const result = getElementContent(element);
      expect(result).toBe('Text Content');
    });

    it('should fallback to innerHTML when both innerText and textContent are empty', () => {
      const element = {
        innerText: '',
        textContent: '',
        innerHTML: '<span>HTML Content</span>'
      } as HTMLElement;

      const result = getElementContent(element);
      expect(result).toBe('<span>HTML Content</span>');
    });

    it('should return empty string when all content properties are empty', () => {
      const element = {
        innerText: '',
        textContent: '',
        innerHTML: ''
      } as HTMLElement;

      const result = getElementContent(element);
      expect(result).toBe('');
    });
  });

  describe('showConfigDialog() - Initial Content Logic', () => {
    const getElementContent = (element: HTMLElement | null): string => {
      if (!element) {
        return '';
      }
      return element.innerText || element.textContent || element.innerHTML || '';
    };

    // Simulate the initialContent logic from showConfigDialog
    const getInitialContent = (
      element: HTMLElement | null,
      existingProject?: { lastContent?: string; selector: string }
    ): string => {
      return existingProject
        ? existingProject.lastContent || (element ? getElementContent(element) : '')
        : getElementContent(element!);
    };

    it('should use lastContent for existing project when available', () => {
      const element = { innerText: 'Current Element' } as HTMLElement;
      const project = { selector: '.test', lastContent: 'Saved Content' };

      const result = getInitialContent(element, project);

      expect(result).toBe('Saved Content');
    });

    it('should use element content when lastContent is falsy (undefined)', () => {
      const element = { innerText: 'Current Element' } as HTMLElement;
      const project = { selector: '.test', lastContent: undefined };

      const result = getInitialContent(element, project);

      expect(result).toBe('Current Element');
    });

    it('should use element content when lastContent is empty string', () => {
      const element = { innerText: 'Current Element' } as HTMLElement;
      const project = { selector: '.test', lastContent: '' };

      const result = getInitialContent(element, project);

      expect(result).toBe('Current Element');
    });

    it('should return empty string when editing project with null element and no lastContent', () => {
      const element = null;
      const project = { selector: '.missing', lastContent: undefined };

      const result = getInitialContent(element, project);

      expect(result).toBe('');
    });

    it('should return empty string when editing project with null element and empty lastContent', () => {
      const element = null;
      const project = { selector: '.missing', lastContent: '' };

      const result = getInitialContent(element, project);

      expect(result).toBe('');
    });

    it('should NOT crash when editing project with null element (bug regression test)', () => {
      const element = null;
      const project = { selector: '.removed-element', lastContent: '' };

      // This should not throw an error
      expect(() => {
        const result = getInitialContent(element, project);
        expect(result).toBe('');
      }).not.toThrow();
    });

    it('should handle new project with valid element', () => {
      const element = { innerText: 'New Element Content' } as HTMLElement;

      const result = getInitialContent(element, undefined);

      expect(result).toBe('New Element Content');
    });

    it('should prioritize lastContent over element content for existing projects', () => {
      const element = { innerText: 'Current Content' } as HTMLElement;
      const project = { selector: '.test', lastContent: 'Old Content' };

      const result = getInitialContent(element, project);

      // Should use lastContent, not current element content
      expect(result).toBe('Old Content');
      expect(result).not.toBe('Current Content');
    });
  });

  describe('Edge Cases', () => {
    it('should handle element with only whitespace', () => {
      const getElementContent = (element: HTMLElement | null): string => {
        if (!element) {
          return '';
        }
        return element.innerText || element.textContent || element.innerHTML || '';
      };

      const element = {
        innerText: '   \n\t   ',
        textContent: '   ',
        innerHTML: '   '
      } as HTMLElement;

      const result = getElementContent(element);
      expect(result).toBe('   \n\t   ');
    });

    it('should handle element with special characters', () => {
      const getElementContent = (element: HTMLElement | null): string => {
        if (!element) {
          return '';
        }
        return element.innerText || element.textContent || element.innerHTML || '';
      };

      const element = {
        innerText: 'Content with "quotes" and <tags>',
        textContent: '',
        innerHTML: ''
      } as HTMLElement;

      const result = getElementContent(element);
      expect(result).toBe('Content with "quotes" and <tags>');
    });
  });
});
