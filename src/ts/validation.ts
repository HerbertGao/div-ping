/**
 * Input validation utilities
 * Validates user inputs to prevent security issues and data corruption
 *
 * Note: Error messages are in English as they serve as technical error codes.
 * For user-facing display, these should be translated in the UI layer.
 */

import { LIMITS } from './constants';
import ipaddr from 'ipaddr.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a project name for length and character constraints
 *
 * @param name - The project name to validate
 * @returns ValidationResult object with valid flag and optional error message
 *
 * @remarks
 * Validation rules:
 * - Cannot be empty or whitespace-only
 * - Maximum length: 100 characters (see LIMITS.MAX_PROJECT_NAME_LENGTH)
 * - Cannot contain control characters (U+0000 to U+001F, U+007F)
 *
 * @example
 * ```typescript
 * const result = validateProjectName('My Website Monitor');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 *
 * // Invalid examples:
 * validateProjectName('');           // { valid: false, error: 'Project name cannot be empty' }
 * validateProjectName('   ');        // { valid: false, error: 'Project name cannot be empty' }
 * validateProjectName('Test\x00');   // { valid: false, error: 'Project name contains invalid control characters' }
 * ```
 */
export function validateProjectName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Project name cannot be empty' };
  }

  if (name.length > LIMITS.MAX_PROJECT_NAME_LENGTH) {
    return {
      valid: false,
      error: `Project name cannot exceed ${LIMITS.MAX_PROJECT_NAME_LENGTH} characters`
    };
  }

  // Check for potentially problematic characters
  // eslint-disable-next-line no-control-regex -- Intentionally checking for control characters for security
  if (/[\x00-\x1F\x7F]/.test(name)) {
    return { valid: false, error: 'Project name contains invalid control characters' };
  }

  return { valid: true };
}

/**
 * Validates a CSS selector for syntax and length constraints
 *
 * @param selector - The CSS selector string to validate
 * @returns ValidationResult object with valid flag and optional error message
 *
 * @remarks
 * Validation rules:
 * - Cannot be empty or whitespace-only
 * - Maximum length: 1000 characters (see LIMITS.MAX_SELECTOR_LENGTH)
 * - Must be valid CSS selector syntax (tested with document.querySelector when available)
 *
 * Note: Syntax validation is skipped in service worker context where document is unavailable
 *
 * @example
 * ```typescript
 * // Valid selectors:
 * validateSelector('#content');                    // { valid: true }
 * validateSelector('.article > p:first-child');    // { valid: true }
 * validateSelector('[data-testid="main"]');        // { valid: true }
 *
 * // Invalid selectors:
 * validateSelector('');                            // { valid: false, error: 'CSS selector cannot be empty' }
 * validateSelector('#invalid#syntax');             // { valid: false, error: 'Invalid CSS selector syntax...' }
 * validateSelector('a'.repeat(1001));              // { valid: false, error: 'CSS selector cannot exceed 1000 characters' }
 * ```
 */
