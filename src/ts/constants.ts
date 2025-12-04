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
