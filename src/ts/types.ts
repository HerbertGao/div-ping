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

export interface WebhookConfig {
  enabled: boolean;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: string | Record<string, string>;
  body?: string | Record<string, any>;
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

export interface MessageRequest {
  action: string;
  [key: string]: any;
}

export interface MessageResponse {
  success: boolean;
  error?: string;
  [key: string]: any;
}
