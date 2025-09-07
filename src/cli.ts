#!/usr/bin/env node

import { Command } from 'commander';
import { searchMemories, storeMemory, getMemory } from './commands/memory-simple.js';
import { login, whoami, status } from './commands/auth-simple.js';
import { initRepo, addFiles, commitChanges, showStatus, pushRepository, fetchRepository, pullRepository, cloneRepository } from './commands/context-repo.js';

const program = new Command();

program
  .name('ergosum')
  .description('Git-like CLI for AI context management and memory storage with ErgoSum')
  .version('0.6.0');

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

// Context Repository Commands (Git-like version control)
program
  .command('init')
  .description('Initialize a new context repository')
  .option('-n, --name <name>', 'Repository name')
  .option('-d, --description <description>', 'Repository description')
  .option('-r, --remote <url>', 'Remote repository URL')
  .action((options) => {
    initRepo({
      name: options.name,
      description: options.description,
      remote: options.remote
    });
  });

program
  .command('add <files...>')
  .description('Add files to staging area')
  .option('-A, --all', 'Add all files')
  .option('-f, --force', 'Force add ignored files')
  .option('--dry-run', 'Show what would be added')
  .option('-i, --interactive', 'Interactive mode')
  .option('--as-type <type>', 'Specify content type')
  .option('--embeddings', 'Generate embeddings')
  .action((files, options) => {
    addFiles(files, {
      all: options.all,
      force: options.force,
      dry_run: options.dryRun,
      interactive: options.interactive,
      as_type: options.asType,
      generate_embeddings: options.embeddings
    });
  });

program
  .command('commit')
  .description('Commit staged changes')
  .option('-m, --message <message>', 'Commit message')
  .option('-a, --all', 'Automatically stage all modified files')
  .option('--amend', 'Amend the previous commit')
  .option('--ai-message', 'Generate commit message with AI')
  .option('--author <author>', 'Override author')
  .action((options) => {
    commitChanges({
      message: options.message,
      all: options.all,
      amend: options.amend,
      ai_message: options.aiMessage,
      author: options.author
    });
  });

program
  .command('repo-status')
  .alias('rs')
  .description('Show repository status')
  .option('-s, --short', 'Short format')
  .option('--porcelain', 'Porcelain format for scripts')
  .option('--ignored', 'Show ignored files')
  .action((options) => {
    showStatus({
      short: options.short,
      porcelain: options.porcelain,
      ignored: options.ignored
    });
  });

program
  .command('push')
  .description('Push commits to remote repository')
  .option('-f, --force', 'Force push even if remote is ahead')
  .action((options) => {
    pushRepository({
      force: options.force
    });
  });

// List repositories
program
  .command('list-repos')
  .alias('lr')
  .description('List all repositories for current user')
  .action(async () => {
    try {
      const { ErgoSumAPIClient } = await import('./lib/api-client.js');
      const client = new ErgoSumAPIClient();
      const repos = await client.getRepositories();
      console.log(JSON.stringify({
        success: true,
        repositories: repos,
        count: repos.length
      }, null, 2));
    } catch (error) {
      console.log(JSON.stringify({
        error: true,
        message: error.message,
        action: 'list-repos'
      }, null, 2));
      process.exit(1);
    }
  });

program
  .command('fetch')
  .description('Fetch remote repository data without updating working directory')
  .option('--since <timestamp>', 'Only fetch data since this timestamp')
  .action((options) => {
    fetchRepository({
      since: options.since
    });
  });

program
  .command('pull')
  .description('Fetch and merge remote changes into current branch')
  .option('-f, --force', 'Force pull even if there are conflicts')
  .action((options) => {
    pullRepository({
      force: options.force
    });
  });

program
  .command('clone <repository-id>')
  .description('Clone a remote repository to local directory')
  .option('--name <name>', 'Override repository name')
  .option('--path <path>', 'Destination path (default: current directory)')
  .action((repositoryId, options) => {
    cloneRepository(repositoryId, {
      name: options.name,
      path: options.path
    });
  });

// Claude integration help
program
  .command('help-claude')
  .description('Show Claude integration guide')
  .action(() => {
    console.log(JSON.stringify({
      "integration": "ergosum-cli",
      "description": "Git-like CLI for AI context management and memory storage with ErgoSum",
      "memory_commands": [
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
        }
      ],
      "context_repository_commands": [
        {
          "command": "ergosum init",
          "description": "Initialize context repository (like git init)",
          "example": "ergosum init --name 'project-context'"
        },
        {
          "command": "ergosum add <files>",
          "description": "Stage files for commit",
          "example": "ergosum add . --embeddings"
        },
        {
          "command": "ergosum commit -m <message>",
          "description": "Commit staged changes",
          "example": "ergosum commit -m 'Update documentation'"
        },
        {
          "command": "ergosum repo-status",
          "description": "Show repository status",
          "example": "ergosum repo-status --short"
        },
        {
          "command": "ergosum push",
          "description": "Push commits to remote repository",
          "example": "ergosum push"
        }
      ],
      "auth_commands": [
        {
          "command": "ergosum login",
          "description": "Authenticate with ErgoSum",
          "example": "ergosum login"
        },
        {
          "command": "ergosum status",
          "description": "Check authentication status",
          "example": "ergosum status"
        }
      ],
      "workflow": {
        "setup": "ergosum login && ergosum init --name 'my-context'",
        "daily_use": [
          "ergosum add *.md --embeddings",
          "ergosum commit -m 'Updated project docs'",
          "ergosum search 'authentication flow'"
        ]
      },
      "features": [
        "Git-like version control for AI context",
        "Automatic content deduplication", 
        "Vector embeddings for semantic search",
        "AI-optimized content organization",
        "JSON output perfect for LLM consumption"
      ],
      "usage": "All commands output JSON for easy parsing. Perfect for AI assistants to manage context and search information.",
      "setup": "Run 'ergosum login' first to authenticate, then 'ergosum init' to start a context repository"
    }, null, 2));
    process.exit(0);
  });

program.parse(process.argv);