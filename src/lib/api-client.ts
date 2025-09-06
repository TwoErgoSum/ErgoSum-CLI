import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Memory, MemoryStoreRequest, MemoryListResponse, SearchOptions } from '../types';
import { config } from './config';
import { logger } from './logger';
import { ErrorHandler, ErgoSumError } from './errors';
import { validateMemory, validateSearchOptions, sanitizeInput } from './validation';
import { cacheManager, CacheManager } from './cache';

export class ErgoSumAPIClient {
  private client: AxiosInstance;
  private maxRetries: number = 3;

  constructor() {
    this.client = axios.create({
      baseURL: config.get('apiUrl'),
      timeout: 30000,
      headers: {
        'User-Agent': 'ErgoSum-CLI/0.1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth headers and logging
    this.client.interceptors.request.use(
      (axiosConfig) => {
        const startTime = Date.now();
        (axiosConfig as any).metadata = { startTime };

        try {
          const authHeaders = config.getAuthHeaders();
          Object.assign(axiosConfig.headers, authHeaders);
          logger.debug(`Authenticated request to ${axiosConfig.method?.toUpperCase()} ${axiosConfig.url}`);
        } catch (error) {
          logger.debug(`Unauthenticated request to ${axiosConfig.method?.toUpperCase()} ${axiosConfig.url}`);
        }

        logger.http(`→ ${axiosConfig.method?.toUpperCase()} ${axiosConfig.url}`);
        return axiosConfig;
      },
      (error) => {
        logger.error('Request interceptor error:', error);
        return Promise.reject(ErrorHandler.handle(error, 'request_interceptor'));
      }
    );

    // Add response interceptor for error handling and logging
    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - ((response.config as any).metadata?.startTime || 0);
        logger.logRequest(
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          response.status,
          duration
        );
        return response;
      },
      (error) => {
        const duration = Date.now() - ((error.config as any)?.metadata?.startTime || 0);
        if (error.response) {
          logger.logRequest(
            error.config?.method?.toUpperCase() || 'GET',
            error.config?.url || '',
            error.response.status,
            duration
          );
        }
        
        throw ErrorHandler.handle(error, 'api_client');
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
    try {
      // Validate and sanitize input
      const validatedRequest = validateMemory({
        ...request,
        content: sanitizeInput(request.content),
        title: request.title ? sanitizeInput(request.title) : undefined,
      }) as MemoryStoreRequest;

      logger.debug('Storing memory', { 
        contentLength: validatedRequest.content.length,
        title: validatedRequest.title,
        type: validatedRequest.type,
        tagsCount: validatedRequest.tags?.length || 0,
      });

      const response = await this.withRetry(() => 
        this.client.post('/memory/store', validatedRequest)
      );

      logger.info(`Memory stored successfully with ID: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to store memory', { error, request });
      throw ErrorHandler.handle(error, 'store_memory');
    }
  }

  async listMemories(options: SearchOptions = {}): Promise<MemoryListResponse> {
    const cacheKey = CacheManager.searchKey('list', options);
    
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const params = new URLSearchParams();
        
        if (options.query) params.append('query', options.query);
        if (options.tags?.length) params.append('tags', options.tags.join(','));
        if (options.type) params.append('type', options.type);
        if (options.limit) params.append('limit', options.limit.toString());
        if (options.offset) params.append('offset', options.offset.toString());
        
        const response = await this.client.get(`/memory/list?${params}`);
        return response.data;
      },
      60 // Cache for 1 minute
    );
  }

  async searchMemories(query: string, options: Omit<SearchOptions, 'query'> = {}): Promise<MemoryListResponse> {
    return this.listMemories({ ...options, query });
  }

  async getMemory(id: string): Promise<Memory> {
    const cacheKey = CacheManager.memoryKey(id);
    
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const response = await this.client.get(`/memory/${id}`);
        return response.data;
      },
      300 // Cache for 5 minutes
    );
  }

  async deleteMemory(id: string): Promise<void> {
    await this.client.delete(`/memory/${id}`);
    
    // Invalidate cache
    const cacheKey = CacheManager.memoryKey(id);
    cacheManager.delete(cacheKey);
    
    // Also clear list caches as they may contain this memory
    cacheManager.clear(); // Simple approach - clear all for now
    logger.debug(`Invalidated cache for memory ${id}`);
  }

  // Utility methods
  async healthCheck(): Promise<boolean> {
    const cacheKey = CacheManager.healthKey();
    
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        try {
          const response = await this.client.get('/health');
          return response.status === 200;
        } catch {
          return false;
        }
      },
      30 // Cache health check for 30 seconds
    );
  }

  async getProfile(): Promise<any> {
    const response = await this.client.get('/auth/profile');
    return response.data;
  }

  // Retry mechanism with exponential backoff
  private async withRetry<T>(
    operation: () => Promise<T>,
    attemptCount: number = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const ergoError = error instanceof ErgoSumError ? error : ErrorHandler.handle(error);
      
      if (attemptCount < this.maxRetries && ErrorHandler.shouldRetry(ergoError, attemptCount)) {
        const delay = ErrorHandler.getRetryDelay(attemptCount);
        logger.debug(`Retrying operation in ${delay}ms (attempt ${attemptCount + 1}/${this.maxRetries})`);
        
        await this.delay(delay);
        return this.withRetry(operation, attemptCount + 1);
      }
      
      throw ergoError;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const apiClient = new ErgoSumAPIClient();