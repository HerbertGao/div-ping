import { describe, it, expect } from '@jest/globals';
import {
  validateProjectName,
  validateUrl,
  validateSelector,
  validateInterval,
  validateWebhookBody,
} from '../src/ts/validation';
import { LIMITS } from '../src/ts/constants';

describe('Validation Module', () => {
  describe('validateProjectName()', () => {
    it('should accept valid project names', () => {
      expect(validateProjectName('My Project')).toEqual({ valid: true });
      expect(validateProjectName('Test123')).toEqual({ valid: true });
      expect(validateProjectName('a')).toEqual({ valid: true });
    });

    it('should reject empty names', () => {
      const result = validateProjectName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject names that are too long', () => {
      const longName = 'a'.repeat(LIMITS.MAX_PROJECT_NAME_LENGTH + 1);
      const result = validateProjectName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed');
    });

    it('should accept name at exact max length', () => {
      const maxName = 'a'.repeat(LIMITS.MAX_PROJECT_NAME_LENGTH);
      expect(validateProjectName(maxName)).toEqual({ valid: true });
    });
  });

  describe('validateUrl()', () => {
    it('should accept valid HTTP URLs', () => {
      expect(validateUrl('http://example.com')).toEqual({ valid: true });
      expect(validateUrl('http://example.com:8080/path')).toEqual({ valid: true });
    });

    it('should accept valid HTTPS URLs', () => {
      expect(validateUrl('https://example.com')).toEqual({ valid: true });
      expect(validateUrl('https://example.com/path?query=1')).toEqual({ valid: true });
    });

    it('should reject empty URLs', () => {
      const result = validateUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject invalid URL formats', () => {
      const result = validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL format');
    });

    it('should reject non-HTTP(S) protocols', () => {
      expect(validateUrl('ftp://example.com').valid).toBe(false);
      expect(validateUrl('file:///etc/passwd').valid).toBe(false);
      expect(validateUrl('javascript:alert(1)').valid).toBe(false);
    });

    it('should reject URLs that are too long', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(LIMITS.MAX_URL_LENGTH);
      const result = validateUrl(longUrl);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed');
    });

    it('should accept URL at exact max length', () => {
      const path = 'a'.repeat(LIMITS.MAX_URL_LENGTH - 'https://example.com/'.length);
      const maxUrl = `https://example.com/${path}`;
      expect(validateUrl(maxUrl)).toEqual({ valid: true });
    });
  });

  describe('validateSelector()', () => {
    it('should accept valid CSS selectors', () => {
      expect(validateSelector('div')).toEqual({ valid: true });
      expect(validateSelector('.class-name')).toEqual({ valid: true });
      expect(validateSelector('#id')).toEqual({ valid: true });
      expect(validateSelector('div > p.highlight')).toEqual({ valid: true });
      expect(validateSelector('[data-test="value"]')).toEqual({ valid: true });
    });

    it('should reject empty selectors', () => {
      const result = validateSelector('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject selectors that are too long', () => {
      const longSelector = 'div'.repeat(LIMITS.MAX_SELECTOR_LENGTH);
      const result = validateSelector(longSelector);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed');
    });

    it('should accept selector at exact max length', () => {
      const maxSelector = 'a'.repeat(LIMITS.MAX_SELECTOR_LENGTH);
      expect(validateSelector(maxSelector)).toEqual({ valid: true });
    });
  });

  describe('validateInterval()', () => {
    it('should accept valid intervals', () => {
      expect(validateInterval(60000)).toEqual({ valid: true });
      expect(validateInterval(300000)).toEqual({ valid: true });
      expect(validateInterval(LIMITS.MAX_INTERVAL_MS)).toEqual({ valid: true });
    });

    it('should reject non-numeric intervals', () => {
      const result = validateInterval(NaN);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a valid number');
    });

    it('should reject intervals below minimum', () => {
      const result = validateInterval(LIMITS.MIN_INTERVAL_MS - 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be less than');
    });

    it('should accept minimum interval', () => {
      expect(validateInterval(LIMITS.MIN_INTERVAL_MS)).toEqual({ valid: true });
    });

    it('should reject intervals above maximum (24 hours)', () => {
      const result = validateInterval(LIMITS.MAX_INTERVAL_MS + 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed 24 hours');
    });

    it('should accept maximum interval (24 hours)', () => {
      expect(validateInterval(LIMITS.MAX_INTERVAL_MS)).toEqual({ valid: true });
    });
  });

  describe('validateWebhookBody()', () => {
    it('should accept valid JSON string body', () => {
      const body = '{"message": "test"}';
      expect(validateWebhookBody(body)).toEqual({ valid: true });
    });

    it('should accept valid JSON object body', () => {
      const body = { message: 'test', nested: { value: 123 } };
      expect(validateWebhookBody(body)).toEqual({ valid: true });
    });

    it('should accept empty string body', () => {
      expect(validateWebhookBody('')).toEqual({ valid: true });
    });

    it('should accept empty object body', () => {
      expect(validateWebhookBody({})).toEqual({ valid: true });
    });

    it('should reject body exceeding size limit', () => {
      const largeBody = 'x'.repeat(LIMITS.MAX_WEBHOOK_BODY_SIZE + 1);
      const result = validateWebhookBody(largeBody);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
      expect(result.error).toContain(String(LIMITS.MAX_WEBHOOK_BODY_SIZE));
    });

    it('should accept body at exact size limit', () => {
      const maxBody = 'x'.repeat(LIMITS.MAX_WEBHOOK_BODY_SIZE);
      expect(validateWebhookBody(maxBody)).toEqual({ valid: true });
    });

    it('should calculate size correctly for Unicode characters', () => {
      // Chinese characters typically take 3 bytes in UTF-8
      const chineseBody = '中'.repeat(Math.floor(LIMITS.MAX_WEBHOOK_BODY_SIZE / 3) + 1);
      const result = validateWebhookBody(chineseBody);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should calculate size correctly for object bodies', () => {
      const largeObject = {
        data: 'x'.repeat(LIMITS.MAX_WEBHOOK_BODY_SIZE + 100),
      };
      const result = validateWebhookBody(largeObject);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });
  });
});
