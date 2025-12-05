import { describe, it, expect } from '@jest/globals';
import ipaddr from 'ipaddr.js';

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

/**
 * Tests to verify ipaddr.js correctly identifies reserved IP ranges
 * This documents that background.ts can rely on ipaddr.js's built-in range detection
 * instead of manual IP range checks for SSRF protection
 */
describe('ipaddr.js Reserved Range Detection (SSRF Protection Foundation)', () => {
  describe('TEST-NET ranges (RFC5737) - Documentation examples', () => {
    it('should identify TEST-NET-1 (192.0.2.0/24) as reserved', () => {
      const testAddresses = ['192.0.2.1', '192.0.2.100', '192.0.2.255'];

      testAddresses.forEach(ip => {
        const addr = ipaddr.process(ip);
        const range = addr.range();
        expect(range).toBe('reserved');
      });
    });

    it('should identify TEST-NET-2 (198.51.100.0/24) as reserved', () => {
      const testAddresses = ['198.51.100.1', '198.51.100.50', '198.51.100.255'];

      testAddresses.forEach(ip => {
        const addr = ipaddr.process(ip);
        const range = addr.range();
        expect(range).toBe('reserved');
      });
    });

    it('should identify TEST-NET-3 (203.0.113.0/24) as reserved', () => {
      const testAddresses = ['203.0.113.1', '203.0.113.100', '203.0.113.255'];

      testAddresses.forEach(ip => {
        const addr = ipaddr.process(ip);
        const range = addr.range();
        expect(range).toBe('reserved');
      });
    });
  });

  describe('Other reserved ranges', () => {
    it('should identify IETF Protocol Assignments (192.0.0.0/24, RFC5735) as reserved', () => {
      const testAddresses = ['192.0.0.1', '192.0.0.100', '192.0.0.255'];

      testAddresses.forEach(ip => {
        const addr = ipaddr.process(ip);
        const range = addr.range();
        expect(range).toBe('reserved');
      });
    });

    it('should identify Benchmarking range (198.18.0.0/15, RFC2544) as reserved', () => {
      const testAddresses = ['198.18.0.1', '198.18.255.255', '198.19.0.1', '198.19.255.255'];

      testAddresses.forEach(ip => {
        const addr = ipaddr.process(ip);
        const range = addr.range();
        expect(range).toBe('reserved');
      });
    });
  });

  describe('Private and special-use ranges', () => {
    it('should identify private IP ranges (RFC1918) as private', () => {
      const privateIPs = [
        '10.0.0.1',
        '10.255.255.255',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.0.1',
        '192.168.255.255'
      ];

      privateIPs.forEach(ip => {
        const addr = ipaddr.process(ip);
        const range = addr.range();
        expect(range).toBe('private');
      });
    });

    it('should identify link-local addresses (169.254.0.0/16) as linkLocal', () => {
      const linkLocalIPs = ['169.254.1.1', '169.254.169.254']; // AWS metadata service

      linkLocalIPs.forEach(ip => {
        const addr = ipaddr.process(ip);
        const range = addr.range();
        expect(range).toBe('linkLocal');
      });
    });

    it('should identify loopback addresses (127.0.0.0/8) as loopback', () => {
      const loopbackIPs = ['127.0.0.1', '127.0.0.2', '127.255.255.255'];

      loopbackIPs.forEach(ip => {
        const addr = ipaddr.process(ip);
        const range = addr.range();
        expect(range).toBe('loopback');
      });
    });

    it('should identify carrier-grade NAT (100.64.0.0/10, RFC6598) as carrierGradeNat', () => {
      const cgnatIPs = ['100.64.0.1', '100.100.0.1', '100.127.255.255'];

      cgnatIPs.forEach(ip => {
        const addr = ipaddr.process(ip);
        const range = addr.range();
        expect(range).toBe('carrierGradeNat');
      });
    });
  });

  describe('Public unicast addresses', () => {
    it('should identify public addresses as unicast', () => {
      const publicIPs = ['8.8.8.8', '1.1.1.1', '208.67.222.222'];

      publicIPs.forEach(ip => {
        const addr = ipaddr.process(ip);
        const range = addr.range();
        expect(range).toBe('unicast');
      });
    });
  });
});
