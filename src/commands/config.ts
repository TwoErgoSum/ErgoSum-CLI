import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { config } from '../lib/config';
import { CLIConfig } from '../types';

export function createConfigCommand(): Command {
  const configCmd = new Command('config')
    .description('Configuration management');

  // Set command
  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      try {
        // Type conversion based on key
        let parsedValue: any = value;
        
        if (key === 'defaultTags') {
          parsedValue = value.split(',').map(t => t.trim());
        } else if (key.includes('.')) {
          // Handle nested keys like integrations.claudeCode
          const [parent, child] = key.split('.');
          const currentParent = config.get(parent as keyof CLIConfig);
          if (typeof currentParent === 'object' && currentParent !== null) {
            parsedValue = { ...currentParent, [child]: value === 'true' };
            key = parent;
          }
        } else if (value === 'true' || value === 'false') {
          parsedValue = value === 'true';
        }

        config.set(key as keyof CLIConfig, parsedValue);
        console.log(chalk.green(`✅ Set ${key} = ${JSON.stringify(parsedValue)}`));
        process.exit(0);
        
      } catch (error) {
        console.error(chalk.red('Failed to set configuration:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Get command
  configCmd
    .command('get [key]')
    .description('Get configuration value(s)')
    .option('--json', 'Output as JSON')
    .action((key: string | undefined, options) => {
      try {
        if (key) {
          const value = config.get(key as keyof CLIConfig);
          if (options.json) {
            console.log(JSON.stringify({ [key]: value }, null, 2));
          } else {
            console.log(`${key} = ${JSON.stringify(value)}`);
          }
        } else {
          const allConfig = config.getAll();
          if (options.json) {
            console.log(JSON.stringify(allConfig, null, 2));
          } else {
            console.log(chalk.blue('Current configuration:\n'));
            Object.entries(allConfig).forEach(([k, v]) => {
              console.log(`${chalk.cyan(k)} = ${JSON.stringify(v)}`);
            });
          }
        }
      } catch (error) {
        console.error(chalk.red('Failed to get configuration:'), (error as Error).message);
        process.exit(1);
      }
      process.exit(0);
    });

  // Unset command
  configCmd
    .command('unset <key>')
    .description('Remove a configuration value')
    .action((key: string) => {
      try {
        config.delete(key as keyof CLIConfig);
        console.log(chalk.green(`✅ Removed ${key}`));
        process.exit(0);
      } catch (error) {
        console.error(chalk.red('Failed to unset configuration:'), (error as Error).message);
        process.exit(1);
      }
    });

  // List command
  configCmd
    .command('list')
    .alias('ls')
    .description('List all configuration')
    .action(() => {
      const allConfig = config.getAll();
      console.log(chalk.blue('ErgoSum CLI Configuration:\n'));
      
      console.log(`${chalk.cyan('API URL:')} ${allConfig.apiUrl}`);
      console.log(`${chalk.cyan('Authenticated:')} ${config.isAuthenticated() ? chalk.green('Yes') : chalk.red('No')}`);
      if (allConfig.userId) {
        console.log(`${chalk.cyan('User ID:')} ${allConfig.userId}`);
      }
      if (allConfig.organizationId) {
        console.log(`${chalk.cyan('Organization ID:')} ${allConfig.organizationId}`);
      }
      console.log(`${chalk.cyan('Default Tags:')} ${allConfig.defaultTags.join(', ') || 'none'}`);
      
      console.log(chalk.blue('\nIntegrations:'));
      Object.entries(allConfig.integrations).forEach(([tool, enabled]) => {
        const status = enabled ? chalk.green('Enabled') : chalk.gray('Disabled');
        console.log(`  ${chalk.cyan(tool)}: ${status}`);
      });
      process.exit(0);
    });

  // Setup command - interactive configuration
  configCmd
    .command('setup')
    .description('Interactive configuration setup')
    .action(async () => {
      try {
        console.log(chalk.blue('🔧 ErgoSum CLI Setup\n'));

        const currentConfig = config.getAll();

        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'apiUrl',
            message: 'ErgoSum API URL:',
            default: currentConfig.apiUrl,
            validate: (input: string) => {
              try {
                new URL(input);
                return true;
              } catch {
                return 'Please enter a valid URL';
              }
            },
          },
          {
            type: 'input',
            name: 'defaultTags',
            message: 'Default tags for new memories (comma-separated):',
            default: currentConfig.defaultTags.join(', '),
            filter: (input: string) => input.split(',').map(t => t.trim()).filter(t => t.length > 0),
          },
          {
            type: 'checkbox',
            name: 'integrations',
            message: 'Enable AI tool integrations:',
            choices: [
              { name: 'Claude Code', value: 'claudeCode', checked: currentConfig.integrations.claudeCode },
              { name: 'GitHub Codex', value: 'codex', checked: currentConfig.integrations.codex },
              { name: 'Google Gemini CLI', value: 'gemini', checked: currentConfig.integrations.gemini },
            ],
          },
        ]);

        // Update configuration
        config.set('apiUrl', answers.apiUrl);
        config.set('defaultTags', answers.defaultTags);
        
        const integrationSettings = {
          claudeCode: answers.integrations.includes('claudeCode'),
          codex: answers.integrations.includes('codex'),
          gemini: answers.integrations.includes('gemini'),
        };
        config.set('integrations', integrationSettings);

        console.log(chalk.green('\n✅ Configuration updated successfully!'));

        // Show what's enabled
        const enabledIntegrations = Object.entries(integrationSettings)
          .filter(([_, enabled]) => enabled)
          .map(([tool, _]) => tool);

        if (enabledIntegrations.length > 0) {
          console.log(chalk.blue(`\nEnabled integrations: ${enabledIntegrations.join(', ')}`));
        }

        if (!config.isAuthenticated()) {
          console.log(chalk.yellow('\nTo start using ErgoSum CLI, authenticate with:'));
          console.log(chalk.gray('  ergosum auth login'));
        }
        process.exit(0);

      } catch (error) {
        console.error(chalk.red('Setup failed:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Reset command
  configCmd
    .command('reset')
    .description('Reset all configuration to defaults')
    .option('--yes', 'Skip confirmation')
    .action(async (options) => {
      try {
        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Are you sure you want to reset all configuration? This will remove your authentication.',
              default: false,
            },
          ]);

          if (!confirm) {
            console.log('Cancelled');
            process.exit(0);
          }
        }

        config.clear();
        console.log(chalk.green('✅ Configuration reset to defaults'));
        console.log(chalk.gray('Run "ergosum config setup" to reconfigure'));
        process.exit(0);

      } catch (error) {
        console.error(chalk.red('Failed to reset configuration:'), (error as Error).message);
        process.exit(1);
      }
    });

  return configCmd;
}