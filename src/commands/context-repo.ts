import * as path from 'path';
import * as fs from 'fs/promises';
import chalk from 'chalk';
import { RepositoryManager } from '../lib/repo-manager.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import {
  InitOptions,
  AddOptions,
  CommitOptions,
  StatusOptions,
  IndexEntry,
  ContextCommit,
  ContentObject,
  ContextTree,
  TreeEntry
} from '../types/index.js';

// Initialize a new context repository
export async function initRepo(options: InitOptions = {}) {
  try {
    const cwd = process.cwd();
    const repoManager = new RepositoryManager(cwd);

    // Check if already in a repository
    if (await repoManager.isRepository()) {
      console.log(JSON.stringify({
        error: true,
        message: "Repository already exists in this directory",
        path: cwd
      }));
      process.exit(1);
    }

    // Get user info from config
    if (!config.isAuthenticated()) {
      console.log(JSON.stringify({
        error: true,
        message: "Not authenticated. Run 'ergosum login' first.",
        authenticated: false
      }));
      process.exit(1);
    }

    // Initialize repository
    const repo = await repoManager.initRepository(options);
    
    // Set owner from current user
    const userId = config.get('userId');
    repo.owner_id = userId || '';
    await repoManager.saveConfig(repo);

    console.log(JSON.stringify({
      success: true,
      action: 'init',
      repository: {
        id: repo.id,
        name: repo.name,
        path: cwd,
        branch: repo.default_branch
      },
      message: `Initialized empty ErgoSum repository in ${cwd}`
    }, null, 2));

    process.exit(0);
  } catch (error) {
    logger.error('Failed to initialize repository', { error });
    console.log(JSON.stringify({
      error: true,
      message: (error as Error).message
    }));
    process.exit(1);
  }
}

// Add files to staging area
export async function addFiles(patterns: string[], options: AddOptions = {}) {
  try {
    const repoPath = await findRepository();
    const repoManager = new RepositoryManager(repoPath);

    // Get current index
    const index = await repoManager.getIndex();
    const newIndex: IndexEntry[] = [...index];

    let addedFiles: string[] = [];

    if (options.all || patterns.includes('.')) {
      // Add all files
      const allFiles = await repoManager.listFiles();
      
      for (const filePath of allFiles) {
        try {
          const contentObj = await repoManager.readFile(filePath);
          
          // Save content object
          await repoManager.saveObject(contentObj);
          
          // Add to index
          const indexEntry: IndexEntry = {
            path: filePath,
            object_id: contentObj.id,
            mode: '100644', // Regular file
            size: contentObj.size,
            modified_time: new Date(),
            staged: true
          };

          // Remove existing entry for this path
          const existingIndex = newIndex.findIndex(entry => entry.path === filePath);
          if (existingIndex !== -1) {
            newIndex[existingIndex] = indexEntry;
          } else {
            newIndex.push(indexEntry);
          }

          addedFiles.push(filePath);
        } catch (error) {
          logger.warn(`Failed to add file: ${filePath}`, { error });
        }
      }
    } else {
      // Add specific patterns/files
      for (const pattern of patterns) {
        const files = await getFilesFromPattern(repoManager, pattern);
        
        for (const filePath of files) {
          try {
            const contentObj = await repoManager.readFile(filePath);
            
            // Save content object
            await repoManager.saveObject(contentObj);
            
            // Add to index
            const indexEntry: IndexEntry = {
              path: filePath,
              object_id: contentObj.id,
              mode: '100644',
              size: contentObj.size,
              modified_time: new Date(),
              staged: true
            };

            const existingIndex = newIndex.findIndex(entry => entry.path === filePath);
            if (existingIndex !== -1) {
              newIndex[existingIndex] = indexEntry;
            } else {
              newIndex.push(indexEntry);
            }

            addedFiles.push(filePath);
          } catch (error) {
            logger.warn(`Failed to add file: ${filePath}`, { error });
          }
        }
      }
    }

    // Save updated index
    await repoManager.saveIndex(newIndex);

    console.log(JSON.stringify({
      success: true,
      action: 'add',
      files: addedFiles,
      staged_count: addedFiles.length,
      message: `Added ${addedFiles.length} files to staging area`
    }, null, 2));

    process.exit(0);
  } catch (error) {
    logger.error('Failed to add files', { error });
    console.log(JSON.stringify({
      error: true,
      message: (error as Error).message
    }));
    process.exit(1);
  }
}

