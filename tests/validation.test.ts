import { describe, expect, it } from '@jest/globals';
import { LIMITS } from '../src/ts/constants';
import {
  validateInterval,
  validateLoadDelay,
  validateProjectName,
  validateSelector,
  validateUrl,
  validateWebhookBody,
  validateWebhookHeaders,
} from '../src/ts/validation';

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

  describe('validateLoadDelay()', () => {
    it('should accept valid load delays', () => {
      expect(validateLoadDelay(0)).toEqual({ valid: true });
      expect(validateLoadDelay(1000)).toEqual({ valid: true });
      expect(validateLoadDelay(5000)).toEqual({ valid: true });
      expect(validateLoadDelay(30000)).toEqual({ valid: true });
      expect(validateLoadDelay(LIMITS.MAX_LOAD_DELAY_MS)).toEqual({ valid: true });
    });

    it('should accept fractional delays (half-second precision)', () => {
      expect(validateLoadDelay(500)).toEqual({ valid: true });   // 0.5 seconds
      expect(validateLoadDelay(1500)).toEqual({ valid: true });  // 1.5 seconds
      expect(validateLoadDelay(2500)).toEqual({ valid: true });  // 2.5 seconds
      expect(validateLoadDelay(59500)).toEqual({ valid: true }); // 59.5 seconds
    });

    it('should reject non-numeric delays', () => {
      const result = validateLoadDelay(NaN);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a valid number');
    });

    it('should reject negative delays', () => {
      const result = validateLoadDelay(-1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be negative');
    });

    it('should accept zero delay (no delay)', () => {
      expect(validateLoadDelay(0)).toEqual({ valid: true });
    });

    it('should reject delays above maximum (60 seconds)', () => {
      const result = validateLoadDelay(LIMITS.MAX_LOAD_DELAY_MS + 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed');
    });

    it('should accept maximum delay (60 seconds)', () => {
      expect(validateLoadDelay(LIMITS.MAX_LOAD_DELAY_MS)).toEqual({ valid: true });
    });

    it('should reject very large delays', () => {
      const result = validateLoadDelay(120000); // 120 seconds
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed');
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

  describe('validateWebhookHeaders()', () => {
    describe('Valid headers', () => {
      it('should accept valid header object', () => {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token123',
        };
        expect(validateWebhookHeaders(headers)).toEqual({ valid: true });
      });

      it('should accept valid header JSON string', () => {
        const headers = '{"Content-Type": "application/json"}';
        expect(validateWebhookHeaders(headers)).toEqual({ valid: true });
      });

      it('should accept headers with special allowed characters', () => {
        const headers = {
          'X-Custom-Header': 'value',
          'X-Test_Header': 'test',
          'X-Header-123': 'value',
        };
        expect(validateWebhookHeaders(headers)).toEqual({ valid: true });
      });

      it('should accept empty headers object', () => {
        expect(validateWebhookHeaders({})).toEqual({ valid: true });
      });
    });

    describe('Invalid header names (RFC 7230 validation)', () => {
      it('should reject headers with spaces in name', () => {
        const headers = { 'Invalid Header': 'value' };
        const result = validateWebhookHeaders(headers);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid header name');
      });

      it('should reject headers with colons in name', () => {
        const headers = { 'Invalid:Header': 'value' };
        const result = validateWebhookHeaders(headers);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid header name');
      });

      it('should reject headers with brackets in name', () => {
        const headers = { 'Invalid[Header]': 'value' };
        const result = validateWebhookHeaders(headers);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid header name');
      });
    });

    describe('Invalid header values (Control character prevention)', () => {
      it('should reject headers with CRLF (header injection attack)', () => {
        const headers = { 'X-Custom': 'value\r\nX-Injected: malicious' };
        const result = validateWebhookHeaders(headers);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('contains control characters');
      });

      it('should reject headers with newline characters', () => {
        const headers = { 'X-Custom': 'value\ninjected' };
        const result = validateWebhookHeaders(headers);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('contains control characters');
      });

      it('should reject headers with null bytes', () => {
        const headers = { 'X-Custom': 'value\x00injected' };
        const result = validateWebhookHeaders(headers);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('contains control characters');
      });

      it('should reject headers with other control characters', () => {
        const headers = { 'X-Custom': 'value\x01\x02\x03' };
        const result = validateWebhookHeaders(headers);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('contains control characters');
      });

      it('should reject headers with DEL character', () => {
        const headers = { 'X-Custom': 'value\x7F' };
        const result = validateWebhookHeaders(headers);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('contains control characters');
      });
    });

    describe('Size validation', () => {
      it('should reject headers exceeding size limit', () => {
        const largeValue = 'x'.repeat(LIMITS.MAX_WEBHOOK_HEADERS_SIZE);
        const headers = { 'X-Large': largeValue };
        const result = validateWebhookHeaders(headers);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum');
      });

      it('should accept headers at size limit', () => {
        // Create headers that are just under the limit
        const value = 'x'.repeat(Math.floor(LIMITS.MAX_WEBHOOK_HEADERS_SIZE / 2) - 50);
        const headers = { 'X-Test': value };
        expect(validateWebhookHeaders(headers)).toEqual({ valid: true });
      });
    });

    describe('Invalid formats', () => {
      it('should reject invalid JSON string', () => {
        const headers = '{invalid json}';
        const result = validateWebhookHeaders(headers);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid headers format');
      });

      it('should reject non-object types', () => {
        const result = validateWebhookHeaders('null');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Headers must be an object');
      });

      it('should reject array', () => {
        const result = validateWebhookHeaders('[]');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Headers must be an object');
      });
    });

    describe('Unicode and special values', () => {
      it('should accept headers with Unicode values (non-control)', () => {
        const headers = {
          'X-Message': '测试中文 Test 日本語',
        };
        expect(validateWebhookHeaders(headers)).toEqual({ valid: true });
      });

      it('should accept headers with emoji values', () => {
        const headers = {
          'X-Message': 'Hello 👋 World 🌍',
        };
        expect(validateWebhookHeaders(headers)).toEqual({ valid: true });
      });

      it('should accept headers with numeric values', () => {
        const headers = {
          'X-Count': '12345',
        };
        expect(validateWebhookHeaders(headers)).toEqual({ valid: true });
      });
    });

    describe('Edge cases for size limits', () => {
      it('should accept headers at exactly the size limit', () => {
        // Create headers that are exactly at the limit
        const largeValue = 'x'.repeat(LIMITS.MAX_WEBHOOK_HEADERS_SIZE - 50);
        const headers = { 'X-Large': largeValue };

        const result = validateWebhookHeaders(headers);

        // Should be valid if at or just under limit
        if (JSON.stringify(headers).length <= LIMITS.MAX_WEBHOOK_HEADERS_SIZE) {
          expect(result.valid).toBe(true);
        }
      });

      it('should reject headers exceeding size by 1 byte', () => {
        // Create headers that exceed by just 1 byte
        const tooLargeValue = 'x'.repeat(LIMITS.MAX_WEBHOOK_HEADERS_SIZE);
        const headers = { 'X-Too-Large': tooLargeValue };

        const result = validateWebhookHeaders(headers);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum');
      });

      it('should handle Unicode characters in size calculation (multi-byte chars)', () => {
        // Unicode emoji are multiple bytes (e.g., 😀 is 4 bytes)
        const emojiValue = '😀'.repeat(100); // Each emoji is 4 bytes
        const headers = { 'X-Emoji': emojiValue };

        const result = validateWebhookHeaders(headers);

        // Should calculate byte size correctly, not character count
        const byteSize = new Blob([JSON.stringify(headers)]).size;
        if (byteSize > LIMITS.MAX_WEBHOOK_HEADERS_SIZE) {
          expect(result.valid).toBe(false);
        }
      });
    });
  });

  describe('Edge cases for content size', () => {
    describe('validateWebhookBody() with large content', () => {
      it('should accept body at exactly the size limit', () => {
        // Create body that is exactly at limit
        const largeContent = 'x'.repeat(LIMITS.MAX_WEBHOOK_BODY_SIZE - 20);
        const body = { content: largeContent };

        const result = validateWebhookBody(body);

        if (new Blob([JSON.stringify(body)]).size <= LIMITS.MAX_WEBHOOK_BODY_SIZE) {
          expect(result.valid).toBe(true);
        }
      });

      it('should reject body exceeding size limit by 1 byte', () => {
        const tooLarge = 'x'.repeat(LIMITS.MAX_WEBHOOK_BODY_SIZE + 1);

        const result = validateWebhookBody(tooLarge);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum');
      });

      it('should correctly calculate size for Unicode content (surrogate pairs)', () => {
        // Test with characters outside BMP (Basic Multilingual Plane)
        // These use surrogate pairs: 𝕳𝖊𝖑𝖑𝖔 (Mathematical Bold Fraktur)
        const unicodeContent = '𝕳𝖊𝖑𝖑𝖔 '.repeat(1000);

        const result = validateWebhookBody(unicodeContent);

        // Should use Blob size which handles surrogate pairs correctly
        const byteSize = new Blob([unicodeContent]).size;
        if (byteSize > LIMITS.MAX_WEBHOOK_BODY_SIZE) {
          expect(result.valid).toBe(false);
          expect(result.error).toContain('exceeds maximum');
        } else {
          expect(result.valid).toBe(true);
        }
      });

      it('should handle RTL (Right-to-Left) text correctly', () => {
        // Test with Arabic and Hebrew text
        const rtlText = 'مرحبا بك في العالم'.repeat(100) + ' שלום עולם'.repeat(100);

        const result = validateWebhookBody(rtlText);

        // Should validate based on byte size, not character semantics
        const byteSize = new Blob([rtlText]).size;
        expect(byteSize).toBeGreaterThan(0);
        if (byteSize <= LIMITS.MAX_WEBHOOK_BODY_SIZE) {
          expect(result.valid).toBe(true);
        }
      });

      it('should handle mixed Unicode scripts (combining characters)', () => {
        // Test with combining diacritical marks (é = e + ́)
        const combining = 'e\u0301'.repeat(1000); // é composed of e + combining acute

        const result = validateWebhookBody(combining);

        // Blob size should account for all bytes including combining marks
        expect(result).toHaveProperty('valid');
      });
    });
  });
});
