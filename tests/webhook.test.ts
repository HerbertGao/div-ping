import { describe, it, expect } from '@jest/globals';

/**
 * Test utilities for webhook variable replacement and URL validation
 * These tests verify the SSRF protection and variable substitution logic
 */

describe('Webhook Variable Replacement', () => {
  describe('URL variable replacement (with URL encoding)', () => {
    const replaceVariablesInUrl = (template: string, variables: Record<string, string>): string => {
      let result = template;
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(regex, encodeURIComponent(String(value)));
      }
      return result;
    };

    it('should replace single variable in URL', () => {
      const template = 'https://example.com/notify?project={{projectName}}';
      const variables = { projectName: 'test-project' };

      const result = replaceVariablesInUrl(template, variables);

      expect(result).toBe('https://example.com/notify?project=test-project');
    });

    it('should replace multiple variables in URL', () => {
      const template = 'https://example.com/notify?project={{projectName}}&content={{newContent}}';
      const variables = {
        projectName: 'test-project',
        newContent: 'new value'
      };

      const result = replaceVariablesInUrl(template, variables);

      expect(result).toBe('https://example.com/notify?project=test-project&content=new%20value');
    });

    it('should URL encode special characters', () => {
      const template = 'https://example.com/notify?msg={{message}}';
      const variables = { message: 'Hello & 你好 <test>' };

      const result = replaceVariablesInUrl(template, variables);

      expect(result).toBe('https://example.com/notify?msg=Hello%20%26%20%E4%BD%A0%E5%A5%BD%20%3Ctest%3E');
    });

    it('should handle empty string values', () => {
      const template = 'https://example.com/notify?val={{value}}';
      const variables = { value: '' };

      const result = replaceVariablesInUrl(template, variables);

      expect(result).toBe('https://example.com/notify?val=');
    });

    it('should not replace non-existent variables', () => {
      const template = 'https://example.com/notify?a={{varA}}&b={{varB}}';
      const variables = { varA: 'valueA' };

      const result = replaceVariablesInUrl(template, variables);

      expect(result).toBe('https://example.com/notify?a=valueA&b={{varB}}');
    });
  });

  describe('Header variable replacement (without URL encoding, with sanitization)', () => {
    const replaceVariablesInHeader = (template: string, variables: Record<string, string>): string => {
      let result = template;
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        // eslint-disable-next-line no-control-regex
        const sanitizedValue = String(value).replace(/[\r\n\x00-\x1F\x7F]/g, '');
        result = result.replace(regex, sanitizedValue);
      }
      return result;
    };

    it('should replace variable in header', () => {
      const template = 'Bearer {{token}}';
      const variables = { token: 'abc123' };

      const result = replaceVariablesInHeader(template, variables);

      expect(result).toBe('Bearer abc123');
    });

    it('should remove control characters (header injection prevention)', () => {
      const template = 'Value: {{data}}';
      const variables = { data: 'test\r\nX-Injected: malicious' };

      const result = replaceVariablesInHeader(template, variables);

      expect(result).toBe('Value: testX-Injected: malicious');
      expect(result).not.toContain('\r');
      expect(result).not.toContain('\n');
    });

    it('should remove null bytes', () => {
      const template = 'Data: {{value}}';
      const variables = { value: 'test\x00value' };

      const result = replaceVariablesInHeader(template, variables);

      expect(result).toBe('Data: testvalue');
    });

    it('should preserve Unicode characters', () => {
      const template = 'Project: {{name}}';
      const variables = { name: '测试项目' };

      const result = replaceVariablesInHeader(template, variables);

      expect(result).toBe('Project: 测试项目');
    });
  });

  describe('JSON body variable replacement (with JSON escaping)', () => {
    const replaceVariablesInJson = (template: string, variables: Record<string, string>): string => {
      let result = template;
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        const jsonValue = JSON.stringify(String(value));
        const valueWithoutOuterQuotes = jsonValue.slice(1, -1);
        result = result.replace(regex, valueWithoutOuterQuotes);
      }
      return result;
    };

    it('should replace variable in JSON body', () => {
      const template = '{"message": "{{content}}"}';
      const variables = { content: 'test message' };

      const result = replaceVariablesInJson(template, variables);

      expect(result).toBe('{"message": "test message"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should escape double quotes in values', () => {
      const template = '{"text": "{{message}}"}';
      const variables = { message: 'He said "hello"' };

      const result = replaceVariablesInJson(template, variables);

      expect(result).toBe('{"text": "He said \\"hello\\""}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should escape backslashes', () => {
      const template = '{"path": "{{filepath}}"}';
      const variables = { filepath: 'C:\\Users\\test' };

      const result = replaceVariablesInJson(template, variables);

      expect(result).toBe('{"path": "C:\\\\Users\\\\test"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle newlines', () => {
      const template = '{"content": "{{text}}"}';
      const variables = { text: 'line1\nline2' };

      const result = replaceVariablesInJson(template, variables);

      expect(result).toBe('{"content": "line1\\nline2"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle complex nested JSON', () => {
      const template = '{"data": {"project": "{{name}}", "content": "{{text}}"}}';
      const variables = {
        name: 'Test "Project"',
        text: 'Content with\nnewline'
      };

      const result = replaceVariablesInJson(template, variables);

      expect(result).toBe('{"data": {"project": "Test \\"Project\\"", "content": "Content with\\nnewline"}}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle Chinese characters', () => {
      const template = '{"message": "{{content}}"}';
      const variables = { content: '检测到变化：新内容' };

      const result = replaceVariablesInJson(template, variables);

      expect(result).toBe('{"message": "检测到变化：新内容"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });
});

describe('SSRF Protection - Webhook URL Validation', () => {
  const validateWebhookUrl = (urlString: string): { valid: boolean; error?: string } => {
    try {
      const url = new URL(urlString);

      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
      }

      const hostname = url.hostname.toLowerCase();

      // Block localhost
      if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        return { valid: false, error: 'Access to localhost is forbidden' };
      }

      // Block internal domains
      if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        return { valid: false, error: 'Access to internal domains is forbidden' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  };

  describe('Protocol validation', () => {
    it('should allow HTTPS URLs', () => {
      const result = validateWebhookUrl('https://example.com/webhook');
      expect(result.valid).toBe(true);
    });

    it('should allow HTTP URLs', () => {
      const result = validateWebhookUrl('http://example.com/webhook');
      expect(result.valid).toBe(true);
    });

    it('should reject file:// protocol', () => {
      const result = validateWebhookUrl('file:///etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTP');
    });

    it('should reject ftp:// protocol', () => {
      const result = validateWebhookUrl('ftp://example.com/file');
      expect(result.valid).toBe(false);
    });

    it('should reject javascript: protocol', () => {
      const result = validateWebhookUrl('javascript:alert(1)');
      expect(result.valid).toBe(false);
    });

    it('should reject data: protocol', () => {
      const result = validateWebhookUrl('data:text/html,<script>alert(1)</script>');
      expect(result.valid).toBe(false);
    });
  });

  describe('Localhost blocking', () => {
    it('should reject localhost', () => {
      const result = validateWebhookUrl('http://localhost:8080/webhook');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('localhost');
    });

    it('should reject variations of localhost', () => {
      const urls = [
        'http://LOCALHOST/webhook',
        'http://test.localhost/webhook',
        'http://api.localhost/webhook',
      ];

      urls.forEach(url => {
        const result = validateWebhookUrl(url);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('Internal domain blocking', () => {
    it('should reject .local domains', () => {
      const result = validateWebhookUrl('http://server.local/webhook');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal');
    });

    it('should reject .internal domains', () => {
      const result = validateWebhookUrl('http://api.internal/webhook');
      expect(result.valid).toBe(false);
    });

    it('should reject nested internal domains', () => {
      const result = validateWebhookUrl('http://api.service.internal/webhook');
      expect(result.valid).toBe(false);
    });
  });

  describe('Valid public URLs', () => {
    it('should allow standard public domains', () => {
      const urls = [
        'https://example.com/webhook',
        'https://api.example.com/notify',
        'https://hooks.slack.com/services/XXX',
        'https://discord.com/api/webhooks/XXX',
      ];

      urls.forEach(url => {
        const result = validateWebhookUrl(url);
        expect(result.valid).toBe(true);
      });
    });

    it('should allow URLs with query parameters', () => {
      const result = validateWebhookUrl('https://example.com/webhook?token=abc&project=test');
      expect(result.valid).toBe(true);
    });

    it('should allow URLs with ports', () => {
      const result = validateWebhookUrl('https://example.com:8443/webhook');
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid URL format', () => {
    it('should reject malformed URLs', () => {
      const urls = [
        'not-a-url',
        'ht!tp://example.com',
        '//example.com',
        'example.com',
      ];

      urls.forEach(url => {
        const result = validateWebhookUrl(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid URL');
      });
    });
  });
});
