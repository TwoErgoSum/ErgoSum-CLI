import { Command } from 'commander';
import chalk from 'chalk';
import { contextInjector } from '../lib/context-injector';
import { config } from '../lib/config';

export function createClaudeCommand(): Command {
  const claude = new Command('claude')
    .description('Claude Code system integration commands');

  // System prompt integration - outputs JSON instructions for Claude Code
  claude
    .command('system-prompt')
    .description('Generate system prompt instructions for Claude Code integration')
    .action(() => {
      const systemPrompt = {
        integration: 'ergosum-cli',
        description: 'ErgoSum CLI integration for AI memory management',
        available_commands: [
          {
            command: 'ergosum memory list',
            description: 'List and search memories from ErgoSum',
            parameters: {
              '--query': 'Search query string',
              '--tags': 'Comma-separated tag filters',
              '--type': 'Memory type filter (TEXT, CODE, DOCUMENT, IMAGE)',
              '--limit': 'Number of results (default: 10)',
              '--format': 'Output format (json, table, yaml) - defaults to json'
            },
            returns: 'JSON array of memory objects with id, title, content, tags, type, createdAt'
          },
          {
            command: 'ergosum memory show <id>',
            description: 'Get full details of a specific memory',
            parameters: {
              '<id>': 'Memory ID to retrieve',
              '--format': 'Output format (json, text, yaml) - defaults to json'
            },
            returns: 'JSON object with complete memory details'
          },
          {
            command: 'ergosum memory store',
            description: 'Store new content in ErgoSum memory',
            parameters: {
              '--content': 'Content to store (required)',
              '--title': 'Optional title for the memory',
              '--type': 'Memory type (TEXT, CODE, DOCUMENT, IMAGE)',
              '--tags': 'Comma-separated tags'
            },
            returns: 'JSON confirmation with memory ID and metadata'
          },
          {
            command: 'ergosum memory search <query>',
            description: 'Search memories by query string',
            parameters: {
              '<query>': 'Search query string',
              '--tags': 'Additional tag filters',
              '--type': 'Memory type filter',
              '--limit': 'Number of results',
              '--format': 'Output format - defaults to json'
            },
            returns: 'JSON array of matching memories'
          },
          {
            command: 'ergosum auth status',
            description: 'Check if CLI is authenticated with ErgoSum',
            returns: 'JSON status with authentication state and user info'
          }
        ],
        usage_instructions: [
          'The ErgoSum CLI is designed to be called by AI assistants, not directly by humans',
          'All commands output structured JSON by default for easy parsing',
          'Use memory search and list commands to find relevant context for user queries',
          'Store important information, code snippets, and insights using memory store',
          'The CLI handles authentication and API communication automatically',
          'Memory search supports semantic similarity and keyword matching'
        ],
        integration_patterns: [
          'Before answering questions, search for relevant memories to provide context',
          'Store important insights, solutions, and code patterns discovered during conversations',
          'Use memory tags to organize information by topic, project, or domain',
          'Leverage the search functionality to find previous solutions to similar problems'
        ]
      };

      console.log(JSON.stringify(systemPrompt, null, 2));
      process.exit(0);
    });

  // Context search for AI - returns JSON formatted context
  claude
    .command('context <query>')
    .description('Search and format context for AI consumption')
    .option('-l, --limit <limit>', 'Number of memories to include', '5')
    .option('--format <format>', 'Context format (json, markdown, text)', 'json')
    .option('--include-recent', 'Include recent memories')
    .action(async (query, options) => {
      try {
        const memories = await contextInjector.searchRelevantMemories(query, {
          limit: parseInt(options.limit),
        });

        if (options.includeRecent) {
          const recentMemories = await contextInjector.getRecentMemories(3);
          const memoryIds = new Set(memories.map(m => m.id));
          for (const recent of recentMemories) {
            if (!memoryIds.has(recent.id)) {
              memories.push(recent);
            }
          }
        }

        const context = {
          query,
          memories_found: memories.length,
          context_data: memories,
          formatted_context: contextInjector.formatContext(memories, options.format),
          timestamp: new Date().toISOString(),
        };

        console.log(JSON.stringify(context, null, 2));
        process.exit(0);

      } catch (error) {
        console.log(JSON.stringify({
          error: true,
          message: (error as Error).message,
          query,
          timestamp: new Date().toISOString(),
        }, null, 2));
        process.exit(1);
      }
    });

  // Setup command - outputs configuration instructions
  claude
    .command('setup')
    .description('Show Claude Code integration setup instructions')
    .action(() => {
      const setupInstructions = {
        integration_type: 'claude-code-system-tools',
        setup_steps: [
          {
            step: 1,
            action: 'Install ErgoSum CLI',
            command: 'npm install -g ergosum-cli',
            description: 'Install the ErgoSum CLI globally'
          },
          {
            step: 2,
            action: 'Authenticate with ErgoSum',
            command: 'ergosum auth login',
            description: 'Login to your ErgoSum account'
          },
          {
            step: 3,
            action: 'Add to Claude Code system prompt',
            description: 'Add the system prompt from ergosum claude system-prompt to your Claude Code configuration',
            note: 'This enables Claude to understand and use the ErgoSum CLI commands'
          },
          {
            step: 4,
            action: 'Test integration',
            command: 'ergosum memory list --limit 3',
            description: 'Verify the integration works by listing some memories'
          }
        ],
        system_prompt_location: 'Run: ergosum claude system-prompt',
        documentation: 'https://ergosum.cc/docs/claude-code-integration'
      };

      console.log(JSON.stringify(setupInstructions, null, 2));
      process.exit(0);
    });

  return claude;
}