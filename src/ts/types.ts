/**
 * Project-related type definitions
 * Core data structures for monitoring web page elements
 */

/**
 * Represents a monitoring project configuration
 * @interface Project
 * @property {string} id - Unique identifier for the project (timestamp-based)
 * @property {string} name - User-defined project name
 * @property {string} url - Target webpage URL to monitor
 * @property {string} selector - CSS selector for the DOM element to monitor
 * @property {number} interval - Monitoring interval in milliseconds (minimum 60000ms)
 * @property {boolean} active - Whether monitoring is currently active
 * @property {boolean} browserNotification - Whether to show browser notifications on changes
 * @property {WebhookConfig} [webhook] - Optional webhook configuration for external notifications
 * @property {string} [lastContent] - Last observed content of the monitored element
 * @property {string} [lastChecked] - ISO timestamp of last check
 * @property {number | null} [tabId] - Chrome tab ID used for monitoring (cached for reuse)
 * @property {string} [lastWebhookTime] - ISO timestamp of last webhook call (for rate limiting)
 * @property {number} [loadDelay] - Additional delay in milliseconds after page load before checking element (for Ajax/async content, default: 0, range: 0-60000)
 */
export interface Project {
  id: string;
  name: string;
  url: string;
  selector: string;
  interval: number;
  active: boolean;
  browserNotification: boolean;
  webhook?: WebhookConfig;
  lastContent?: string;
  lastChecked?: string;
  tabId?: number | null;
  lastWebhookTime?: string;
  loadDelay?: number;
}

/**
 * Recursive type for webhook body values
 * Supports nested objects and arrays of basic types
 * Note: Using index signature instead of Record<> to avoid circular reference issues
 */
type WebhookBodyValue = string | number | boolean | null | WebhookBodyValue[] | { [key: string]: WebhookBodyValue };

/**
 * Webhook configuration for external notifications
 * @interface WebhookConfig
 * @property {boolean} enabled - Whether webhook is enabled
 * @property {string} [url] - Webhook endpoint URL (validated for SSRF protection)
 * @property {'GET' | 'POST' | 'PUT' | 'PATCH'} [method='POST'] - HTTP method to use
 * @property {string | Record<string, string>} [headers] - Custom headers (JSON string or object)
 * @property {string | Record<string, WebhookBodyValue>} [body] - Request body (JSON string or object)
 *
 * @example
 * ```typescript
 * const webhook: WebhookConfig = {
 *   enabled: true,
 *   url: 'https://api.example.com/notify',
 *   method: 'POST',
 *   headers: { 'Authorization': 'Bearer token' },
 *   body: { project: '{{projectName}}', content: '{{newContent}}' }
 * };
 * ```
 */
export interface WebhookConfig {
  enabled: boolean;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: string | Record<string, string>;
  body?: string | Record<string, WebhookBodyValue>;
}

/**
 * Log entry for monitoring history
 * @interface LogEntry
 * @property {string} timestamp - ISO timestamp of the check
 * @property {string} [content] - Content observed during this check
 * @property {string | null} [oldContent] - Previous content (for change detection)
 * @property {boolean} [changed] - Whether content changed from previous check
 * @property {boolean} success - Whether the check succeeded without errors
 * @property {string} [error] - Error message if check failed
 */
export interface LogEntry {
  timestamp: string;
  content?: string;
  oldContent?: string | null;
  changed?: boolean;
  success: boolean;
  error?: string;
}

/**
 * Internal monitoring information
 * @interface MonitorInfo
 * @property {number} intervalId - Chrome alarms interval ID
 * @property {Project} project - Associated project configuration
 * @internal
 */
export interface MonitorInfo {
  intervalId: number;
  project: Project;
}

/**
 * Variables available for webhook template substitution
 * Used with {{variableName}} syntax in webhook URLs, headers, and body
 * @interface WebhookVariables
 * @property {string} projectId - Unique project identifier
 * @property {string} projectName - User-defined project name
 * @property {string} url - Monitored webpage URL
 * @property {string} selector - CSS selector being monitored
 * @property {string} oldContent - Previous content (before change)
 * @property {string} newContent - New content (after change)
 * @property {string} timestamp - ISO timestamp of the change
 *
 * @example
 * ```typescript
 * // Webhook URL with variables:
 * "https://api.example.com/notify?project={{projectName}}&time={{timestamp}}"
 *
 * // Webhook body with variables:
 * { "old": "{{oldContent}}", "new": "{{newContent}}" }
 * ```
 */
export interface WebhookVariables {
  projectId: string;
  projectName: string;
  url: string;
  selector: string;
  oldContent: string;
  newContent: string;
  timestamp: string;
}

/**
 * Message request sent between extension components
 * Uses Chrome extension messaging API (chrome.runtime.sendMessage)
 * @interface MessageRequest
 * @property {string} action - Action type identifier (e.g., 'elementSelected', 'testWebhook')
 * @property {any} [key: string] - Additional action-specific properties
 *
 * @example
 * ```typescript
 * const request: MessageRequest = {
 *   action: 'elementSelected',
 *   name: 'My Project',
 *   selector: '#content',
 *   url: 'https://example.com'
 * };
 * ```
 */
export interface MessageRequest {
  action: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Message interface needs any type to support dynamic properties
  [key: string]: any;
}

/**
 * Message response returned from extension components
 * @interface MessageResponse
 * @property {boolean} success - Whether the action succeeded
 * @property {string} [error] - Error message if action failed
 * @property {any} [key: string] - Additional response data
 *
 * @example
 * ```typescript
 * const response: MessageResponse = {
 *   success: true,
 *   projectId: '1234567890'
 * };
 * ```
 */
export interface MessageResponse {
  success: boolean;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Response interface needs any type to support dynamic properties
  [key: string]: any;
}

/**
 * User preferences and application settings
 * @interface Settings
 * @property {number} defaultInterval - Default monitoring interval in milliseconds
 * @property {boolean} defaultBrowserNotification - Default browser notification setting for new projects
 * @property {boolean} defaultWebhook - Default webhook enabled state for new projects
 * @property {string} defaultWebhookUrl - Default webhook URL for new projects
 * @property {number} webhookTimeout - Webhook request timeout in seconds
 * @property {boolean} autoReload - Whether to auto-reload monitored pages
 * @property {boolean} soundNotification - Whether to play sound on notifications
 * @property {number} maxRetries - Maximum retry attempts for failed checks
 */
export interface Settings {
  defaultInterval: number;
  defaultBrowserNotification: boolean;
  defaultWebhook: boolean;
  defaultWebhookUrl: string;
  webhookTimeout: number;
  autoReload: boolean;
  soundNotification: boolean;
  maxRetries: number;
}

/**
 * Data structure for exporting/importing configuration
 * Used for backup and migration between browsers
 * @interface ExportData
 * @property {string} version - Export format version (for compatibility checking)
 * @property {string} exportDate - ISO timestamp when export was created
 * @property {Project[]} projects - All project configurations
 * @property {Settings} settings - User settings and preferences
 *
 * @example
 * ```typescript
 * const exportData: ExportData = {
 *   version: '1.0.0',
 *   exportDate: new Date().toISOString(),
 *   projects: [...],
 *   settings: {...}
 * };
 * ```
 */
export interface ExportData {
  version: string;
  exportDate: string;
  projects: Project[];
  settings: Settings;
}
