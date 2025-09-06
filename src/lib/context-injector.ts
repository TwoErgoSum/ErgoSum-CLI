import { Memory, ContextInjection, AITool, SearchOptions } from '../types';
import { apiClient } from './api-client';
import chalk from 'chalk';

export class ContextInjector {
  private static readonly AI_TOOLS: Record<string, AITool> = {
    'claude-code': {
      name: 'Claude Code',
      command: 'claude',
      contextFlag: '--context',
      supportedFormats: ['text', 'markdown'],
    },
    'codex': {
      name: 'GitHub Codex',
      command: 'codex',
      contextFlag: '--context',
      supportedFormats: ['text', 'json'],
    },
    'gemini': {
      name: 'Google Gemini CLI',
      command: 'gemini',
      contextFlag: '--context',
      supportedFormats: ['text', 'markdown', 'json'],
    },
    'cursor': {
      name: 'Cursor CLI',
      command: 'cursor',
      contextFlag: '--context',
      supportedFormats: ['text', 'markdown'],
    },
  };

  static getAvailableTools(): AITool[] {
    return Object.values(this.AI_TOOLS);
  }

  static getTool(name: string): AITool | undefined {
    return this.AI_TOOLS[name.toLowerCase()];
  }

  async searchRelevantMemories(query: string, options: SearchOptions = {}): Promise<Memory[]> {
    const searchOptions: SearchOptions = {
      limit: 10,
      ...options,
      query,
    };

    const response = await apiClient.searchMemories(query, searchOptions);
    return response.memories;
  }

  async getRecentMemories(limit: number = 5): Promise<Memory[]> {
    const response = await apiClient.listMemories({ limit });
    return response.memories;
  }

  formatContext(memories: Memory[], format: 'text' | 'json' | 'yaml' | 'markdown' = 'markdown'): string {
    if (memories.length === 0) {
      return 'No relevant context found.';
    }

    switch (format) {
      case 'json':
        return JSON.stringify(memories.map(m => ({
          title: m.title,
          content: m.content,
          tags: m.tags,
          type: m.type,
        })), null, 2);

      case 'yaml':
        return memories.map(m => `
- title: "${m.title || 'Untitled'}"
  type: ${m.type}
  tags: [${m.tags.join(', ')}]
  content: |
    ${m.content.split('\n').map(line => `    ${line}`).join('\n')}
        `).join('\n');

      case 'text':
        return memories.map(m => `${m.title || 'Untitled'}: ${m.content}`).join('\n\n');

      case 'markdown':
      default:
        return `# Context from ErgoSum

${memories.map(m => `
## ${m.title || 'Untitled Memory'}
**Type:** ${m.type}  
**Tags:** ${m.tags.join(', ')}  
**Created:** ${new Date(m.createdAt).toLocaleDateString()}

${m.content}
        `).join('\n---\n')}

*Context retrieved from ErgoSum CLI*`;
    }
  }

  async injectContextForTool(
    toolName: string, 
    query: string, 
    options: {
      searchOptions?: SearchOptions;
      format?: 'text' | 'json' | 'yaml' | 'markdown';
      includeRecent?: boolean;
    } = {}
  ): Promise<ContextInjection> {
    const tool = ContextInjector.getTool(toolName);
    if (!tool) {
      throw new Error(`Unknown AI tool: ${toolName}. Available tools: ${Object.keys(ContextInjector.AI_TOOLS).join(', ')}`);
    }

    const format = options.format || tool.supportedFormats[0] as any || 'text';
    
    // Search for relevant memories
    const searchMemories = await this.searchRelevantMemories(query, options.searchOptions);
    
    // Optionally include recent memories
    const recentMemories = options.includeRecent ? await this.getRecentMemories(3) : [];
    
    // Combine and deduplicate
    const allMemories = [...searchMemories];
    const memoryIds = new Set(allMemories.map(m => m.id));
    
    for (const recent of recentMemories) {
      if (!memoryIds.has(recent.id)) {
        allMemories.push(recent);
      }
    }

    return {
      tool,
      memories: allMemories.slice(0, 10), // Limit total context
      format,
    };
  }

  buildCommandWithContext(injection: ContextInjection, originalCommand: string[]): string[] {
    const contextString = this.formatContext(injection.memories, injection.format);
    
    if (!injection.tool.contextFlag) {
      console.warn(chalk.yellow(`Warning: ${injection.tool.name} doesn't support context injection`));
      return originalCommand;
    }

    // Add context flag and content
    return [...originalCommand, injection.tool.contextFlag, contextString];
  }

  async createContextFile(injection: ContextInjection, filename?: string): Promise<string> {
    const contextContent = this.formatContext(injection.memories, injection.format);
    const filepath = filename || `/tmp/ergosum-context-${Date.now()}.md`;
    
    const fs = await import('fs/promises');
    await fs.writeFile(filepath, contextContent, 'utf8');
    
    return filepath;
  }
}

export const contextInjector = new ContextInjector();