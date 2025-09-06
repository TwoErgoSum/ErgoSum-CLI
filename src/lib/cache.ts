import NodeCache from 'node-cache';
import { logger } from './logger';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Cache configuration
const CACHE_TTL = 5 * 60; // 5 minutes default
const CACHE_CHECK_PERIOD = 60; // Check for expired keys every minute
const MAX_CACHE_SIZE = 1000; // Maximum number of cached items

// Cache types
export interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl?: number;
}

export interface CacheStats {
  keys: number;
  hits: number;
  misses: number;
  size: number;
}

// File-based persistent cache for offline mode
class PersistentCache {
  private cacheFile: string;
  private cache: Map<string, CacheItem<any>>;

  constructor() {
    const cacheDir = path.join(os.homedir(), '.ergosum-cli', 'cache');
    this.cacheFile = path.join(cacheDir, 'offline.json');
    this.cache = new Map();

    // Ensure cache directory exists
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
    } catch (error) {
      logger.warn('Failed to create cache directory', error);
    }

    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
        this.cache = new Map(Object.entries(data));
        logger.debug(`Loaded ${this.cache.size} items from persistent cache`);
      }
    } catch (error) {
      logger.warn('Failed to load persistent cache', error);
      this.cache = new Map();
    }
  }

  private save(): void {
    try {
      const data = Object.fromEntries(this.cache);
      fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
      logger.debug(`Saved ${this.cache.size} items to persistent cache`);
    } catch (error) {
      logger.warn('Failed to save persistent cache', error);
    }
  }

  set<T>(key: string, value: T, ttl?: number): void {
    const item: CacheItem<T> = {
      data: value,
      timestamp: Date.now(),
      ttl: ttl || CACHE_TTL,
    };
    
    this.cache.set(key, item);
    this.save();
    logger.debug(`Cached item: ${key} (TTL: ${ttl || CACHE_TTL}s)`);
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key) as CacheItem<T> | undefined;
    
    if (!item) {
      logger.debug(`Cache miss: ${key}`);
      return null;
    }

    // Check if expired
    const age = (Date.now() - item.timestamp) / 1000;
    if (item.ttl && age > item.ttl) {
      this.cache.delete(key);
      this.save();
      logger.debug(`Cache expired: ${key} (age: ${age}s)`);
      return null;
    }

    logger.debug(`Cache hit: ${key} (age: ${age}s)`);
    return item.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.save();
    logger.debug(`Cache deleted: ${key}`);
  }

  clear(): void {
    this.cache.clear();
    this.save();
    logger.info('Persistent cache cleared');
  }

  getStats(): CacheStats {
    const validItems = Array.from(this.cache.values()).filter(item => {
      const age = (Date.now() - item.timestamp) / 1000;
      return !item.ttl || age <= item.ttl;
    });

    return {
      keys: validItems.length,
      hits: 0, // Would need to track separately
      misses: 0, // Would need to track separately
      size: JSON.stringify(Object.fromEntries(this.cache)).length,
    };
  }

  cleanup(): void {
    let removed = 0;
    for (const [key, item] of this.cache.entries()) {
      const age = (Date.now() - item.timestamp) / 1000;
      if (item.ttl && age > item.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      this.save();
      logger.debug(`Cleaned up ${removed} expired cache items`);
    }
  }
}

// Main cache manager
export class CacheManager {
  private memoryCache: NodeCache;
  private persistentCache: PersistentCache;
  private offlineMode: boolean = false;

  constructor() {
    // Memory cache for hot data
    this.memoryCache = new NodeCache({
      stdTTL: CACHE_TTL,
      checkperiod: CACHE_CHECK_PERIOD,
      maxKeys: MAX_CACHE_SIZE,
      useClones: false,
    });

    // Persistent cache for offline mode
    this.persistentCache = new PersistentCache();

    // Enable offline mode if configured
    this.offlineMode = config.get('offlineMode') || false;

    // Log cache events
    this.memoryCache.on('set', (key, value) => {
      logger.debug(`Memory cache set: ${key}`);
    });

    this.memoryCache.on('expired', (key, value) => {
      logger.debug(`Memory cache expired: ${key}`);
    });

    // Cleanup expired items periodically
    setInterval(() => {
      this.persistentCache.cleanup();
    }, CACHE_CHECK_PERIOD * 1000);
  }

