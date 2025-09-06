// Core types for ErgoSum CLI
export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  title?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  organizationId: string;
  ownerId: string;
  sourceApp: string;
  metadata: Record<string, any>;
}

export type MemoryType = 'TEXT' | 'CODE' | 'IMAGE' | 'DOCUMENT';

export interface MemoryStoreRequest {
  content: string;
  type: MemoryType;
  title?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface MemoryListResponse {
  memories: Memory[];
  total: number;
}

// CLI Configuration
export interface CLIConfig {
  apiUrl: string;
  token?: string;
  userId?: string;
  organizationId?: string;
  defaultTags: string[];
  integrations: {
    claudeCode: boolean;
    codex: boolean;
    gemini: boolean;
  };
}

// AI Tool Integration
export interface AITool {
  name: string;
  command: string;
  contextFlag?: string;
  supportedFormats: string[];
}

export interface ContextInjection {
  tool: AITool;
  memories: Memory[];
  format: 'text' | 'json' | 'yaml' | 'markdown';
}

// Search and filtering
export interface SearchOptions {
  query?: string;
  tags?: string[];
  type?: MemoryType;
  limit?: number;
  offset?: number;
  since?: Date;
  until?: Date;
}

// Plugin system
export interface Plugin {
  name: string;
  version: string;
  description: string;
  commands: PluginCommand[];
  hooks: PluginHook[];
}

export interface PluginCommand {
  name: string;
  description: string;
  handler: (args: any[]) => Promise<void>;
}

export interface PluginHook {
  event: 'before-search' | 'after-search' | 'before-store' | 'after-store';
  handler: (context: any) => Promise<any>;
}