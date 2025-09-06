import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { apiClient } from '../lib/api-client';
import { contextInjector } from '../lib/context-injector';
import { MemoryType, SearchOptions } from '../types';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { ErrorHandler } from '../lib/errors';
import { withProgress, createSpinner, createProgressBar } from '../lib/progress';
import { validateSearchOptions } from '../lib/validation';

export function createMemoryCommand(): Command {
  const memory = new Command('memory')
    .alias('mem')
    .description('Memory management commands');

  // Store command
  memory
    .command('store')
    .alias('add')
    .description('Store content in ErgoSum memory')
    .option('-c, --content <content>', 'Content to store')
    .option('-t, --title <title>', 'Title for the memory')
    .option('--type <type>', 'Memory type (TEXT, CODE, IMAGE, DOCUMENT)', 'TEXT')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('-f, --file <file>', 'Read content from file')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (options) => {
      try {
        let content = options.content;
        let title = options.title;
        let type = options.type.toUpperCase() as MemoryType;
        let tags: string[] = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [];

        // Read from file if specified
        if (options.file) {
          const fs = await import('fs/promises');
          content = await fs.readFile(options.file, 'utf8');
          if (!title) {
            title = `Content from ${options.file}`;
          }
        }

        // Interactive mode
        if (options.interactive || !content) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'title',
              message: 'Title (optional):',
              default: title,
            },
            {
              type: 'list',
              name: 'type',
              message: 'Memory type:',
              choices: ['TEXT', 'CODE', 'DOCUMENT', 'IMAGE'],
              default: type,
            },
            {
              type: 'editor',
              name: 'content',
              message: 'Content:',
              default: content,
              validate: (input: string) => input.trim().length > 0 || 'Content is required',
            },
            {
              type: 'input',
              name: 'tags',
              message: 'Tags (comma-separated):',
              default: tags.join(', '),
              filter: (input: string) => input.split(',').map(t => t.trim()).filter(t => t.length > 0),
            },
          ]);

          Object.assign({ content, title, type, tags }, answers);
        }

        if (!content?.trim()) {
          throw new Error('Content is required');
        }

        // Add default tags
        const defaultTags = config.get('defaultTags') || [];
        const allTags = [...new Set([...tags, ...defaultTags])];

        const response = await withProgress(
          () => apiClient.storeMemory({
            content: content.trim(),
            title: title?.trim(),
            type,
            tags: allTags,
            metadata: {
              source: 'cli',
              timestamp: new Date().toISOString(),
            },
          }),
          'Storing memory...',
          'Memory stored successfully'
        );

        logger.info('Memory stored', { 
          id: response.id, 
          contentLength: content.trim().length,
          tags: allTags.length 
        });

      } catch (error) {
        const ergoError = ErrorHandler.handle(error, 'memory_store');
        console.error(chalk.red('Failed to store memory:'), ErrorHandler.getUserMessage(ergoError));
        logger.logError(ergoError, { context: 'memory_store', options });
        process.exit(1);
      }
    });

  // List command
  memory
    .command('list')
    .alias('ls')
    .description('List memories')
    .option('-q, --query <query>', 'Search query')
    .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
    .option('--type <type>', 'Filter by type (TEXT, CODE, IMAGE, DOCUMENT)')
    .option('-l, --limit <limit>', 'Number of results', '10')
    .option('--offset <offset>', 'Offset for pagination', '0')
    .option('--format <format>', 'Output format (table, json, yaml)', 'table')
    .action(async (options) => {
      try {
        const searchOptions: SearchOptions = {
          query: options.query,
          tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined,
          type: options.type,
          limit: parseInt(options.limit),
          offset: parseInt(options.offset),
        };

        const response = await withProgress(
          () => apiClient.listMemories(searchOptions),
          'Fetching memories...',
          'Memories retrieved successfully'
        );

        if (response.memories.length === 0) {
          console.log(chalk.yellow('No memories found'));
          return;
        }

        switch (options.format) {
          case 'json':
            console.log(JSON.stringify(response, null, 2));
            break;
          case 'yaml':
            const yaml = await import('yaml');
            console.log(yaml.stringify(response));
            break;
          case 'table':
          default:
            console.log(chalk.blue(`\nFound ${response.total} memories:\n`));
            response.memories.forEach((mem, i) => {
              const index = options.offset + i + 1;
              console.log(`${chalk.gray(`${index}.`)} ${chalk.white(mem.title || 'Untitled')}`);
              console.log(`   ${chalk.gray('ID:')} ${mem.id}`);
              console.log(`   ${chalk.gray('Type:')} ${mem.type}`);
              console.log(`   ${chalk.gray('Tags:')} ${mem.tags.join(', ') || 'none'}`);
              console.log(`   ${chalk.gray('Created:')} ${new Date(mem.createdAt).toLocaleString()}`);
              console.log(`   ${chalk.gray('Content:')} ${mem.content.slice(0, 100)}${mem.content.length > 100 ? '...' : ''}`);
              console.log();
            });
            
            if (response.total > response.memories.length) {
              const remaining = response.total - (parseInt(options.offset) + response.memories.length);
              console.log(chalk.gray(`... and ${remaining} more. Use --offset to see more results.`));
            }
            break;
        }

      } catch (error) {
        console.error(chalk.red('Failed to list memories:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Search command
  memory
    .command('search <query>')
    .description('Search memories')
    .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
    .option('--type <type>', 'Filter by type')
    .option('-l, --limit <limit>', 'Number of results', '10')
    .option('--format <format>', 'Output format (table, json, context)', 'table')
    .action(async (query, options) => {
      // Reuse list command logic with query
      await memory.commands.find(cmd => cmd.name() === 'list')
        ?.action({
          ...options,
          query,
        });
    });

  // Show command
  memory
    .command('show <id>')
    .description('Show a specific memory')
    .option('--format <format>', 'Output format (text, json, yaml)', 'text')
    .action(async (id, options) => {
      try {
        const memory = await withProgress(
          () => apiClient.getMemory(id),
          'Fetching memory...',
          'Memory retrieved successfully'
        );

        switch (options.format) {
          case 'json':
            console.log(JSON.stringify(memory, null, 2));
            break;
          case 'yaml':
            const yaml = await import('yaml');
            console.log(yaml.stringify(memory));
            break;
          case 'text':
          default:
            console.log(chalk.blue(`\n${memory.title || 'Untitled Memory'}\n`));
            console.log(`${chalk.gray('ID:')} ${memory.id}`);
            console.log(`${chalk.gray('Type:')} ${memory.type}`);
            console.log(`${chalk.gray('Tags:')} ${memory.tags.join(', ') || 'none'}`);
            console.log(`${chalk.gray('Created:')} ${new Date(memory.createdAt).toLocaleString()}`);
            console.log(`${chalk.gray('Updated:')} ${new Date(memory.updatedAt).toLocaleString()}`);
            console.log();
            console.log(memory.content);
            break;
        }

      } catch (error) {
        console.error(chalk.red('Failed to fetch memory:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Delete command
  memory
    .command('delete <id>')
    .alias('rm')
    .description('Delete a memory')
    .option('--yes', 'Skip confirmation')
    .action(async (id, options) => {
      try {
        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete memory ${id}?`,
              default: false,
            },
          ]);

          if (!confirm) {
            console.log('Cancelled');
            return;
          }
        }

        await withProgress(
          () => apiClient.deleteMemory(id),
          'Deleting memory...',
          'Memory deleted successfully'
        );

      } catch (error) {
        console.error(chalk.red('Failed to delete memory:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Context command - generate context for AI tools
  memory
    .command('context <query>')
    .description('Generate context from memories for AI tools')
    .option('--format <format>', 'Output format (markdown, text, json, yaml)', 'markdown')
    .option('-l, --limit <limit>', 'Number of memories to include', '5')
    .option('--recent', 'Include recent memories')
    .option('-o, --output <file>', 'Save context to file')
    .action(async (query, options) => {
      try {
        const spinner = createSpinner('Searching for relevant context...');
        spinner.start();
        
        const memories = await contextInjector.searchRelevantMemories(query, {
          limit: parseInt(options.limit),
        });

        if (options.recent) {
          const recentMemories = await contextInjector.getRecentMemories(3);
          const memoryIds = new Set(memories.map(m => m.id));
          for (const recent of recentMemories) {
            if (!memoryIds.has(recent.id)) {
              memories.push(recent);
            }
          }
        }

        spinner.stop();

        const context = contextInjector.formatContext(memories, options.format);

        if (options.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, context, 'utf8');
          console.log(chalk.green(`Context saved to ${options.output}`));
        } else {
          console.log(context);
        }

      } catch (error) {
        console.error(chalk.red('Failed to generate context:'), (error as Error).message);
        process.exit(1);
      }
    });

  return memory;
}