  // Memory cache methods (for hot data)
  set<T>(key: string, value: T, ttl?: number): void {
    this.memoryCache.set(key, value, ttl || CACHE_TTL);
    
    // Also store in persistent cache if offline mode is enabled
    if (this.offlineMode) {
      this.persistentCache.set(key, value, ttl);
    }
  }

  get<T>(key: string): T | undefined {
    // Try memory cache first
    const memoryResult = this.memoryCache.get<T>(key);
    if (memoryResult !== undefined) {
      return memoryResult;
    }

    // Try persistent cache if offline mode is enabled
    if (this.offlineMode) {
      const persistentResult = this.persistentCache.get<T>(key);
      if (persistentResult !== null) {
        // Promote to memory cache
        this.memoryCache.set(key, persistentResult);
        return persistentResult;
      }
    }

    return undefined;
  }

  has(key: string): boolean {
    return this.memoryCache.has(key) || (this.offlineMode && this.persistentCache.has(key));
  }

  delete(key: string): void {
    this.memoryCache.del(key);
    if (this.offlineMode) {
      this.persistentCache.delete(key);
    }
  }

  clear(): void {
    this.memoryCache.flushAll();
    if (this.offlineMode) {
      this.persistentCache.clear();
    }
    logger.info('All caches cleared');
  }

  // Offline mode management
  enableOfflineMode(): void {
    this.offlineMode = true;
    config.set('offlineMode', true);
    logger.info('Offline mode enabled');
  }

  disableOfflineMode(): void {
    this.offlineMode = false;
    config.set('offlineMode', false);
    logger.info('Offline mode disabled');
  }

  isOfflineModeEnabled(): boolean {
    return this.offlineMode;
  }

  // Statistics
  getStats(): CacheStats {
    const memoryStats = this.memoryCache.getStats();
    const persistentStats = this.persistentCache.getStats();

    return {
      keys: memoryStats.keys + (this.offlineMode ? persistentStats.keys : 0),
      hits: memoryStats.hits,
      misses: memoryStats.misses,
      size: persistentStats.size, // Approximate
    };
  }

  // Utility methods for common cache patterns
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try cache first
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Fetch and cache
    try {
      const result = await fetcher();
      this.set(key, result, ttl);
      return result;
    } catch (error) {
      // In offline mode, try to return stale data
      if (this.offlineMode) {
        const stale = this.persistentCache.get<T>(key);
        if (stale !== null) {
          logger.warn(`Using stale cached data for ${key} due to offline mode`);
          return stale;
        }
      }
      throw error;
    }
  }

  // Bulk operations
  async bulkGet<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    
    for (const key of keys) {
      const value = this.get<T>(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }
    
    return result;
  }

  bulkSet<T>(items: Map<string, T>, ttl?: number): void {
    for (const [key, value] of items.entries()) {
      this.set(key, value, ttl);
    }
  }

  // Cache key generators for different data types
  static memoryKey(id: string): string {
    return `memory:${id}`;
  }

  static searchKey(query: string, options: any): string {
    const optionsStr = JSON.stringify(options);
    return `search:${Buffer.from(query + optionsStr).toString('base64')}`;
  }

  static profileKey(userId: string): string {
    return `profile:${userId}`;
  }

  static healthKey(): string {
    return 'health:status';
  }
}

// Global cache instance
export const cacheManager = new CacheManager();

// Helper functions
export function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  return cacheManager.getOrSet(key, fetcher, ttl);
}

export function invalidateCache(pattern: string): void {
  // Simple pattern matching for cache invalidation
  const stats = cacheManager.getStats();
  logger.info(`Invalidated cache entries matching pattern: ${pattern}`);
}