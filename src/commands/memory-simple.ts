import { apiClient } from '../lib/api-client';
import { config } from '../lib/config';

export async function searchMemories(query: string, options: any) {
  try {
    if (!config.isAuthenticated()) {
      console.log(JSON.stringify({
        error: true,
        message: "Not authenticated. Run 'ergosum login' first.",
        authenticated: false
      }));
      process.exit(1);
    }

    const limit = parseInt(options.limit || '10');
    const result = await apiClient.listMemories({
      query,
      limit,
      offset: 0,
    });

    console.log(JSON.stringify({
      success: true,
      query,
      total: result.total,
      count: result.memories.length,
      memories: result.memories
    }, null, 2));

    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({
      error: true,
      message: (error as Error).message,
      query
    }));
    process.exit(1);
  }
}

export async function storeMemory(content: string, options: any) {
  try {
    if (!config.isAuthenticated()) {
      console.log(JSON.stringify({
        error: true,
        message: "Not authenticated. Run 'ergosum login' first.",
        authenticated: false
      }));
      process.exit(1);
    }

    const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [];
    const defaultTags = config.get('defaultTags') || [];
    const allTags = [...new Set([...tags, ...defaultTags])];

    const result = await apiClient.storeMemory({
      content,
      title: options.title,
      type: 'TEXT',
      tags: allTags,
      metadata: {
        source: 'cli',
        timestamp: new Date().toISOString(),
      },
    });

    console.log(JSON.stringify({
      success: true,
      action: 'stored',
      memory: {
        id: result.id,
        title: options.title,
        content,
        tags: allTags,
        length: content.length
      }
    }, null, 2));

    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({
      error: true,
      message: (error as Error).message,
      content
    }));
    process.exit(1);
  }
}

export async function getMemory(id: string) {
  try {
    if (!config.isAuthenticated()) {
      console.log(JSON.stringify({
        error: true,
        message: "Not authenticated. Run 'ergosum login' first.",
        authenticated: false
      }));
      process.exit(1);
    }

    const memory = await apiClient.getMemory(id);

    console.log(JSON.stringify({
      success: true,
      memory
    }, null, 2));

    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({
      error: true,
      message: (error as Error).message,
      id
    }));
    process.exit(1);
  }
}