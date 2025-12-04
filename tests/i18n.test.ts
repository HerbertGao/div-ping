import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock Chrome i18n API
const mockGetMessage = jest.fn<(key: string, substitutions?: string | string[]) => string>();
const mockGetUILanguage = jest.fn<() => string>();
const mockGetAcceptLanguages = jest.fn<(callback: (languages: string[]) => void) => void>();

globalThis.chrome = {
  i18n: {
    getMessage: mockGetMessage,
    getUILanguage: mockGetUILanguage,
    getAcceptLanguages: mockGetAcceptLanguages,
  },
} as any;

// Import after mocking
import { t, getCurrentLanguage, getAcceptLanguages } from '../src/ts/i18n';

describe('i18n utility functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('t() - translation function', () => {
    it('should return translated message for valid key', () => {
      mockGetMessage.mockReturnValue('Hello World');

      const result = t('helloWorld');

      expect(mockGetMessage).toHaveBeenCalledWith('helloWorld', undefined);
      expect(result).toBe('Hello World');
    });

    it('should return key when translation not found', () => {
      mockGetMessage.mockReturnValue('');

      const result = t('nonexistentKey');

      expect(result).toBe('nonexistentKey');
    });

    it('should handle single substitution', () => {
      mockGetMessage.mockReturnValue('Hello, John!');

      const result = t('greeting', 'John');

      expect(mockGetMessage).toHaveBeenCalledWith('greeting', 'John');
      expect(result).toBe('Hello, John!');
    });

    it('should handle multiple substitutions', () => {
      mockGetMessage.mockReturnValue('Project: test-project, URL: https://example.com');

      const result = t('projectInfo', ['test-project', 'https://example.com']);

      expect(mockGetMessage).toHaveBeenCalledWith('projectInfo', ['test-project', 'https://example.com']);
      expect(result).toBe('Project: test-project, URL: https://example.com');
    });

    it('should handle empty string substitution', () => {
      mockGetMessage.mockReturnValue('Message with empty value: ');

      const result = t('messageKey', '');

      expect(mockGetMessage).toHaveBeenCalledWith('messageKey', '');
      expect(result).toBe('Message with empty value: ');
    });
  });

  describe('getCurrentLanguage()', () => {
    it('should return current UI language', () => {
      mockGetUILanguage.mockReturnValue('zh_CN');

      const result = getCurrentLanguage();

      expect(mockGetUILanguage).toHaveBeenCalled();
      expect(result).toBe('zh_CN');
    });

    it('should return English locale', () => {
      mockGetUILanguage.mockReturnValue('en');

      const result = getCurrentLanguage();

      expect(result).toBe('en');
    });
  });

  describe('getAcceptLanguages()', () => {
    it('should return accepted languages', async () => {
      mockGetAcceptLanguages.mockImplementation((callback) => {
        callback(['zh-CN', 'en-US', 'en']);
      });

      const result = await getAcceptLanguages();

      expect(mockGetAcceptLanguages).toHaveBeenCalled();
      expect(result).toEqual(['zh-CN', 'en-US', 'en']);
    });

    it('should return empty array when no languages', async () => {
      mockGetAcceptLanguages.mockImplementation((callback) => {
        callback([]);
      });

      const result = await getAcceptLanguages();

      expect(result).toEqual([]);
    });
  });
});
