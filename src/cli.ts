#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from './lib/config';
import { createAuthCommand } from './commands/auth';
import { createMemoryCommand } from './commands/memory';
import { createClaudeCommand } from './commands/claude';
import { createConfigCommand } from './commands/config';
import { createCacheCommand } from './commands/cache';

// Package info
const packageInfo = require('../package.json');

// Create main CLI program
const program = new Command();

program
  .name('ergosum')
  .description('CLI tool for integrating ErgoSum memory and context with AI tools')
  .version(packageInfo.version)
  .option('-v, --verbose', 'Enable verbose output')
  .option('--api-url <url>', 'Override API URL')
  .hook('preAction', (thisCommand) => {
    // Handle global options
    const opts = thisCommand.opts();
    
    if (opts.verbose) {
      process.env.DEBUG = '1';
    }
    
    if (opts.apiUrl) {
      config.set('apiUrl', opts.apiUrl);
    }
  });

// Add commands
program.addCommand(createAuthCommand());
program.addCommand(createMemoryCommand());
program.addCommand(createClaudeCommand());
program.addCommand(createConfigCommand());
program.addCommand(createCacheCommand());

// Add quick shortcuts for common operations
program
  .command('search <query>')
  .description('Quick memory search (alias for memory search)')
  .option('-l, --limit <limit>', 'Number of results', '10')
  .option('--format <format>', 'Output format', 'table')
  .action(async (query, options) => {
    const memoryCommand = createMemoryCommand();
    const searchCommand = memoryCommand.commands.find(cmd => cmd.name() === 'search');
    if (searchCommand) {
      await (searchCommand as any).action(query, options);
    }
  });

program
  .command('add <content>')
  .description('Quick memory storage (alias for memory store)')
  .option('-t, --title <title>', 'Title for the memory')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(async (content, options) => {
    const memoryCommand = createMemoryCommand();
    const storeCommand = memoryCommand.commands.find(cmd => cmd.name() === 'store');
    if (storeCommand) {
      await storeCommand.action({ ...options, content });
    }
  });

// Status command - quick health check
program
  .command('status')
  .description('Show ErgoSum CLI status')
  .action(async () => {
    console.log(chalk.blue('ErgoSum CLI Status:\n'));
    
    // Authentication status
    if (config.isAuthenticated()) {
      console.log(`${chalk.green('✅')} Authenticated`);
      const userId = config.get('userId');
      const orgId = config.get('organizationId');
      if (userId) console.log(`   User ID: ${chalk.gray(userId)}`);
      if (orgId) console.log(`   Organization: ${chalk.gray(orgId)}`);
    } else {
      console.log(`${chalk.red('❌')} Not authenticated`);
      console.log(`   Run ${chalk.cyan('ergosum auth login')} to authenticate`);
    }
    
    // API status
    try {
      const { apiClient } = require('./lib/api-client');
      const isHealthy = await apiClient.healthCheck();
      if (isHealthy) {
        console.log(`${chalk.green('✅')} API connection healthy`);
      } else {
        console.log(`${chalk.yellow('⚠️')} API connection issues`);
      }
    } catch (error) {
      console.log(`${chalk.red('❌')} API connection failed`);
    }
    
    // Configuration
    const apiUrl = config.get('apiUrl');
    console.log(`   API URL: ${chalk.gray(apiUrl)}`);
    
    // Integrations
    const integrations = config.get('integrations');
    const enabledIntegrations = Object.entries(integrations)
      .filter(([_, enabled]) => enabled)
      .map(([tool, _]) => tool);
    
    if (enabledIntegrations.length > 0) {
      console.log(`${chalk.green('✅')} Integrations: ${enabledIntegrations.join(', ')}`);
    } else {
      console.log(`${chalk.gray('○')} No integrations enabled`);
      console.log(`   Run ${chalk.cyan('ergosum config setup')} to enable integrations`);
    }
  });

// Help enhancement
program.on('--help', () => {
  console.log();
  console.log(chalk.blue('Examples:'));
  console.log('  $ ergosum auth login                    # Authenticate with ErgoSum');
  console.log('  $ ergosum add "Hello world"             # Store content quickly');
  console.log('  $ ergosum search "javascript"           # Search memories');
  console.log('  $ ergosum claude ask "How to debug?"    # Ask Claude with context');
  console.log('  $ ergosum memory context "react hooks"  # Generate context');
  console.log('  $ ergosum config setup                  # Interactive setup');
  console.log();
  console.log(chalk.blue('Integration:'));
  console.log('  $ ergosum claude setup                  # Setup Claude Code integration');
  console.log('  $ ergosum claude ask "your question"    # Ask Claude with ErgoSum context');
  console.log('  $ ergosum claude context "search term"  # Preview context for Claude');
  console.log();
  console.log(chalk.gray('For more information, visit: https://github.com/TwoErgoSum/ErgoSum-cli'));
});

// Error handling
process.on('uncaughtException', (error: Error) => {
  console.error(chalk.red('Unexpected error:'), error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error(chalk.red('Unhandled promise rejection:'), reason);
  process.exit(1);
});

// Parse arguments and execute
async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(chalk.red('Command failed:'), (error as Error).message);
    if (process.env.DEBUG) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

// Only run if this is the main module
if (require.main === module) {
  main();
}

export { program };