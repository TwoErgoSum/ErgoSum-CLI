import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Memory, MemoryStoreRequest, MemoryListResponse, SearchOptions, ContextRepo, ContextCommit, ContentObject, ContextBranch } from '../types';
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
        'User-Agent': 'ErgoSum-CLI/0.4.6',
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

  // Repository operations
  async createRepository(repo: Omit<ContextRepo, 'id' | 'created_at' | 'updated_at'>): Promise<ContextRepo> {
    try {
      logger.debug('Creating repository', { name: repo.name, owner: repo.owner_id });
      
      const response = await this.withRetry(() => 
        this.client.post('/repositories', repo)
      );
      
      logger.info(`Repository created successfully: ${response.data.repository.name} (${response.data.repository.id})`);
      return response.data.repository;
    } catch (error) {
      logger.error('Failed to create repository', { error, repo });
      throw ErrorHandler.handle(error, 'create_repository');
    }
  }

  async getRepositories(): Promise<ContextRepo[]> {
    try {
      const response = await this.client.get('/repositories');
      return response.data.repositories;
    } catch (error) {
      logger.error('Failed to get repositories', { error });
      throw ErrorHandler.handle(error, 'get_repositories');
    }
  }

  async getRepository(id: string): Promise<ContextRepo> {
    try {
      const response = await this.client.get(`/repositories/${id}`);
      return response.data.repository;
    } catch (error) {
      logger.error('Failed to get repository', { error, id });
      throw ErrorHandler.handle(error, 'get_repository');
    }
  }

  async pushCommits(repoId: string, commits: ContextCommit[]): Promise<void> {
    try {
      logger.debug('Pushing commits', { repoId, commitCount: commits.length });
      
      // Sort commits in dependency order (parents first)
      const sortedCommits = this.sortCommitsByDependencies(commits);
      
      await this.withRetry(() => 
        this.client.post(`/repositories/${repoId}/commits`, { commits: sortedCommits })
      );
      
      logger.info(`Successfully pushed ${commits.length} commits to repository ${repoId}`);
    } catch (error) {
      logger.error('Failed to push commits', { error, repoId, commitCount: commits.length });
      throw ErrorHandler.handle(error, 'push_commits');
    }
  }

  private sortCommitsByDependencies(commits: ContextCommit[]): ContextCommit[] {
    const commitMap = new Map(commits.map(c => [c.id, c]));
    const visited = new Set<string>();
    const sorted: ContextCommit[] = [];

    function visit(commitId: string) {
      if (visited.has(commitId)) return;
      visited.add(commitId);

      const commit = commitMap.get(commitId);
      if (!commit) return;

      // Visit parent first if it exists and is in our commit set
      if (commit.parent_id && commitMap.has(commit.parent_id)) {
        visit(commit.parent_id);
      }

      sorted.push(commit);
    }

    // Process all commits
    for (const commit of commits) {
      visit(commit.id);
    }

    return sorted;
  }

  async pushObjects(repoId: string, objects: ContentObject[]): Promise<void> {
    try {
      logger.debug('Pushing objects', { repoId, objectCount: objects.length });
      
      await this.withRetry(() => 
        this.client.post(`/repositories/${repoId}/objects`, { objects })
      );
      
      logger.info(`Successfully pushed ${objects.length} objects to repository ${repoId}`);
    } catch (error) {
      logger.error('Failed to push objects', { error, repoId, objectCount: objects.length });
      throw ErrorHandler.handle(error, 'push_objects');
    }
  }

  // Fetch operations
  async fetchCommits(repoId: string, since?: string): Promise<ContextCommit[]> {
    try {
      let url = `/repositories/${repoId}/commits?fetch=true`;
      if (since) {
        url += `&since=${encodeURIComponent(since)}`;
      }
      
      const response = await this.client.get(url);
      return response.data.commits || [];
    } catch (error) {
      logger.error('Failed to fetch commits', { error, repoId });
      throw ErrorHandler.handle(error, 'fetch_commits');
    }
  }

  async fetchObjects(repoId: string, since?: string): Promise<ContentObject[]> {
    try {
      let url = `/repositories/${repoId}/objects?fetch=true`;
      if (since) {
        url += `&since=${encodeURIComponent(since)}`;
      }
      
      const response = await this.client.get(url);
      return response.data.objects || [];
    } catch (error) {
      logger.error('Failed to fetch objects', { error, repoId });
      throw ErrorHandler.handle(error, 'fetch_objects');
    }
  }

  async fetchBranches(repoId: string): Promise<ContextBranch[]> {
    try {
      const response = await this.client.get(`/repositories/${repoId}/branches`);
      return response.data.branches || [];
    } catch (error) {
      logger.error('Failed to fetch branches', { error, repoId });
      throw ErrorHandler.handle(error, 'fetch_branches');
    }
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
    const response = await this.client.get('/debug/me');
    return response.data.user;
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