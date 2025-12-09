/**
 * Input validation utilities
 * Validates user inputs to prevent security issues and data corruption
 *
 * IMPORTANT - Error Message Language Strategy:
 * Error messages returned from validation functions are intentionally in English
 * because:
 * 1. These functions run in the background service worker where i18n may not be initialized
 * 2. They serve as technical error codes that can be logged for debugging
 * 3. Client-side UI code (content.ts, popup.ts) should translate validation errors
 *    using i18n when displaying to users
 *
 * For user-facing validation errors, the UI layer should:
 * - Catch validation errors and show localized messages using t() function
 * - Use error type/field to determine which i18n message to display
 * - See _locales/en/messages.json and _locales/zh_CN/messages.json for translations
 */

import ipaddr from 'ipaddr.js';
import { LIMITS } from './constants';

/**
 * Standardized error codes for validation failures
 * Used by client-side code to determine which i18n message to display
 */
export enum ValidationErrorCode {
  // Project name errors
  PROJECT_NAME_EMPTY = 'PROJECT_NAME_EMPTY',
  PROJECT_NAME_TOO_LONG = 'PROJECT_NAME_TOO_LONG',

  // URL errors
  URL_EMPTY = 'URL_EMPTY',
  URL_INVALID = 'URL_INVALID',
  URL_INVALID_PROTOCOL = 'URL_INVALID_PROTOCOL',
  URL_TOO_LONG = 'URL_TOO_LONG',

  // Selector errors
  SELECTOR_EMPTY = 'SELECTOR_EMPTY',
  SELECTOR_TOO_LONG = 'SELECTOR_TOO_LONG',

  // Interval errors
  INTERVAL_INVALID = 'INTERVAL_INVALID',
  INTERVAL_TOO_SMALL = 'INTERVAL_TOO_SMALL',
  INTERVAL_TOO_LARGE = 'INTERVAL_TOO_LARGE',

  // Load delay errors
  LOAD_DELAY_INVALID = 'LOAD_DELAY_INVALID',
  LOAD_DELAY_NEGATIVE = 'LOAD_DELAY_NEGATIVE',
  LOAD_DELAY_TOO_LARGE = 'LOAD_DELAY_TOO_LARGE',

