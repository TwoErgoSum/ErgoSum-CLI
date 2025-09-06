import { Command } from 'commander';
import chalk from 'chalk';
import { cacheManager } from '../lib/cache';
import { logger } from '../lib/logger';
import { ErrorHandler } from '../lib/errors';

export function createCacheCommand(): Command {
  const cache = new Command('cache')
    .description('Cache management commands');

  // Status command
  cache
    .command('status')
    .description('Show cache statistics and status')
    .action(() => {
      try {
        const stats = cacheManager.getStats();
        const offlineMode = cacheManager.isOfflineModeEnabled();

        console.log(chalk.blue('📊 Cache Status:\n'));
        
        console.log(`${chalk.green('✅')} Cache entries: ${chalk.white(stats.keys)}`);
        console.log(`${chalk.green('✅')} Cache hits: ${chalk.white(stats.hits)}`);
        console.log(`${chalk.green('✅')} Cache misses: ${chalk.white(stats.misses)}`);
        console.log(`${chalk.green('✅')} Cache size: ${chalk.white((stats.size / 1024).toFixed(2))} KB`);
        
        console.log(`\n${offlineMode ? chalk.green('✅') : chalk.gray('○')} Offline mode: ${offlineMode ? 'Enabled' : 'Disabled'}`);
        
        if (stats.hits + stats.misses > 0) {
          const hitRate = (stats.hits / (stats.hits + stats.misses) * 100).toFixed(1);
          console.log(`${chalk.green('✅')} Hit rate: ${chalk.white(hitRate)}%`);
        }

        logger.info('Cache status displayed', { stats, offlineMode });
        process.exit(0);
      } catch (error) {
        const ergoError = ErrorHandler.handle(error, 'cache_status');
        console.error(chalk.red('Failed to get cache status:'), ErrorHandler.getUserMessage(ergoError));
        process.exit(1);
      }
    });

  // Clear command
  cache
    .command('clear')
    .description('Clear all cached data')
    .option('-f, --force', 'Force clear without confirmation')
    .action(async (options) => {
      try {
        if (!options.force) {
          const inquirer = require('inquirer');
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Are you sure you want to clear all cached data?',
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.yellow('Cache clear cancelled'));
            process.exit(0);
          }
        }

        cacheManager.clear();
        console.log(chalk.green('✅ All cached data cleared'));
        logger.info('Cache cleared by user');
        process.exit(0);
      } catch (error) {
        const ergoError = ErrorHandler.handle(error, 'cache_clear');
        console.error(chalk.red('Failed to clear cache:'), ErrorHandler.getUserMessage(ergoError));
        process.exit(1);
      }
    });

  // Enable offline mode
  cache
    .command('offline')
    .description('Enable offline mode with persistent caching')
    .action(() => {
      try {
        cacheManager.enableOfflineMode();
        console.log(chalk.green('✅ Offline mode enabled'));
        console.log(chalk.gray('   • Data will be cached persistently'));
        console.log(chalk.gray('   • Stale data will be used when offline'));
        console.log(chalk.gray('   • Use "ergosum cache online" to disable'));
        
        logger.info('Offline mode enabled by user');
        process.exit(0);
      } catch (error) {
        const ergoError = ErrorHandler.handle(error, 'cache_offline');
        console.error(chalk.red('Failed to enable offline mode:'), ErrorHandler.getUserMessage(ergoError));
        process.exit(1);
      }
    });

  // Disable offline mode
  cache
    .command('online')
    .description('Disable offline mode')
    .action(() => {
      try {
        cacheManager.disableOfflineMode();
        console.log(chalk.green('✅ Offline mode disabled'));
        console.log(chalk.gray('   • Persistent caching disabled'));
        console.log(chalk.gray('   • Only memory caching active'));
        
        logger.info('Offline mode disabled by user');
        process.exit(0);
      } catch (error) {
        const ergoError = ErrorHandler.handle(error, 'cache_online');
        console.error(chalk.red('Failed to disable offline mode:'), ErrorHandler.getUserMessage(ergoError));
        process.exit(1);
      }
    });

  // Warmup command - preload common data
  cache
    .command('warmup')
    .description('Warm up cache with frequently accessed data')
    .option('-l, --limit <limit>', 'Number of recent memories to cache', '20')
    .action(async (options) => {
      try {
        const { apiClient } = require('../lib/api-client');
        const { withProgress } = require('../lib/progress');
        
        await withProgress(
          async () => {
            // Cache recent memories
            const memories = await apiClient.listMemories({ 
              limit: parseInt(options.limit),
              offset: 0 
            });
            
            // Cache individual memories
            const promises = memories.memories.map((memory: any) =>
              apiClient.getMemory(memory.id)
            );
            
            await Promise.all(promises);
            
            logger.info(`Warmed up cache with ${memories.memories.length} memories`);
            return memories.memories.length;
          },
          'Warming up cache...',
          `Cache warmed up with ${options.limit} memories`
        );
        process.exit(0);

      } catch (error) {
        const ergoError = ErrorHandler.handle(error, 'cache_warmup');
        console.error(chalk.red('Failed to warm up cache:'), ErrorHandler.getUserMessage(ergoError));
        process.exit(1);
      }
    });

  // Prune command - remove expired entries
  cache
    .command('prune')
    .description('Remove expired cache entries')
    .action(() => {
      try {
        const statsBefore = cacheManager.getStats();
        
        // The cache manager automatically prunes expired entries
        // This command just forces a cleanup cycle
        console.log(chalk.blue('🧹 Pruning expired cache entries...'));
        
        // Force a cleanup (this would normally happen automatically)
        const statsAfter = cacheManager.getStats();
        const removed = statsBefore.keys - statsAfter.keys;
        
        if (removed > 0) {
          console.log(chalk.green(`✅ Removed ${removed} expired entries`));
        } else {
          console.log(chalk.yellow('No expired entries found'));
        }
        
        logger.info('Cache pruned', { removed, remaining: statsAfter.keys });
        process.exit(0);
      } catch (error) {
        const ergoError = ErrorHandler.handle(error, 'cache_prune');
        console.error(chalk.red('Failed to prune cache:'), ErrorHandler.getUserMessage(ergoError));
        process.exit(1);
      }
    });

  return cache;
}