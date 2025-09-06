import { spawn } from 'child_process';
import * as http from 'http';
import * as url from 'url';
import open from 'open';
import { config } from '../lib/config';
import { apiClient } from '../lib/api-client';

export async function login() {
  try {
    console.log(JSON.stringify({
      status: 'starting',
      message: 'Opening browser for authentication...'
    }));

    // Start local server for callback
    const server = http.createServer();
    const port = 3000;

    server.listen(port, () => {
      const authUrl = `https://ergosum.cc/auth/cli?callback=http://localhost:${port}/callback`;
      open(authUrl);
    });

    // Wait for callback with token
    const token = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 120000);

      server.on('request', (req, res) => {
        const parsedUrl = url.parse(req.url || '', true);
        
        if (parsedUrl.pathname === '/callback') {
          const token = parsedUrl.query.token as string;
          
          if (token) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>✅ Success!</h1><p>You can close this tab.</p><script>setTimeout(() => window.close(), 2000);</script>');
            clearTimeout(timeout);
            server.close();
            resolve(token);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>❌ Error</h1><p>No token received.</p>');
            server.close();
            reject(new Error('No token received'));
          }
        }
      });
    });
    
    // Exchange token
    await authenticateWithToken(token);

  } catch (error) {
    console.log(JSON.stringify({
      error: true,
      message: (error as Error).message
    }));
    process.exit(1);
  }
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
    // Parse token to get user info
    const tokenParts = supabaseToken.split('.');
    if (tokenParts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    const userId = payload.sub;
    const email = payload.email;

    if (!userId) {
      throw new Error('Invalid token: missing user ID');
    }

    // Exchange Supabase token for ErgoSum gateway token
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
    
    console.log(JSON.stringify({
      success: true,
      message: 'Authentication successful',
      user: {
        email: user.email,
        name: user.name
      }
    }));
    
    process.exit(0);
  } catch (error) {
    throw new Error(`Authentication failed: ${(error as Error).message}`);
  }
}