export function validateSelector(selector: string): ValidationResult {
  if (!selector || selector.trim().length === 0) {
    return { valid: false, error: 'CSS selector cannot be empty' };
  }

  if (selector.length > LIMITS.MAX_SELECTOR_LENGTH) {
    return {
      valid: false,
      error: `CSS selector cannot exceed ${LIMITS.MAX_SELECTOR_LENGTH} characters`
    };
  }

  // Try to validate selector syntax by attempting to use it
  // Skip validation in service worker context where document is not available
  if (typeof document !== 'undefined') {
    try {
      document.querySelector(selector);
    } catch (err) {
      return {
        valid: false,
        error: `Invalid CSS selector syntax: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  }

  return { valid: true };
}

/**
 * Validates a webpage URL for monitoring
 *
 * @param url - The URL string to validate
 * @returns ValidationResult object with valid flag and optional error message
 *
 * @remarks
 * Validation rules:
 * - Cannot be empty or whitespace-only
 * - Maximum length: 2048 characters (see LIMITS.MAX_URL_LENGTH)
 * - Must be a valid URL format (parseable by URL constructor)
 * - Protocol must be http: or https: only
 *
 * @example
 * ```typescript
 * // Valid URLs:
 * validateUrl('https://example.com');              // { valid: true }
 * validateUrl('http://localhost:3000/page');       // { valid: true }
 *
 * // Invalid URLs:
 * validateUrl('');                                 // { valid: false, error: 'URL cannot be empty' }
 * validateUrl('ftp://example.com');                // { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' }
 * validateUrl('not a url');                        // { valid: false, error: 'Invalid URL format' }
 * validateUrl('https://example.com/' + 'a'.repeat(3000)); // { valid: false, error: 'URL cannot exceed 2048 characters' }
 * ```
 */
export function validateUrl(url: string): ValidationResult {
  if (!url || url.trim().length === 0) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  if (url.length > LIMITS.MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `URL cannot exceed ${LIMITS.MAX_URL_LENGTH} characters`
    };
  }

  // Validate URL format
  try {
    const parsedUrl = new URL(url);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        valid: false,
        error: 'Only HTTP and HTTPS protocols are allowed'
      };
    }
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format'
    };
  }

  return { valid: true };
}

/**
 * Validates webhook HTTP headers for format, size, and security constraints
 *
 * @param headers - Headers as JSON string or object with string values
 * @returns ValidationResult object with valid flag and optional error message
 *
 * @remarks
 * Validation rules:
 * - Must be a valid object (not array or null)
 * - Header names must follow RFC 7230 token format (alphanumeric and specific symbols)
 * - Header values cannot contain control characters (prevents header injection attacks)
 * - Total serialized size cannot exceed 10KB (see LIMITS.MAX_WEBHOOK_HEADERS_SIZE)
 *
 * Security features:
 * - Prevents CRLF injection by blocking \r and \n characters
 * - Blocks all control characters (U+0000 to U+001F, U+007F)
 *
 * @example
 * ```typescript
 * // Valid headers:
 * validateWebhookHeaders({ 'Content-Type': 'application/json' });          // { valid: true }
 * validateWebhookHeaders('{"Authorization": "Bearer token123"}');          // { valid: true }
 *
 * // Invalid headers:
 * validateWebhookHeaders({ 'Invalid Header': 'value' });                   // { valid: false, error: 'Invalid header name...' }
 * validateWebhookHeaders({ 'X-Test': 'value\r\nInjected: header' });       // { valid: false, error: 'contains control characters' }
 * validateWebhookHeaders('not valid json');                                // { valid: false, error: 'Invalid headers format...' }
 * validateWebhookHeaders([]);                                              // { valid: false, error: 'Headers must be an object' }
 * ```
 */
export function validateWebhookHeaders(headers: string | Record<string, string>): ValidationResult {
  try {
    const headerObj = typeof headers === 'string' ? JSON.parse(headers) : headers;

    if (typeof headerObj !== 'object' || headerObj === null || Array.isArray(headerObj)) {
      return { valid: false, error: 'Headers must be an object' };
    }

    for (const [key, value] of Object.entries(headerObj)) {
      // Validate header name (RFC 7230: token characters)
      if (!/^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(key)) {
        return { valid: false, error: `Invalid header name: ${key}` };
      }

      // Validate header value (no control characters, especially CRLF for header injection prevention)
      // eslint-disable-next-line no-control-regex -- Intentionally matching control characters for security (header injection prevention)
      if (/[\r\n\x00-\x1F\x7F]/.test(String(value))) {
        return { valid: false, error: `Invalid header value for ${key}: contains control characters` };
      }
    }

    // Validate total headers size
    const headersString = JSON.stringify(headerObj);
    const headersSize = new Blob([headersString]).size;
    if (headersSize > LIMITS.MAX_WEBHOOK_HEADERS_SIZE) {
      return {
        valid: false,
        error: `Webhook headers size (${headersSize} bytes) exceeds maximum ${LIMITS.MAX_WEBHOOK_HEADERS_SIZE} bytes`
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Invalid headers format: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

/**
 * Validates webhook request body for size constraints
 *
 * @param body - Request body as string or object (will be JSON serialized)
 * @returns ValidationResult object with valid flag and optional error message
 *
 * @remarks
 * Validation rules:
 * - Total serialized size cannot exceed 512KB (see LIMITS.MAX_WEBHOOK_BODY_SIZE)
 * - Size is calculated in bytes using UTF-8 encoding (via Blob API)
 * - Objects are automatically JSON-stringified for size calculation
 *
 * Note: This function only validates size, not structure or content validity
 *
 * @example
 * ```typescript
 * // Valid bodies:
 * validateWebhookBody('{"message": "test"}');                  // { valid: true }
 * validateWebhookBody({ project: 'monitor', status: 'ok' });   // { valid: true }
 * validateWebhookBody('Small text content');                   // { valid: true }
 *
 * // Invalid body:
 * const largeBody = 'x'.repeat(600 * 1024); // 600KB
 * validateWebhookBody(largeBody);
 * // { valid: false, error: 'Webhook body size (614400 bytes) exceeds maximum 524288 bytes' }
 * ```
 */
export function validateWebhookBody(body: string | Record<string, unknown>): ValidationResult {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  const bodySize = new Blob([bodyString]).size;

  if (bodySize > LIMITS.MAX_WEBHOOK_BODY_SIZE) {
    return {
      valid: false,
      error: `Webhook body size (${bodySize} bytes) exceeds maximum ${LIMITS.MAX_WEBHOOK_BODY_SIZE} bytes`
    };
  }

  return { valid: true };
}

/**
 * Validates monitoring check interval for reasonable time bounds
 *
 * @param interval - Monitoring interval in milliseconds
 * @returns ValidationResult object with valid flag and optional error message
 *
 * @remarks
 * Validation rules:
 * - Must be a valid number (not NaN)
 * - Minimum: 60000ms (60 seconds) - see LIMITS.MIN_INTERVAL_MS
 * - Maximum: 86400000ms (24 hours) - see LIMITS.MAX_INTERVAL_MS
 *
 * Rationale for limits:
 * - Minimum prevents excessive server load from too-frequent checks
 * - Maximum ensures monitoring remains reasonably responsive
 *
 * @example
 * ```typescript
 * // Valid intervals:
 * validateInterval(60000);        // 1 minute - { valid: true }
 * validateInterval(300000);       // 5 minutes - { valid: true }
 * validateInterval(3600000);      // 1 hour - { valid: true }
 *
 * // Invalid intervals:
 * validateInterval(30000);        // Too short - { valid: false, error: 'Interval cannot be less than 60 seconds' }
 * validateInterval(90000000);     // Too long - { valid: false, error: 'Interval cannot exceed 24 hours' }
 * validateInterval(NaN);          // Not a number - { valid: false, error: 'Interval must be a valid number' }
 * ```
 */
export function validateInterval(interval: number): ValidationResult {
  if (typeof interval !== 'number' || isNaN(interval)) {
    return { valid: false, error: 'Interval must be a valid number' };
  }

  if (interval < LIMITS.MIN_INTERVAL_MS) {
    return {
      valid: false,
      error: `Interval cannot be less than ${LIMITS.MIN_INTERVAL_SECONDS} seconds`
    };
  }

  if (interval > LIMITS.MAX_INTERVAL_MS) {
    return {
      valid: false,
      error: 'Interval cannot exceed 24 hours'
    };
  }

  return { valid: true };
}

/**
 * Validates webhook URL with comprehensive SSRF (Server-Side Request Forgery) protection
 *
 * @param urlString - The webhook URL to validate
 * @returns ValidationResult object with valid flag and optional error message
 *
 * @remarks
 * Validation rules:
 * - Must be valid URL format
 * - Protocol must be http: or https: only (blocks file:, javascript:, data:, etc.)
 * - Blocks localhost and .localhost domains
 * - Blocks .local and .internal TLDs
 * - Blocks private/reserved IP ranges (both IPv4 and IPv6)
 * - Blocks IPv4-mapped IPv6 addresses to private ranges
 *
 * Blocked IP ranges (via ipaddr.js):
 * - Loopback: 127.0.0.0/8, ::1
 * - Private: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7
 * - Link-local: 169.254.0.0/16, fe80::/10
 * - Reserved: TEST-NET ranges, benchmarking, future use
 * - Carrier-grade NAT: 100.64.0.0/10
 * - Multicast, broadcast, unspecified
 *
 * @example
 * ```typescript
 * // Valid URLs:
 * validateWebhookUrl('https://api.example.com/webhook');       // { valid: true }
 * validateWebhookUrl('http://webhook.service.com:8080/hook');  // { valid: true }
 *
 * // Invalid URLs - Protocol restrictions:
 * validateWebhookUrl('ftp://example.com');                     // { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' }
 * validateWebhookUrl('file:///etc/passwd');                    // { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' }
 *
 * // Invalid URLs - Localhost/internal:
 * validateWebhookUrl('http://localhost:3000/hook');            // { valid: false, error: 'Localhost addresses are blocked for security' }
 * validateWebhookUrl('https://api.local/webhook');             // { valid: false, error: 'Internal domain addresses are blocked for security' }
 *
 * // Invalid URLs - Private IPs:
 * validateWebhookUrl('http://192.168.1.1/admin');              // { valid: false, error: "IP range 'private' is blocked for security" }
 * validateWebhookUrl('http://127.0.0.1/internal');             // { valid: false, error: "IP range 'loopback' is blocked for security" }
 * validateWebhookUrl('http://[::1]/api');                      // { valid: false, error: "IP range 'loopback' is blocked for security" }
 * ```
 */
export function validateWebhookUrl(urlString: string): ValidationResult {
  try {
    const url = new URL(urlString);

    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }

    // Get hostname
    const hostname = url.hostname.toLowerCase();

    // Block specific localhost hostnames
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return { valid: false, error: 'Localhost addresses are blocked for security' };
    }

    // Block internal domain suffixes
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return { valid: false, error: 'Internal domain addresses are blocked for security' };
    }

    // Try to parse as IP address
    if (ipaddr.isValid(hostname)) {
      const addr = ipaddr.parse(hostname);

      // Check IP address range
      const range = addr.range();

      // Forbidden IP address ranges
      const forbiddenRanges = [
        'unspecified',    // 0.0.0.0 or ::
        'broadcast',      // 255.255.255.255
        'multicast',      // 224.0.0.0/4 or ff00::/8
        'linkLocal',      // 169.254.0.0/16 or fe80::/10
        'loopback',       // 127.0.0.0/8 or ::1
        'private',        // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 or fc00::/7
        'reserved',       // Reserved addresses (includes TEST-NET ranges)
        'carrierGradeNat', // 100.64.0.0/10
        'uniqueLocal'     // IPv6 unique local addresses fc00::/7
      ];

      if (forbiddenRanges.includes(range)) {
        return { valid: false, error: `IP range '${range}' is blocked for security` };
      }

      // IPv6 special checks: IPv4-mapped addresses
      if (addr.kind() === 'ipv6') {
        const ipv6Addr = addr as ipaddr.IPv6;
        if (ipv6Addr.isIPv4MappedAddress()) {
          // Get mapped IPv4 address and check recursively
          const ipv4 = ipv6Addr.toIPv4Address();
          const ipv4Range = ipv4.range();

          if (forbiddenRanges.includes(ipv4Range)) {
            return { valid: false, error: `IPv4-mapped address range '${ipv4Range}' is blocked for security` };
          }
        }
      }
    }

    return { valid: true };
  } catch (error) {
    if (error instanceof TypeError) {
      return { valid: false, error: 'Invalid URL format' };
    }
    throw error;
  }
}
