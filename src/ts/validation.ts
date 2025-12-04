/**
 * Input validation utilities
 * Validates user inputs to prevent security issues and data corruption
 *
 * Note: Error messages are in English as they serve as technical error codes.
 * For user-facing display, these should be translated in the UI layer.
 */

import { LIMITS } from './constants';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate project name
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
 * Validate CSS selector
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
  try {
    document.querySelector(selector);
  } catch (err) {
    return {
      valid: false,
      error: `Invalid CSS selector syntax: ${err instanceof Error ? err.message : 'Unknown error'}`
    };
  }

  return { valid: true };
}

/**
 * Validate URL
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
 * Validate webhook body size
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
 * Validate monitoring interval
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

  if (interval > 86400000) { // 24 hours
    return {
      valid: false,
      error: 'Interval cannot exceed 24 hours'
    };
  }

  return { valid: true };
}
