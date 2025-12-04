// 项目相关类型定义

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
}

// Webhook body可以是字符串或包含基本类型的对象
type WebhookBodyValue = string | number | boolean | null | WebhookBodyValue[] | { [key: string]: WebhookBodyValue };

export interface WebhookConfig {
  enabled: boolean;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: string | Record<string, string>;
  body?: string | Record<string, WebhookBodyValue>;
}

export interface LogEntry {
  timestamp: string;
  content?: string;
  oldContent?: string | null;
  changed?: boolean;
  success: boolean;
  error?: string;
}

export interface MonitorInfo {
  intervalId: number;
  project: Project;
}

export interface WebhookVariables {
  projectId: string;
  projectName: string;
  url: string;
  selector: string;
  oldContent: string;
  newContent: string;
  timestamp: string;
}

// 消息类型 - 需要灵活性以支持不同的消息格式
export interface MessageRequest {
  action: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 消息接口需要any类型以支持动态属性
  [key: string]: any;
}

export interface MessageResponse {
  success: boolean;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 响应接口需要any类型以支持动态属性
  [key: string]: any;
}

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

export interface ExportData {
  version: string;
  exportDate: string;
  projects: Project[];
  settings: Settings;
}
