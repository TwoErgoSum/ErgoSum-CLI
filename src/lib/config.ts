import Configstore from 'configstore';
import { CLIConfig } from '../types';

export class ConfigManager {
  private config: Configstore;

  constructor() {
    this.config = new Configstore('ergosum-cli', {
      apiUrl: 'https://api.ergosum.cc/api/v1',
      defaultTags: ['cli'],
      integrations: {
        claudeCode: false,
        codex: false,
        gemini: false,
      },
    });
  }

  get<K extends keyof CLIConfig>(key: K): CLIConfig[K] {
    return this.config.get(key);
  }

  set<K extends keyof CLIConfig>(key: K, value: CLIConfig[K]): void {
    this.config.set(key, value);
  }

  getAll(): CLIConfig {
    return this.config.all;
  }

  clear(): void {
    this.config.clear();
  }

  has(key: keyof CLIConfig): boolean {
    return this.config.has(key);
  }

  delete(key: keyof CLIConfig): void {
    this.config.delete(key);
  }

  isAuthenticated(): boolean {
    return !!(this.config.get('token') && this.config.get('userId'));
  }

  getAuthHeaders(): Record<string, string> {
    const token = this.config.get('token');
    if (!token) {
      throw new Error('No authentication token found. Please run "ergosum auth login" first.');
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }
}

export const config = new ConfigManager();