// Commit staged changes
export async function commitChanges(options: CommitOptions = {}) {
  try {
    const repoPath = await findRepository();
    const repoManager = new RepositoryManager(repoPath);

    // Get staged files
    const index = await repoManager.getIndex();
    const stagedFiles = index.filter(entry => entry.staged);

    if (stagedFiles.length === 0) {
      console.log(JSON.stringify({
        error: true,
        message: "No changes staged for commit. Use 'ergosum add' to stage files."
      }));
      process.exit(1);
    }

    // Get commit message
    let message = options.message;
    if (!message) {
      if (options.ai_message) {
        message = await generateAICommitMessage(stagedFiles);
      } else {
        message = `Add ${stagedFiles.length} files`;
      }
    }

    // Create tree from staged files
    const tree = await createTreeFromIndex(repoManager, stagedFiles);
    const treeId = await repoManager.saveTree(tree);

    // Get parent commit
    const currentBranch = await repoManager.getHead();
    const branch = await repoManager.getBranch(currentBranch);
    const parentId = branch?.commit_id || undefined;

    // Create commit
    const commit: ContextCommit = {
      id: generateCommitId(),
      repo_id: (await repoManager.getConfig()).id,
      message,
      parent_id: parentId,
      tree_id: treeId,
      author: options.author || 'ErgoSum CLI User',
      timestamp: new Date(),
      metadata: {
        files_changed: stagedFiles.length,
        additions: stagedFiles.reduce((sum, file) => sum + file.size, 0),
        deletions: 0 // TODO: Calculate deletions
      }
    };

    // Save commit
    await repoManager.saveCommit(commit);

    // Update branch reference
    if (branch) {
      branch.commit_id = commit.id;
      branch.updated_at = new Date();
      await repoManager.saveBranch(branch);
    }

    // Clear staging area
    const unstagedIndex = index.map(entry => ({ ...entry, staged: false }));
    await repoManager.saveIndex(unstagedIndex);

    console.log(JSON.stringify({
      success: true,
      action: 'commit',
      commit: {
        id: commit.id,
        message: commit.message,
        author: commit.author,
        files_changed: commit.metadata.files_changed,
        timestamp: commit.timestamp
      }
    }, null, 2));

    process.exit(0);
  } catch (error) {
    logger.error('Failed to commit changes', { error });
    console.log(JSON.stringify({
      error: true,
      message: (error as Error).message
    }));
    process.exit(1);
  }
}

// Show repository status
export async function showStatus(options: StatusOptions = {}) {
  try {
    const repoPath = await findRepository();
    const repoManager = new RepositoryManager(repoPath);

    const config = await repoManager.getConfig();
    const currentBranch = await repoManager.getHead();
    const index = await repoManager.getIndex();
    
    const stagedFiles = index.filter(entry => entry.staged);
    const unstagedFiles = index.filter(entry => !entry.staged);
    
    // Get untracked files
    const allFiles = await repoManager.listFiles();
    const trackedFiles = new Set(index.map(entry => entry.path));
    const untrackedFiles = allFiles.filter(file => !trackedFiles.has(file));

    if (options.short || options.porcelain) {
      // Short format
      const status = {
        branch: currentBranch,
        staged: stagedFiles.length,
        unstaged: unstagedFiles.length,
        untracked: untrackedFiles.length
      };
      console.log(JSON.stringify(status));
    } else {
      // Detailed format
      console.log(JSON.stringify({
        success: true,
        repository: {
          name: config.name,
          path: repoPath,
          branch: currentBranch
        },
        status: {
          staged: stagedFiles.map(f => ({
            path: f.path,
            size: f.size,
            modified: f.modified_time
          })),
          unstaged: unstagedFiles.map(f => ({
            path: f.path,
            size: f.size,
            modified: f.modified_time
          })),
          untracked: untrackedFiles
        },
        summary: {
          staged_files: stagedFiles.length,
          unstaged_files: unstagedFiles.length,
          untracked_files: untrackedFiles.length
        }
      }, null, 2));
    }

    process.exit(0);
  } catch (error) {
    logger.error('Failed to get status', { error });
    console.log(JSON.stringify({
      error: true,
      message: (error as Error).message
    }));
    process.exit(1);
  }
}

// Utility functions
async function findRepository(): Promise<string> {
  const repoManager = new RepositoryManager();
  const repoPath = await repoManager.findRepository();
  
  if (!repoPath) {
    throw new Error('Not in a context repository. Run \'ergosum init\' to initialize one.');
  }
  
  return repoPath;
}

