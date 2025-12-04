/**
 * Application constants
 * Centralized location for magic numbers and configuration values
 */

/**
 * Timeout configurations (in milliseconds)
 */
export const TIMEOUTS = {
  /** Tab loading timeout */
  TAB_LOAD: 30000,
  /** Extra delay after tab status is complete to ensure content script is loaded */
  TAB_LOAD_EXTRA_DELAY: 500,
  /** Polling interval for checking tab status */
  TAB_STATUS_CHECK: 100,
  /** Webhook request timeout */
  WEBHOOK_REQUEST: 10000,
} as const;

/**
 * Storage and resource limits
 */
export const LIMITS = {
  /** Maximum number of log entries to keep per project */
  MAX_LOGS_PER_PROJECT: 100,
  /** Minimum monitoring interval in seconds (Chrome Alarms API limitation) */
  MIN_INTERVAL_SECONDS: 60,
  /** Minimum monitoring interval in milliseconds */
  MIN_INTERVAL_MS: 60000,
  /** Maximum project name length */
  MAX_PROJECT_NAME_LENGTH: 100,
  /** Maximum CSS selector length */
  MAX_SELECTOR_LENGTH: 500,
  /** Maximum URL length */
  MAX_URL_LENGTH: 2000,
  /** Maximum webhook body size in bytes */
  MAX_WEBHOOK_BODY_SIZE: 10000,
  /** Maximum webhook headers total size in bytes */
  MAX_WEBHOOK_HEADERS_SIZE: 8000,
  /** Maximum monitoring interval in milliseconds (24 hours) */
  MAX_INTERVAL_MS: 86400000,
  /** Maximum tab cache size (increased to support monitoring many URLs) */
  MAX_TAB_CACHE_SIZE: 200,
} as const;

/**
 * Default values for project configuration
 */
export const DEFAULTS = {
  /** Default monitoring interval in seconds */
  INTERVAL_SECONDS: 60,
  /** Default monitoring interval in milliseconds */
  INTERVAL_MS: 60000,
} as const;
