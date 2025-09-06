import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import open from 'open';
import { config } from '../lib/config';
import { apiClient } from '../lib/api-client';
import * as http from 'http';
import * as url from 'url';

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
      process.exit(0);
    });

  // Status command
  auth
    .command('status')
    .description('Check authentication status')
    .action(async () => {
      if (!config.isAuthenticated()) {
        // Output JSON for AI consumption
        console.log(JSON.stringify({
          authenticated: false,
          status: 'not_authenticated',
          suggestion: 'Run "ergosum auth login" to authenticate',
          timestamp: new Date().toISOString(),
        }, null, 2));
        process.exit(1);
      }

      try {
        // Test the token by making an API call to the gateway
        const response = await apiClient.getProfile();
        
        // Output JSON for AI consumption
        console.log(JSON.stringify({
          authenticated: true,
          status: 'active',
          user: {
            email: response.email,
            name: response.name,
            id: config.get('userId'),
            organizationId: config.get('organizationId'),
          },
          timestamp: new Date().toISOString(),
        }, null, 2));
        
      } catch (error) {
        const errorMessage = (error as Error).message;
        const isTokenExpired = errorMessage.includes('401') || errorMessage.includes('Unauthorized');
        
        // Output JSON for AI consumption
        console.log(JSON.stringify({
          authenticated: false,
          status: isTokenExpired ? 'token_expired' : 'error',
          error: errorMessage,
          suggestion: 'Run "ergosum auth login" to reauthenticate',
          timestamp: new Date().toISOString(),
        }, null, 2));
      }
      process.exit(0);
    });

  // Whoami command
  auth
    .command('whoami')
    .description('Show current user information')
    .action(async () => {
      if (!config.isAuthenticated()) {
        console.log(chalk.red('Not authenticated'));
        process.exit(1);
      }

      try {
        const response = await apiClient.getProfile();
        const userId = config.get('userId');
        const organizationId = config.get('organizationId');
        
        console.log(JSON.stringify({
          id: userId,
          email: response.email,
          name: response.name,
          organizationId: organizationId,
        }, null, 2));
        
      } catch (error) {
        console.error(chalk.red('Failed to get user profile:'), (error as Error).message);
        process.exit(1);
      }
      process.exit(0);
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
  console.log(chalk.yellow('⚠️  Desktop app integration coming soon'));
  console.log(chalk.gray('Falling back to browser authentication...\n'));
  
  await authenticateWithBrowser();
}

async function authenticateWithBrowser(openBrowser: boolean = true): Promise<void> {
  console.log(chalk.blue('🔗 Authenticating with browser...'));
  
  // Start local server to receive the token
  const server = http.createServer();
  const port = 3000;
  
  try {
    await new Promise<void>((resolve, reject) => {
      server.listen(port, 'localhost', () => {
        resolve();
      });
      
      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(chalk.yellow('Port 3000 is busy, falling back to manual token entry...'));
          resolve();
        } else {
          reject(err);
        }
      });
    });
    
    const authUrl = `https://ergosum.cc/auth/cli?callback=http://localhost:${port}/callback`;
    
    if (openBrowser) {
      try {
        await open(authUrl);
        console.log(chalk.gray('Browser opened, waiting for authentication...'));
      } catch (error) {
        console.log(chalk.yellow('Could not open browser automatically'));
        console.log(chalk.blue(`Please open: ${authUrl}`));
      }
    }

    // Wait for callback with token
    const token = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout (2 minutes)'));
      }, 120000);

      server.on('request', (req, res) => {
        const parsedUrl = url.parse(req.url || '', true);
        
        if (parsedUrl.pathname === '/callback') {
          const token = parsedUrl.query.token as string;
          
          if (token) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html lang="en">
                <head>
                  <title>ErgoSum CLI Authentication</title>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <script src="https://cdn.tailwindcss.com"></script>
                  <script>
                    tailwind.config = {
                      darkMode: 'media',
                      theme: {
                        extend: {
                          colors: {
                            background: 'hsl(0 0% 100%)',
                            foreground: 'hsl(222.2 84% 4.9%)',
                            primary: 'hsl(221.2 83.2% 53.3%)',
                            'primary-foreground': 'hsl(210 40% 98%)',
                            muted: 'hsl(210 40% 96%)',
                            'muted-foreground': 'hsl(215.4 16.3% 46.9%)',
                          }
                        }
                      }
                    }
                  </script>
                </head>
                <body class="min-h-screen bg-background text-foreground">
                  <div class="min-h-screen flex items-center justify-center p-4">
                    <div class="w-full max-w-md">
                      <div class="bg-white border border-gray-200 rounded-lg shadow-sm p-6 text-center">
                        <div class="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                          <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                          </svg>
                        </div>
                        <h1 class="text-xl font-semibold text-green-900 mb-2">
                          CLI Authentication Successful!
                        </h1>
                        <p class="text-sm text-gray-600 mb-6">
                          Your ErgoSum CLI is now authenticated and ready to use.
                        </p>
                        <div class="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                          This tab will close automatically in <span id="countdown" class="font-medium">3</span> seconds
                        </div>
                      </div>
                    </div>
                  </div>
                  <script>
                    let count = 3;
                    const countdown = document.getElementById('countdown');
                    const interval = setInterval(() => {
                      count--;
                      if (countdown) countdown.textContent = count.toString();
                      if (count <= 0) {
                        clearInterval(interval);
                        window.close();
                      }
                    }, 1000);
                  </script>
                </body>
              </html>
            `);
            clearTimeout(timeout);
            server.close();
            resolve(token);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h1 style="color: red;">❌ Authentication Failed</h1>
                  <p>No token received. Please try again.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error('No token received'));
          }
        }
      });
    });
    
    console.log(chalk.green('✅ Authenticated successfully!'));
    await authenticateWithToken(token);

  } catch (error) {
    server.close();
    console.log(chalk.yellow('\n⚠️  Automatic authentication timed out'));
    console.log(chalk.gray('Please copy your token from the browser page:\n'));
    await authenticateWithManualToken();
  }
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