async function getFilesFromPattern(repoManager: RepositoryManager, pattern: string): Promise<string[]> {
  if (pattern === '.') {
    return await repoManager.listFiles();
  }
  
  const allFiles = await repoManager.listFiles();
  
  if (pattern.includes('*')) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return allFiles.filter(file => regex.test(file));
  }
  
  // Check if it's a specific file
  try {
    const fullPath = path.resolve(pattern);
    await fs.access(fullPath);
    return [path.relative(process.cwd(), fullPath)];
  } catch {
    return [];
  }
}

async function createTreeFromIndex(repoManager: RepositoryManager, entries: IndexEntry[]): Promise<ContextTree> {
  const treeEntries: TreeEntry[] = entries.map(entry => ({
    mode: entry.mode,
    name: entry.path,
    object_id: entry.object_id,
    type: 'file'
  }));

  const tree: ContextTree = {
    id: generateTreeId(treeEntries),
    entries: treeEntries
  };

  return tree;
}

function generateCommitId(): string {
  return require('crypto').randomBytes(20).toString('hex');
}

function generateTreeId(entries: TreeEntry[]): string {
  const content = entries.map(e => `${e.mode} ${e.name} ${e.object_id}`).join('\n');
  return require('crypto').createHash('sha1').update(content).digest('hex');
}

async function generateAICommitMessage(stagedFiles: IndexEntry[]): Promise<string> {
  // TODO: Implement AI commit message generation
  // For now, return a basic message
  const fileTypes = [...new Set(stagedFiles.map(f => path.extname(f.path)))];
  const primaryType = fileTypes[0] || '';
  
  if (fileTypes.includes('.md')) {
    return 'Update documentation';
  } else if (fileTypes.includes('.js') || fileTypes.includes('.ts')) {
    return 'Update code';
  } else {
    return `Add ${stagedFiles.length} files`;
  }
}

// Push local repository to remote
export async function pushRepository(options: { force?: boolean } = {}) {
  try {
    const cwd = process.cwd();
    const repoManager = new RepositoryManager(cwd);

    // Check if we're in a repository
    if (!(await repoManager.isRepository())) {
      console.log(JSON.stringify({
        error: true,
        message: "Not in a repository. Run 'ergosum init' first.",
        path: cwd
      }));
      process.exit(1);
    }

    // Check authentication
    if (!config.isAuthenticated()) {
      console.log(JSON.stringify({
        error: true,
        message: "Not authenticated. Run 'ergosum login' first.",
        authenticated: false
      }));
      process.exit(1);
    }

    const apiClient = await import('../lib/api-client.js');
    
    // Check if repository exists remotely
    let remoteRepoId = await repoManager.getRemoteRepositoryId();
    
    if (!remoteRepoId) {
      // Create remote repository
      const localConfig = await repoManager.getConfig();
      const remoteRepo = await apiClient.apiClient.createRepository({
        name: localConfig.name,
        description: localConfig.description,
        owner_id: localConfig.owner_id,
        default_branch: localConfig.default_branch,
        settings: localConfig.settings
      });
      
      remoteRepoId = remoteRepo.id;
      await repoManager.setRemoteRepository(remoteRepoId);
      
      console.log(JSON.stringify({
        success: true,
        action: 'create_remote',
        repository: {
          id: remoteRepoId,
          name: remoteRepo.name
        }
      }));
    }

    // Get unpushed commits and objects
    const unpushedCommits = await repoManager.getUnpushedCommits();
    const unpushedObjects = await repoManager.getUnpushedObjects();

    if (unpushedCommits.length === 0 && unpushedObjects.length === 0) {
      console.log(JSON.stringify({
        success: true,
        action: 'push',
        message: 'Everything up-to-date',
        commits_pushed: 0,
        objects_pushed: 0
      }));
      return;
    }

    // Push objects first
    if (unpushedObjects.length > 0) {
      await apiClient.apiClient.pushObjects(remoteRepoId, unpushedObjects);
      await repoManager.markObjectsPushed(unpushedObjects.map(o => o.id));
    }

    // Push commits
    if (unpushedCommits.length > 0) {
      await apiClient.apiClient.pushCommits(remoteRepoId, unpushedCommits);
      await repoManager.markCommitsPushed(unpushedCommits.map(c => c.id));
    }

    console.log(JSON.stringify({
      success: true,
      action: 'push',
      repository: {
        id: remoteRepoId,
        local_path: cwd
      },
      commits_pushed: unpushedCommits.length,
      objects_pushed: unpushedObjects.length,
      message: `Successfully pushed ${unpushedCommits.length} commits and ${unpushedObjects.length} objects`
    }));

  } catch (error) {
    console.log(JSON.stringify({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      action: 'push'
    }));
    process.exit(1);
  }
}