  // Webhook errors
  WEBHOOK_URL_INVALID = 'WEBHOOK_URL_INVALID',
  WEBHOOK_URL_INVALID_PROTOCOL = 'WEBHOOK_URL_INVALID_PROTOCOL',
  WEBHOOK_URL_SSRF_BLOCKED = 'WEBHOOK_URL_SSRF_BLOCKED',
  WEBHOOK_BODY_TOO_LARGE = 'WEBHOOK_BODY_TOO_LARGE',
  WEBHOOK_HEADERS_INVALID = 'WEBHOOK_HEADERS_INVALID',
  WEBHOOK_HEADERS_TOO_LARGE = 'WEBHOOK_HEADERS_TOO_LARGE',
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: ValidationErrorCode;
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
    return {
      valid: false,
      error: 'Project name cannot be empty',
      errorCode: ValidationErrorCode.PROJECT_NAME_EMPTY
    };
  }

  if (name.length > LIMITS.MAX_PROJECT_NAME_LENGTH) {
    return {
      valid: false,
      error: `Project name cannot exceed ${LIMITS.MAX_PROJECT_NAME_LENGTH} characters`,
      errorCode: ValidationErrorCode.PROJECT_NAME_TOO_LONG
    };
  }

  // Check for potentially problematic characters
  // eslint-disable-next-line no-control-regex -- Intentionally checking for control characters for security
  if (/[\x00-\x1F\x7F]/.test(name)) {
    return {
      valid: false,
      error: 'Project name contains invalid control characters',
      errorCode: ValidationErrorCode.PROJECT_NAME_EMPTY // Use EMPTY for control chars as they're invalid
    };
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
    return {
      valid: false,
      error: 'CSS selector cannot be empty',
      errorCode: ValidationErrorCode.SELECTOR_EMPTY
    };
  }

  if (selector.length > LIMITS.MAX_SELECTOR_LENGTH) {
    return {
      valid: false,
      error: `CSS selector cannot exceed ${LIMITS.MAX_SELECTOR_LENGTH} characters`,
      errorCode: ValidationErrorCode.SELECTOR_TOO_LONG
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
        error: `Invalid CSS selector syntax: ${err instanceof Error ? err.message : 'Unknown error'}`,
        errorCode: ValidationErrorCode.SELECTOR_EMPTY // Use EMPTY for syntax errors
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
    return {
      valid: false,
      error: 'URL cannot be empty',
      errorCode: ValidationErrorCode.URL_EMPTY
    };
  }

  if (url.length > LIMITS.MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `URL cannot exceed ${LIMITS.MAX_URL_LENGTH} characters`,
      errorCode: ValidationErrorCode.URL_TOO_LONG
    };
  }

  // Validate URL format
  try {
    const parsedUrl = new URL(url);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        valid: false,
        error: 'Only HTTP and HTTPS protocols are allowed',
        errorCode: ValidationErrorCode.URL_INVALID_PROTOCOL
      };
    }
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format',
      errorCode: ValidationErrorCode.URL_INVALID
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
      return {
        valid: false,
        error: 'Headers must be an object',
        errorCode: ValidationErrorCode.WEBHOOK_HEADERS_INVALID
      };
    }

    for (const [key, value] of Object.entries(headerObj)) {
      // Validate header name (RFC 7230: token characters)
      if (!/^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(key)) {
        return {
          valid: false,
          error: `Invalid header name: ${key}`,
          errorCode: ValidationErrorCode.WEBHOOK_HEADERS_INVALID
        };
      }

      // Validate header value (no control characters, especially CRLF for header injection prevention)
      // eslint-disable-next-line no-control-regex -- Intentionally matching control characters for security (header injection prevention)
      if (/[\r\n\x00-\x1F\x7F]/.test(String(value))) {
        return {
          valid: false,
          error: `Invalid header value for ${key}: contains control characters`,
          errorCode: ValidationErrorCode.WEBHOOK_HEADERS_INVALID
        };
      }
    }

    // Validate total headers size
    const headersString = JSON.stringify(headerObj);
    const headersSize = new Blob([headersString]).size;
    if (headersSize > LIMITS.MAX_WEBHOOK_HEADERS_SIZE) {
      return {
        valid: false,
        error: `Webhook headers size (${headersSize} bytes) exceeds maximum ${LIMITS.MAX_WEBHOOK_HEADERS_SIZE} bytes`,
        errorCode: ValidationErrorCode.WEBHOOK_HEADERS_TOO_LARGE
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid headers format: ${error instanceof Error ? error.message : 'Unknown error'}`,
      errorCode: ValidationErrorCode.WEBHOOK_HEADERS_INVALID
    };
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
 * - Total serialized size cannot exceed 10KB (see LIMITS.MAX_WEBHOOK_BODY_SIZE)
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
 * const largeBody = 'x'.repeat(15000); // ~15KB
 * validateWebhookBody(largeBody);
 * // { valid: false, error: 'Webhook body size (15000 bytes) exceeds maximum 10000 bytes' }
 * ```
 */
export function validateWebhookBody(body: string | Record<string, unknown>): ValidationResult {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  const bodySize = new Blob([bodyString]).size;

  if (bodySize > LIMITS.MAX_WEBHOOK_BODY_SIZE) {
    return {
      valid: false,
      error: `Webhook body size (${bodySize} bytes) exceeds maximum ${LIMITS.MAX_WEBHOOK_BODY_SIZE} bytes`,
      errorCode: ValidationErrorCode.WEBHOOK_BODY_TOO_LARGE
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
    return {
      valid: false,
      error: 'Interval must be a valid number',
      errorCode: ValidationErrorCode.INTERVAL_INVALID
    };
  }

  if (interval < LIMITS.MIN_INTERVAL_MS) {
    return {
      valid: false,
      error: `Interval cannot be less than ${LIMITS.MIN_INTERVAL_SECONDS} seconds`,
      errorCode: ValidationErrorCode.INTERVAL_TOO_SMALL
    };
  }

  if (interval > LIMITS.MAX_INTERVAL_MS) {
    return {
      valid: false,
      error: 'Interval cannot exceed 24 hours',
      errorCode: ValidationErrorCode.INTERVAL_TOO_LARGE
    };
  }

  return { valid: true };
}

/**
 * Validates page load delay for reasonable time bounds
 *
 * @param delay - Page load delay in milliseconds (caller should round using Math.round() if converting from seconds to avoid floating-point precision issues)
 * @returns ValidationResult object with valid flag and optional error message
 *
 * @remarks
 * Validation rules:
 * - Must be a valid number (not NaN)
 * - Minimum: 0ms (no delay)
 * - Maximum: 60000ms (60 seconds) - see LIMITS.MAX_LOAD_DELAY_MS
 *
 * Rationale for limits:
 * - Minimum allows instant checking when no delay is needed
 * - Maximum prevents excessive waiting that could cause timeout issues
 *
 * Important: When converting from user input (seconds) to milliseconds, the caller
 * should use Math.round() to ensure clean integer values and avoid floating-point
 * precision issues (e.g., 0.5 seconds should be rounded to 500ms, not 499.99999ms)
 *
 * @example
 * ```typescript
 * // Valid delays:
 * validateLoadDelay(0);           // No delay - { valid: true }
 * validateLoadDelay(1000);        // 1 second - { valid: true }
 * validateLoadDelay(5000);        // 5 seconds - { valid: true }
 * validateLoadDelay(30000);       // 30 seconds - { valid: true }
 *
 * // Invalid delays:
 * validateLoadDelay(-1000);       // Negative - { valid: false, error: 'Load delay cannot be negative' }
 * validateLoadDelay(70000);       // Too long - { valid: false, error: 'Load delay cannot exceed 60 seconds' }
 * validateLoadDelay(NaN);         // Not a number - { valid: false, error: 'Load delay must be a valid number' }
 *
 * // Recommended usage pattern:
 * const userInputSeconds = 0.5;
 * const delayMs = Math.round(userInputSeconds * 1000);  // 500, not 499.99999
 * validateLoadDelay(delayMs);
 * ```
 */
export function validateLoadDelay(delay: number): ValidationResult {
  if (typeof delay !== 'number' || isNaN(delay)) {
    return {
      valid: false,
      error: 'Load delay must be a valid number',
      errorCode: ValidationErrorCode.LOAD_DELAY_INVALID
    };
  }

  if (delay < 0) {
    return {
      valid: false,
      error: 'Load delay cannot be negative',
      errorCode: ValidationErrorCode.LOAD_DELAY_NEGATIVE
    };
  }

  if (delay > LIMITS.MAX_LOAD_DELAY_MS) {
    return {
      valid: false,
      error: `Load delay cannot exceed ${LIMITS.MAX_LOAD_DELAY_SECONDS} seconds`,
      errorCode: ValidationErrorCode.LOAD_DELAY_TOO_LARGE
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
      return {
        valid: false,
        error: 'Only HTTP and HTTPS protocols are allowed',
        errorCode: ValidationErrorCode.WEBHOOK_URL_INVALID_PROTOCOL
      };
    }

    // Get hostname
    const hostname = url.hostname.toLowerCase();

    // Block specific localhost hostnames
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return {
        valid: false,
        error: 'Localhost addresses are blocked for security',
        errorCode: ValidationErrorCode.WEBHOOK_URL_SSRF_BLOCKED
      };
    }

    // Block internal domain suffixes
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return {
        valid: false,
        error: 'Internal domain addresses are blocked for security',
        errorCode: ValidationErrorCode.WEBHOOK_URL_SSRF_BLOCKED
      };
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
        return {
          valid: false,
          error: `IP range '${range}' is blocked for security`,
          errorCode: ValidationErrorCode.WEBHOOK_URL_SSRF_BLOCKED
        };
      }

      // IPv6 special checks: IPv4-mapped addresses
      if (addr.kind() === 'ipv6') {
        const ipv6Addr = addr as ipaddr.IPv6;
        if (ipv6Addr.isIPv4MappedAddress()) {
          // Get mapped IPv4 address and check recursively
          const ipv4 = ipv6Addr.toIPv4Address();
          const ipv4Range = ipv4.range();

          if (forbiddenRanges.includes(ipv4Range)) {
            return {
              valid: false,
              error: `IPv4-mapped address range '${ipv4Range}' is blocked for security`,
              errorCode: ValidationErrorCode.WEBHOOK_URL_SSRF_BLOCKED
            };
          }
        }
      }
    }

    return { valid: true };
  } catch (error) {
    // new URL() throws TypeError for invalid URLs
    return {
      valid: false,
      error: 'Invalid URL format',
      errorCode: ValidationErrorCode.WEBHOOK_URL_INVALID
    };
  }
}
