import { spawn } from 'child_process';
import * as http from 'http';
import * as url from 'url';
import inquirer from 'inquirer';
import chalk from 'chalk';
import open from 'open';
import { config } from '../lib/config.js';
import { apiClient } from '../lib/api-client.js';

export async function login() {
  try {
    await startOAuthFlow();
  } catch (error) {
    console.error(chalk.red('Authentication failed:'), (error as Error).message);
    process.exit(1);
  }
}

async function startOAuthFlow(openBrowser: boolean = true): Promise<void> {
  console.log(chalk.blue('🔐 Starting ErgoSum authentication...'));
  console.log();
  
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
  console.log(chalk.yellow('⚠️  Desktop app integration coming soon'));
  console.log(chalk.gray('Falling back to browser authentication...\n'));
  
  await authenticateWithBrowser();
}

async function authenticateWithBrowser(openBrowser: boolean = true): Promise<void> {
  console.log(chalk.blue('🔗 Authenticating with browser...'));
  
  // Generate a unique session ID for this authentication attempt
  const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const authUrl = `https://ergosum.cc/auth/cli?session=${sessionId}`;
  
  if (openBrowser) {
    try {
      await open(authUrl);
      console.log(chalk.gray('Browser opened, waiting for authentication...'));
    } catch (error) {
      console.log(chalk.yellow('Could not open browser automatically'));
      console.log(chalk.blue(`Please open: ${authUrl}`));
    }
  }

  console.log(chalk.gray('Waiting for authentication to complete in browser...'));
  console.log(chalk.gray('This will automatically continue once you sign in.'));
  
  // Poll for authentication completion
  const token = await pollForAuthToken(sessionId);
  
  console.log(chalk.green('✅ Authenticated successfully!'));
  await authenticateWithToken(token);
}

async function pollForAuthToken(sessionId: string): Promise<string> {
  const maxAttempts = 120; // 2 minutes with 1 second intervals
  const apiUrl = config.get('apiUrl');
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`${apiUrl}/auth/cli-session/${sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json() as { token?: string; error?: string };
        if (result.token) {
          return result.token;
        }
      }
      
      // Wait 1 second before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      // Continue polling on network errors
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error('Authentication timeout (2 minutes)');
}

async function authenticateWithManualToken(): Promise<void> {
  console.log(chalk.blue('Paste your token (input will be hidden):'));
  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Token:',
      mask: '', // No mask character - completely invisible
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Token is required';
        }
        if (input.length < 50) {
          return 'Token seems too short (should be a JWT token)';
        }
        return true;
      },
    },
  ]);

  await authenticateWithToken(token.trim());
}

export async function whoami() {
  try {
    if (!config.isAuthenticated()) {
      console.log(JSON.stringify({
        error: true,
        message: "Not authenticated. Run 'ergosum login' first.",
        authenticated: false
      }));
      process.exit(1);
    }

    const response = await apiClient.getProfile();
    const userId = config.get('userId');
    const organizationId = config.get('organizationId');
    
    console.log(JSON.stringify({
      success: true,
      user: {
        id: userId,
        email: response.email,
        name: response.name,
        organizationId: organizationId,
      }
    }, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({
      error: true,
      message: (error as Error).message,
      authenticated: false
    }));
    process.exit(1);
  }
}

export async function status() {
  try {
    if (!config.isAuthenticated()) {
      console.log(JSON.stringify({
        authenticated: false,
        message: "Not authenticated. Run 'ergosum login' first."
      }));
      process.exit(1);
    }

    const response = await apiClient.getProfile();
    
    console.log(JSON.stringify({
      authenticated: true,
      user: {
        email: response.email,
        name: response.name,
        id: config.get('userId'),
        organizationId: config.get('organizationId'),
      },
      api: "connected"
    }, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({
      authenticated: false,
      error: (error as Error).message,
      message: "Authentication expired. Run 'ergosum login' to re-authenticate."
    }));
    process.exit(1);
  }
}

async function authenticateWithToken(supabaseToken: string): Promise<void> {
  try {
    // Parse Supabase JWT to validate format and extract user info
    const tokenParts = supabaseToken.split('.');
    if (tokenParts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    
    // Check if token is expired
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error('Token has expired');
    }

    // Extract user information from Supabase JWT
    const userId = payload.sub || payload.user_id;
    const email = payload.email || payload.user_metadata?.email;
    const name = payload.user_metadata?.full_name || payload.user_metadata?.name;
    
    if (!userId) {
      throw new Error('Invalid token: missing user ID');
    }

    // Exchange Supabase token for ErgoSum gateway token
    console.log(chalk.blue('🔄 Exchanging token with ErgoSum API...'));
    
    const apiUrl = config.get('apiUrl');
    const response = await fetch(`${apiUrl}/auth/supabase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: supabaseToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as { token: string; user: any };
    const gatewayToken = result.token;
    const user = result.user;

    // Store the gateway token (not the Supabase token)
    config.set('token', gatewayToken);
    config.set('userId', user.id);
    config.set('organizationId', user.organizationId);
    
    console.log(chalk.gray(`Welcome back, ${email || name || user.name}!`));
    console.log(chalk.green('🎉 ErgoSum CLI is ready to use!\n'));
    
    // Exit cleanly
    process.exit(0);

  } catch (error) {
    throw new Error(`Authentication failed: ${(error as Error).message}`);
  }
}