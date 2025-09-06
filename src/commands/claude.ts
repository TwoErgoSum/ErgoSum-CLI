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
        console.log(chalk.gray('  ergosum claude install-wrapper  # For seamless integration'));

      } catch (error) {
        console.error(chalk.red('Setup failed:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Install automatic wrapper - NEW FEATURE!
  claude
    .command('install-wrapper')
    .description('Install automatic ErgoSum integration for Claude Code')
    .option('--force', 'Overwrite existing wrapper')
    .action(async (options) => {
      try {
        console.log(chalk.blue('🔧 Installing seamless ErgoSum → Claude Code integration...\n'));

        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        // Create wrapper script location
        const binDir = path.join(os.homedir(), '.local', 'bin');
        const wrapperPath = path.join(binDir, 'claude');
        const originalClaudePath = '/usr/local/bin/claude'; // Common installation path

        // Check if wrapper already exists
        if (fs.existsSync(wrapperPath) && !options.force) {
          const { overwrite } = await require('inquirer').prompt([
            {
              type: 'confirm',
              name: 'overwrite',
              message: 'Claude wrapper already exists. Overwrite?',
              default: false,
            },
          ]);

          if (!overwrite) {
            console.log(chalk.yellow('Installation cancelled'));
            return;
          }
        }

        // Ensure bin directory exists
        if (!fs.existsSync(binDir)) {
          fs.mkdirSync(binDir, { recursive: true });
          console.log(chalk.green(`✅ Created ${binDir}`));
        }

        // Find original Claude installation
        let originalPath = originalClaudePath;
        try {
          const { execSync } = require('child_process');
          const whichResult = execSync('which claude', { encoding: 'utf8' }).trim();
          if (whichResult && whichResult !== wrapperPath) {
            originalPath = whichResult;
          }
        } catch {
          // Use default path
        }

        // Create the magical wrapper script
        const wrapperScript = `#!/bin/bash
# ErgoSum-Enhanced Claude Code Wrapper
# Automatically injects relevant context from your ErgoSum memories

# Colors for pretty output
BLUE='\\033[0;34m'
GRAY='\\033[0;90m'
NC='\\033[0m' # No Color

# Check if this is an 'ask' command that would benefit from context
if [[ "$1" == "ask" ]] && [[ -n "$2" ]]; then
    echo -e "\${BLUE}🧠 Enhancing Claude with your ErgoSum memories...\${NC}" >&2
    
    # Use ErgoSum to handle the ask with automatic context injection
    ergosum claude ask "\${@:2}"
    exit $?
fi

# For non-ask commands, pass through to original Claude
if [[ -f "${originalPath}" ]]; then
    "${originalPath}" "$@"
else
    echo "Error: Original Claude Code CLI not found at ${originalPath}" >&2
    echo "Please ensure Claude Code is properly installed" >&2
    exit 1
fi
`;

        // Write the wrapper
        fs.writeFileSync(wrapperPath, wrapperScript);
        fs.chmodSync(wrapperPath, '755');

        console.log(chalk.green('✅ ErgoSum Claude wrapper installed successfully!\n'));

        // Check PATH configuration
        const currentPath = process.env.PATH || '';
        const hasLocalBin = currentPath.includes(`${os.homedir()}/.local/bin`);

        if (!hasLocalBin) {
          console.log(chalk.yellow('⚠️  Setup required - Add to your shell profile:\n'));
          console.log(chalk.white(`export PATH="$HOME/.local/bin:$PATH"`));
          console.log(chalk.gray('\nAdd this line to:'));
          console.log(chalk.gray('  • ~/.bashrc (for Bash)'));
          console.log(chalk.gray('  • ~/.zshrc (for Zsh)'));
          console.log(chalk.gray('  • ~/.config/fish/config.fish (for Fish)\n'));
          console.log(chalk.gray('Then restart your terminal or run: source ~/.bashrc\n'));
        }

        console.log(chalk.blue('🎉 Now you can use Claude Code normally:\n'));
        console.log(chalk.white('claude ask "How do I optimize this React component?"'));
        console.log(chalk.gray('↳ Automatically includes your React optimization memories!\n'));
        console.log(chalk.white('claude ask "What are PostgreSQL best practices?"'));
        console.log(chalk.gray('↳ Automatically includes your database knowledge!\n'));

        console.log(chalk.green('🚀 Your Claude Code is now supercharged with ErgoSum!'));

      } catch (error) {
        console.error(chalk.red('Installation failed:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Uninstall wrapper
  claude
    .command('uninstall-wrapper')
    .description('Remove ErgoSum Claude wrapper (restore original)')
    .action(() => {
      try {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const wrapperPath = path.join(os.homedir(), '.local', 'bin', 'claude');
        
        if (fs.existsSync(wrapperPath)) {
          fs.unlinkSync(wrapperPath);
          console.log(chalk.green('✅ ErgoSum Claude wrapper removed'));
          console.log(chalk.gray('Your original Claude Code CLI is now active again'));
        } else {
          console.log(chalk.yellow('No ErgoSum wrapper found'));
        }
      } catch (error) {
        console.error(chalk.red('Failed to remove wrapper:'), (error as Error).message);
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