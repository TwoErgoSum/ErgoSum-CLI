#!/usr/bin/env node

import { Command } from 'commander';
import { searchMemories, storeMemory, getMemory } from './commands/memory-simple.js';
import { login, whoami, status } from './commands/auth-simple.js';

const program = new Command();

program
  .name('ergosum')
  .description('AI-friendly memory management for ErgoSum')
  .version('0.4.7');

// Core AI-friendly commands (JSON output by default)
program
  .command('search <query>')
  .description('Search your memories')
  .option('-l, --limit <number>', 'Number of results', '10')
  .action(searchMemories);

program
  .command('store <content>')
  .description('Store new memory')
  .option('-t, --title <title>', 'Memory title')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(storeMemory);

program
  .command('get <id>')
  .description('Get specific memory by ID')
  .action(getMemory);

// Simple auth commands
program
  .command('login')
  .description('Authenticate with ErgoSum')
  .action(login);

program
  .command('whoami')
  .description('Show current user info')
  .action(whoami);

program
  .command('status')
  .description('Check authentication status')
  .action(status);

// Claude integration help
program
  .command('help-claude')
  .description('Show Claude integration guide')
  .action(() => {
    console.log(JSON.stringify({
      "integration": "ergosum-cli",
      "description": "Simple CLI for AI memory management with ErgoSum",
      "commands": [
        {
          "command": "ergosum search <query>",
          "description": "Search memories by text",
          "example": "ergosum search 'React hooks'"
        },
        {
          "command": "ergosum store <content>",
          "description": "Store new content as memory", 
          "example": "ergosum store 'Remember: use useState for component state'"
        },
        {
          "command": "ergosum get <id>",
          "description": "Get full memory details by ID",
          "example": "ergosum get cmf7qhaqq0001c26lhgp970th"
        },
        {
          "command": "ergosum status",
          "description": "Check if authenticated",
          "example": "ergosum status"
        }
      ],
      "usage": "All commands output JSON for easy parsing. Perfect for AI assistants to search and store information.",
      "setup": "Run 'ergosum login' first to authenticate"
    }, null, 2));
    process.exit(0);
  });

program.parse(process.argv);