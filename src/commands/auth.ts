import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import open from 'open';
import { config } from '../lib/config';
import { apiClient } from '../lib/api-client';

export function createAuthCommand(): Command {
  const auth = new Command('auth')
    .description('Authentication commands');

  // Login command
  auth
    .command('login')
    .description('Authenticate with ErgoSum using Supabase OAuth')
    .option('--token <token>', 'Provide access token directly')
    .option('--no-browser', 'Don\'t open browser automatically')
    .action(async (options) => {
      try {
        if (options.token) {
          // Direct token authentication
          await authenticateWithToken(options.token);
        } else {
          // OAuth flow
          await startOAuthFlow(!options.noBrowser);
        }
      } catch (error) {
        console.error(chalk.red('Authentication failed:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Logout command
  auth
    .command('logout')
    .description('Remove stored authentication credentials')
    .action(() => {
      config.delete('token');
      config.delete('userId');
      config.delete('organizationId');
      console.log(chalk.green('✅ Successfully logged out'));
    });

  // Status command
  auth
    .command('status')
    .description('Check authentication status')
    .action(async () => {
      if (!config.isAuthenticated()) {
        console.log(chalk.red('❌ Not authenticated'));
        console.log(chalk.gray('Run "ergosum auth login" to authenticate'));
        return;
      }

      try {
        const profile = await apiClient.getProfile();
        console.log(chalk.green('✅ Authenticated'));
        console.log(chalk.gray(`User: ${profile.email || profile.id}`));
        console.log(chalk.gray(`Organization: ${config.get('organizationId')}`));
      } catch (error) {
        console.log(chalk.yellow('⚠️  Token may be expired'));
        console.log(chalk.gray('Run "ergosum auth login" to reauthenticate'));
      }
    });

  // Whoami command
  auth
    .command('whoami')
    .description('Show current user information')
    .action(async () => {
      if (!config.isAuthenticated()) {
        console.log(chalk.red('Not authenticated'));
        return;
      }

      try {
        const profile = await apiClient.getProfile();
        console.log(JSON.stringify(profile, null, 2));
      } catch (error) {
        console.error(chalk.red('Failed to get user profile:'), (error as Error).message);
      }
    });

  return auth;
}

async function startOAuthFlow(openBrowser: boolean = true): Promise<void> {
  console.log(chalk.blue('🔐 Starting ErgoSum authentication...'));
  console.log();
  
  // For now, we'll use a simplified flow
  // In the future, this could integrate with the desktop app or web OAuth
  const { method } = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: 'How would you like to authenticate?',
      choices: [
        { name: '🖥️  Use ErgoSum Desktop app (recommended)', value: 'desktop' },
        { name: '🌐 Use web browser OAuth', value: 'browser' },
        { name: '🔑 Enter token manually', value: 'token' },
      ],
    },
  ]);

  switch (method) {
    case 'desktop':
      await authenticateWithDesktop();
      break;
    case 'browser':
      await authenticateWithBrowser(openBrowser);
      break;
    case 'token':
      await authenticateWithManualToken();
      break;
  }
}

async function authenticateWithDesktop(): Promise<void> {
  console.log(chalk.blue('📱 Attempting to connect with ErgoSum Desktop app...'));
  
  // Check if desktop app is running and can provide a token
  // This is a placeholder for desktop app integration
  console.log(chalk.yellow('⚠️  Desktop app integration not yet implemented'));
  console.log(chalk.gray('For now, please use the web browser method or manual token'));
  
  await authenticateWithBrowser();
}

async function authenticateWithBrowser(openBrowser: boolean = true): Promise<void> {
  const authUrl = 'https://ergosum.cc/auth/cli';
  
  console.log(chalk.blue('🌐 Opening browser for CLI authentication...'));
  console.log(chalk.gray(`URL: ${authUrl}`));
  console.log();
  
  if (openBrowser) {
    try {
      await open(authUrl);
    } catch (error) {
      console.log(chalk.yellow('Could not open browser automatically'));
      console.log(chalk.gray('Please open the URL above manually'));
    }
  }

  console.log(chalk.blue('After completing authentication in your browser:'));
  
  await authenticateWithManualToken();
}

async function authenticateWithManualToken(): Promise<void> {
  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Enter your ErgoSum API token:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Token is required';
        }
        if (input.length < 10) {
          return 'Token seems too short';
        }
        return true;
      },
    },
  ]);

  await authenticateWithToken(token.trim());
}

async function authenticateWithToken(token: string): Promise<void> {
  console.log(chalk.blue('🔍 Validating token...'));
  
  // Store token temporarily to test it
  const originalToken = config.get('token');
  config.set('token', token);

  try {
    const profile = await apiClient.getProfile();
    
    // Store user information
    config.set('userId', profile.id);
    if (profile.organizationId) {
      config.set('organizationId', profile.organizationId);
    }

    console.log(chalk.green('✅ Authentication successful!'));
    console.log(chalk.gray(`Welcome, ${profile.email || profile.name || 'user'}!`));
    
    // Check API connectivity
    const isHealthy = await apiClient.healthCheck();
    if (isHealthy) {
      console.log(chalk.green('🔗 Connected to ErgoSum API'));
    } else {
      console.log(chalk.yellow('⚠️  API connection test failed, but authentication succeeded'));
    }

  } catch (error) {
    // Restore original token on failure
    if (originalToken) {
      config.set('token', originalToken);
    } else {
      config.delete('token');
    }
    
    throw new Error(`Invalid token: ${(error as Error).message}`);
  }
}