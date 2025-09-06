import axios, { AxiosInstance } from 'axios';
import { Memory, MemoryStoreRequest, MemoryListResponse, SearchOptions } from '../types';
import { config } from './config';

export class ErgoSumAPIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.get('apiUrl'),
      timeout: 30000,
    });

    // Add request interceptor to include auth headers
    this.client.interceptors.request.use(
      (axiosConfig) => {
        try {
          const authHeaders = config.getAuthHeaders();
          Object.assign(axiosConfig.headers, authHeaders);
        } catch (error) {
          // Auth not required for some endpoints
        }
        return axiosConfig;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          throw new Error('Authentication failed. Please run "ergosum auth login" to reauthenticate.');
        }
        if (error.response?.status === 403) {
          throw new Error('Access denied. Please check your permissions.');
        }
        if (error.response?.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        throw error;
      }
    );
  }

  // Authentication
  async exchangeSupabaseToken(accessToken: string, refreshToken?: string): Promise<{
    token: string;
    user: any;
  }> {
    const response = await this.client.post('/auth/supabase', {
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return response.data;
  }

  // Memory operations
  async storeMemory(request: MemoryStoreRequest): Promise<{ id: string; message: string }> {
    const response = await this.client.post('/memory/store', request);
    return response.data;
  }

  async listMemories(options: SearchOptions = {}): Promise<MemoryListResponse> {
    const params = new URLSearchParams();
    
    if (options.query) params.append('query', options.query);
    if (options.tags?.length) params.append('tags', options.tags.join(','));
    if (options.type) params.append('type', options.type);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    
    const response = await this.client.get(`/memory/list?${params}`);
    return response.data;
  }

  async searchMemories(query: string, options: Omit<SearchOptions, 'query'> = {}): Promise<MemoryListResponse> {
    return this.listMemories({ ...options, query });
  }

  async getMemory(id: string): Promise<Memory> {
    const response = await this.client.get(`/memory/${id}`);
    return response.data;
  }

  async deleteMemory(id: string): Promise<void> {
    await this.client.delete(`/memory/${id}`);
  }

  // Utility methods
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async getProfile(): Promise<any> {
    const response = await this.client.get('/auth/profile');
    return response.data;
  }
}

export const apiClient = new ErgoSumAPIClient();