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
  offlineMode?: boolean;
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

// Context Repository System (Git-like version control)
export interface ContextRepo {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  remote_url?: string;
  default_branch: string;
  created_at: Date;
  updated_at: Date;
  settings: RepoSettings;
}

export interface RepoSettings {
  auto_embed: boolean;
  max_file_size: number;
  ignore_patterns: string[];
  ai_integration: {
    generate_summaries: boolean;
    optimize_for: 'gpt' | 'claude' | 'general';
  };
}

export interface ContextCommit {
  id: string; // SHA hash
  repo_id: string;
  message: string;
  parent_id?: string;
  tree_id: string; // Points to content tree
  author: string;
  timestamp: Date;
  metadata: {
    files_changed: number;
    additions: number;
    deletions: number;
    embeddings_count?: number;
    ai_summary?: string;
  };
}

export interface ContentObject {
  id: string; // SHA hash of content
  type: 'file' | 'directory' | 'embedding';
  content: string | Buffer;
  encoding: 'utf8' | 'binary' | 'base64';
  size: number;
  mime_type?: string;
  embedding?: number[]; // Vector embedding for semantic search
  created_at: Date;
}

export interface ContextBranch {
  id: string;
  repo_id: string;
  name: string;
  commit_id: string; // Points to latest commit
  created_at: Date;
  updated_at: Date;
}

export interface ContextTree {
  id: string; // SHA hash
  entries: TreeEntry[];
}

export interface TreeEntry {
  mode: string; // File mode (100644, 040000, etc.)
  name: string;
  object_id: string; // Points to ContentObject or another tree
  type: 'file' | 'directory';
}

export interface IndexEntry {
  path: string;
  object_id: string;
  mode: string;
  size: number;
  modified_time: Date;
  staged: boolean;
}

export interface RepoState {
  head: string; // Current branch or commit
  staged: IndexEntry[];
  working_directory: Map<string, ContentObject>;
  branches: Map<string, string>; // branch name -> commit id
  tags: Map<string, string>; // tag name -> commit id
}

// Context sharing (extends existing system)
export interface ContextShareRepo extends ContextShare {
  repo_id: string;
  branch?: string;
  commit_id?: string;
  path_filter?: string;
}

export interface ContextShare {
  id: string;
  token: string;
  name: string;
  description?: string;
  is_active: boolean;
  permissions: SharePermissions;
  max_results: number;
  expires_at?: Date;
  usage_count: number;
  last_used_at?: Date;
  created_at: Date;
}

export interface SharePermissions {
  read_only: boolean;
  require_auth: boolean;
  allowed_formats: ('vectors' | 'json' | 'markdown')[];
}

// Command options
export interface InitOptions {
  name?: string;
  description?: string;
  remote?: string;
  template?: string;
}

export interface AddOptions {
  all?: boolean;
  force?: boolean;
  dry_run?: boolean;
  interactive?: boolean;
  pattern?: string;
  as_type?: MemoryType;
  generate_embeddings?: boolean;
}

export interface CommitOptions {
  message?: string;
  all?: boolean;
  amend?: boolean;
  ai_message?: boolean;
  author?: string;
}

export interface StatusOptions {
  short?: boolean;
  porcelain?: boolean;
  ignored?: boolean;
}

export interface BranchOptions {
  create?: boolean;
  delete?: boolean;
  force?: boolean;
  list?: boolean;
  remote?: boolean;
}