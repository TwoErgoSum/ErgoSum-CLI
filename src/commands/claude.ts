import { Command } from 'commander';
import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { contextInjector } from '../lib/context-injector';
import { config } from '../lib/config';

export function createClaudeCommand(): Command {
  const claude = new Command('claude')
    .description('Claude Code integration commands');

  // Direct integration - wraps Claude Code CLI with context injection
  claude
    .command('ask <question>')
    .description('Ask Claude Code with ErgoSum context')
    .option('-c, --context <query>', 'Context search query (defaults to question)')
    .option('--no-context', 'Skip context injection')
    .option('--format <format>', 'Context format (markdown, text, json)', 'markdown')
    .option('-l, --limit <limit>', 'Number of context memories', '5')
    .option('--recent', 'Include recent memories in context')
    .option('--save-context', 'Save context to file for inspection')
    .option('--dry-run', 'Show what would be sent to Claude without executing')
    .action(async (question, options) => {
      try {
        let claudeArgs = ['ask', question];

        // Add context if not disabled
        if (options.context !== false) {
          const contextQuery = options.context || question;
          
          const spinner = ora('Gathering context from ErgoSum...').start();
          
          const injection = await contextInjector.injectContextForTool('claude-code', contextQuery, {
            searchOptions: { limit: parseInt(options.limit || '5') },
            format: options.format,
            includeRecent: options.recent,
          });

          spinner.stop();

          if (injection.memories.length > 0) {
            console.log(chalk.blue(`📚 Found ${injection.memories.length} relevant memories for context`));
            
            // Save context to file for inspection
            if (options.saveContext) {
              const contextFile = await contextInjector.createContextFile(injection, './ergosum-context.md');
              console.log(chalk.gray(`Context saved to: ${contextFile}`));
            }

            // Add context to Claude command
            claudeArgs = contextInjector.buildCommandWithContext(injection, claudeArgs);
          } else {
            console.log(chalk.yellow('⚠️  No relevant context found'));
          }
        }

        if (options.dryRun) {
          console.log(chalk.blue('Dry run - would execute:'));
          console.log(chalk.gray(`claude ${claudeArgs.join(' ')}`));
          return;
        }

        // Execute Claude Code CLI
        console.log(chalk.blue('🤖 Asking Claude Code...\n'));
        
        const claudeProcess = spawn('claude', claudeArgs, {
          stdio: 'inherit',
          shell: true,
        });

        claudeProcess.on('error', (error) => {
          if ((error as Error).message.includes('ENOENT')) {
            console.error(chalk.red('\n❌ Claude Code CLI not found'));
            console.error(chalk.gray('Please install Claude Code CLI first: https://claude.ai/code'));
          } else {
            console.error(chalk.red('Error executing Claude Code:'), (error as Error).message);
          }
          process.exit(1);
        });

        claudeProcess.on('close', (code) => {
          if (code !== 0) {
            process.exit(code || 1);
          }
        });

      } catch (error) {
        console.error(chalk.red('Failed to prepare Claude context:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Context preview command
  claude
    .command('context <query>')
    .description('Preview context that would be sent to Claude')
    .option('--format <format>', 'Context format (markdown, text, json)', 'markdown')
    .option('-l, --limit <limit>', 'Number of context memories', '5')
    .option('--recent', 'Include recent memories in context')
    .option('-o, --output <file>', 'Save context to file')
    .action(async (query, options) => {
      try {
        const spinner = ora('Searching for relevant context...').start();
        
        const injection = await contextInjector.injectContextForTool('claude-code', query, {
          searchOptions: { limit: parseInt(options.limit || '5') },
          format: options.format,
          includeRecent: options.recent,
        });

        spinner.stop();

        if (injection.memories.length === 0) {
          console.log(chalk.yellow('No relevant context found for query'));
          return;
        }

        console.log(chalk.blue(`📚 Found ${injection.memories.length} relevant memories:\n`));

        // Show memory summary
        injection.memories.forEach((mem, i) => {
          console.log(`${chalk.gray(`${i + 1}.`)} ${chalk.white(mem.title || 'Untitled')}`);
          console.log(`   ${chalk.gray('Tags:')} ${mem.tags.join(', ') || 'none'}`);
          console.log(`   ${chalk.gray('Type:')} ${mem.type}`);
          console.log();
        });

        const contextContent = contextInjector.formatContext(injection.memories, options.format);

        if (options.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, contextContent, 'utf8');
          console.log(chalk.green(`Context saved to ${options.output}`));
        } else {
          console.log(chalk.blue('Context that would be sent to Claude:'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(contextContent);
          console.log(chalk.gray('─'.repeat(50)));
        }

      } catch (error) {
        console.error(chalk.red('Failed to generate context:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Setup command for Claude Code integration
  claude
    .command('setup')
    .description('Setup Claude Code integration')
    .action(async () => {
      try {
        console.log(chalk.blue('🔧 Setting up Claude Code integration...\n'));

        // Check if Claude Code CLI is available
        const { spawn } = require('child_process');
        const checkClaude = spawn('claude', ['--version'], { stdio: 'pipe' });
        
        await new Promise((resolve, reject) => {
          checkClaude.on('close', (code: number) => {
            if (code === 0) {
              console.log(chalk.green('✅ Claude Code CLI detected'));
              resolve(true);
            } else {
              console.log(chalk.red('❌ Claude Code CLI not found'));
              console.log(chalk.gray('Please install Claude Code CLI from: https://claude.ai/code'));
              reject(new Error('Claude Code CLI not available'));
            }
          });
        });

        // Enable Claude Code integration
        config.set('integrations', {
          ...config.get('integrations'),
          claudeCode: true,
        });

        console.log(chalk.green('✅ Claude Code integration enabled'));
        console.log();
        console.log(chalk.blue('You can now use:'));
        console.log(chalk.gray('  ergosum claude ask "your question"'));
        console.log(chalk.gray('  ergosum claude context "search query"'));

      } catch (error) {
        console.error(chalk.red('Setup failed:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Wrapper for direct Claude Code commands with automatic context
  claude
    .command('wrap <command...>')
    .description('Wrap any Claude Code command with ErgoSum context')
    .option('-c, --context <query>', 'Context search query')
    .option('--no-context', 'Skip context injection')
    .option('--format <format>', 'Context format', 'markdown')
    .option('-l, --limit <limit>', 'Number of context memories', '5')
    .action(async (commandArgs, options) => {
      try {
        // Add context if specified
        if (options.context && options.context !== false) {
          const injection = await contextInjector.injectContextForTool('claude-code', options.context, {
            searchOptions: { limit: parseInt(options.limit || '5') },
            format: options.format,
          });

          if (injection.memories.length > 0) {
            commandArgs = contextInjector.buildCommandWithContext(injection, commandArgs);
          }
        }

        // Execute Claude Code CLI with wrapped command
        const claudeProcess = spawn('claude', commandArgs, {
          stdio: 'inherit',
          shell: true,
        });

        claudeProcess.on('error', (error) => {
          console.error(chalk.red('Error executing Claude Code:'), (error as Error).message);
          process.exit(1);
        });

        claudeProcess.on('close', (code) => {
          if (code !== 0) {
            process.exit(code || 1);
          }
        });

      } catch (error) {
        console.error(chalk.red('Failed to wrap Claude command:'), (error as Error).message);
        process.exit(1);
      }
    });

  return claude;
}