// Fetch remote repository data without updating working directory
export async function fetchRepository(options: { since?: string } = {}) {
  try {
    const cwd = process.cwd();
    const repoManager = new RepositoryManager(cwd);

    // Check if we're in a repository
    if (!(await repoManager.isRepository())) {
      console.log(JSON.stringify({
        error: true,
        message: "Not in a repository. Run 'ergosum init' first.",
        path: cwd
      }));
      process.exit(1);
    }

    // Check authentication
    if (!config.isAuthenticated()) {
      console.log(JSON.stringify({
        error: true,
        message: "Not authenticated. Run 'ergosum login' first.",
        authenticated: false
      }));
      process.exit(1);
    }

    const apiClient = await import('../lib/api-client.js');
    
    // Fetch remote data
    const result = await repoManager.fetchFromRemote(apiClient.apiClient);

    console.log(JSON.stringify({
      success: true,
      action: 'fetch',
      data: {
        commits_fetched: result.commits.length,
        objects_fetched: result.objects.length,
        branches_fetched: result.branches.length,
        commits: result.commits.map(c => ({
          id: c.id,
          message: c.message,
          author: c.author,
          timestamp: c.timestamp
        }))
      },
      message: `Successfully fetched ${result.commits.length} commits, ${result.objects.length} objects, and ${result.branches.length} branches`
    }));

  } catch (error) {
    console.log(JSON.stringify({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      action: 'fetch'
    }));
    process.exit(1);
  }
}

// Pull remote changes into current branch
export async function pullRepository(options: { force?: boolean } = {}) {
  try {
    const cwd = process.cwd();
    const repoManager = new RepositoryManager(cwd);

    // Check if we're in a repository
    if (!(await repoManager.isRepository())) {
      console.log(JSON.stringify({
        error: true,
        message: "Not in a repository. Run 'ergosum init' first.",
        path: cwd
      }));
      process.exit(1);
    }

    // Check authentication
    if (!config.isAuthenticated()) {
      console.log(JSON.stringify({
        error: true,
        message: "Not authenticated. Run 'ergosum login' first.",
        authenticated: false
      }));
      process.exit(1);
    }

    const apiClient = await import('../lib/api-client.js');
    
    // Pull remote data
    const result = await repoManager.pullFromRemote(apiClient.apiClient);

    console.log(JSON.stringify({
      success: true,
      action: 'pull',
      data: {
        commits_fetched: result.commits.length,
        objects_fetched: result.objects.length,
        branches_fetched: result.branches.length,
        updated: result.updated,
        commits: result.commits.map(c => ({
          id: c.id,
          message: c.message,
          author: c.author,
          timestamp: c.timestamp
        }))
      },
      message: result.updated 
        ? `Successfully pulled and updated with ${result.commits.length} new commits`
        : 'Already up to date'
    }));

  } catch (error) {
    console.log(JSON.stringify({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      action: 'pull'
    }));
    process.exit(1);
  }
}

// Clone a remote repository
export async function cloneRepository(remoteRepoId: string, options: { name?: string, path?: string } = {}) {
  try {
    const targetPath = options.path || process.cwd();
    const repoManager = new RepositoryManager(targetPath);

    // Check if directory already has a repository
    if (await repoManager.isRepository()) {
      console.log(JSON.stringify({
        error: true,
        message: "Repository already exists in this directory",
        path: targetPath
      }));
      process.exit(1);
    }

    // Check authentication
    if (!config.isAuthenticated()) {
      console.log(JSON.stringify({
        error: true,
        message: "Not authenticated. Run 'ergosum login' first.",
        authenticated: false
      }));
      process.exit(1);
    }

    const apiClient = await import('../lib/api-client.js');
    
    // Clone remote repository
    const repo = await repoManager.cloneFromRemote(remoteRepoId, apiClient.apiClient, options);

    console.log(JSON.stringify({
      success: true,
      action: 'clone',
      data: {
        repository: {
          id: repo.id,
          name: repo.name,
          description: repo.description,
          remote_url: repo.remote_url,
          default_branch: repo.default_branch
        },
        local_path: targetPath
      },
      message: `Successfully cloned repository '${repo.name}' to ${targetPath}`
    }));

  } catch (error) {
    console.log(JSON.stringify({
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      action: 'clone'
    }));
    process.exit(1);
  }
}