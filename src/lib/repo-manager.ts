import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { 
  ContextRepo, 
  RepoSettings, 
  ContextCommit, 
  ContentObject, 
  ContextBranch, 
  ContextTree, 
  TreeEntry,
  IndexEntry,
  RepoState,
  InitOptions 
} from '../types';

export class RepositoryManager {
  private repoPath: string;
  private ergoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.ergoPath = path.join(repoPath, '.ergosum');
  }

  // Repository initialization and detection
  async isRepository(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.ergoPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async findRepository(startPath: string = process.cwd()): Promise<string | null> {
    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      const ergoPath = path.join(currentPath, '.ergosum');
      try {
        const stats = await fs.stat(ergoPath);
        if (stats.isDirectory()) {
          return currentPath;
        }
      } catch {
        // Continue searching
      }
      currentPath = path.dirname(currentPath);
    }

    return null;
  }

  async initRepository(options: InitOptions = {}): Promise<ContextRepo> {
    if (await this.isRepository()) {
      throw new Error('Repository already exists');
    }

    // Create .ergosum directory structure
    await this.createDirectoryStructure();

    // Create repository configuration
    const repo: ContextRepo = {
      id: this.generateId(),
      name: options.name || path.basename(this.repoPath),
      description: options.description,
      owner_id: '', // Will be set from CLI config
      remote_url: options.remote,
      default_branch: 'main',
      created_at: new Date(),
      updated_at: new Date(),
      settings: this.getDefaultSettings()
    };

    // Save repository config
    await this.saveConfig(repo);

    // Initialize default branch
    const mainBranch: ContextBranch = {
      id: this.generateId(),
      repo_id: repo.id,
      name: 'main',
      commit_id: '', // No commits yet
      created_at: new Date(),
      updated_at: new Date()
    };

    await this.saveBranch(mainBranch);
    await this.setHead('main');

    // Initialize empty index
    await this.saveIndex([]);

    return repo;
  }

  // Directory structure creation
  private async createDirectoryStructure(): Promise<void> {
    const dirs = [
      this.ergoPath,
      path.join(this.ergoPath, 'objects'),
      path.join(this.ergoPath, 'objects', 'commits'),
      path.join(this.ergoPath, 'objects', 'trees'),
      path.join(this.ergoPath, 'objects', 'blobs'),
      path.join(this.ergoPath, 'refs'),
      path.join(this.ergoPath, 'refs', 'heads'),
      path.join(this.ergoPath, 'refs', 'tags'),
      path.join(this.ergoPath, 'hooks')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  // Configuration management
  async getConfig(): Promise<ContextRepo> {
    const configPath = path.join(this.ergoPath, 'config.json');
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  }

  async saveConfig(repo: ContextRepo): Promise<void> {
    const configPath = path.join(this.ergoPath, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(repo, null, 2), 'utf8');
  }

  // HEAD management
  async getHead(): Promise<string> {
    const headPath = path.join(this.ergoPath, 'HEAD');
    try {
      const content = await fs.readFile(headPath, 'utf8');
      return content.trim();
    } catch {
      return 'main'; // Default branch
    }
  }

  async setHead(ref: string): Promise<void> {
    const headPath = path.join(this.ergoPath, 'HEAD');
    await fs.writeFile(headPath, ref, 'utf8');
  }

  // Object storage (content-addressable)
  async saveObject(obj: ContentObject): Promise<string> {
    const objectPath = path.join(this.ergoPath, 'objects', 'blobs', obj.id);
    const objectData = {
      type: obj.type,
      content: obj.content,
      encoding: obj.encoding,
      size: obj.size,
      mime_type: obj.mime_type,
      embedding: obj.embedding,
      created_at: obj.created_at instanceof Date ? obj.created_at.toISOString() : obj.created_at
    };
    
    await fs.writeFile(objectPath, JSON.stringify(objectData, null, 2), 'utf8');
    return obj.id;
  }

  async getObject(id: string): Promise<ContentObject | null> {
    const objectPath = path.join(this.ergoPath, 'objects', 'blobs', id);
    try {
      const content = await fs.readFile(objectPath, 'utf8');
      const data = JSON.parse(content);
      return {
        id,
        type: data.type,
        content: data.content,
        encoding: data.encoding,
        size: data.size,
        mime_type: data.mime_type,
        embedding: data.embedding,
        created_at: new Date(data.created_at)
      };
    } catch {
      return null;
    }
  }

  // Tree storage
  async saveTree(tree: ContextTree): Promise<string> {
    const treePath = path.join(this.ergoPath, 'objects', 'trees', tree.id);
    await fs.writeFile(treePath, JSON.stringify(tree, null, 2), 'utf8');
    return tree.id;
  }

  async getTree(id: string): Promise<ContextTree | null> {
    const treePath = path.join(this.ergoPath, 'objects', 'trees', id);
    try {
      const content = await fs.readFile(treePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  // Commit storage
  async saveCommit(commit: ContextCommit): Promise<string> {
    const commitPath = path.join(this.ergoPath, 'objects', 'commits', commit.id);
    const commitData = {
      ...commit,
      timestamp: commit.timestamp instanceof Date ? commit.timestamp.toISOString() : commit.timestamp
    };
    await fs.writeFile(commitPath, JSON.stringify(commitData, null, 2), 'utf8');
    return commit.id;
  }

  async getCommit(id: string): Promise<ContextCommit | null> {
    const commitPath = path.join(this.ergoPath, 'objects', 'commits', id);
    try {
      const content = await fs.readFile(commitPath, 'utf8');
      const data = JSON.parse(content);
      return {
        ...data,
        timestamp: data.timestamp instanceof Date ? data.timestamp : new Date(data.timestamp)
      };
    } catch {
      return null;
    }
  }

  // Branch management
  async saveBranch(branch: ContextBranch): Promise<void> {
    const branchPath = path.join(this.ergoPath, 'refs', 'heads', branch.name);
    const branchData = {
      id: branch.id,
      repo_id: branch.repo_id,
      name: branch.name,
      commit_id: branch.commit_id,
      created_at: branch.created_at instanceof Date ? branch.created_at.toISOString() : branch.created_at,
      updated_at: branch.updated_at instanceof Date ? branch.updated_at.toISOString() : branch.updated_at
    };
    await fs.writeFile(branchPath, JSON.stringify(branchData, null, 2), 'utf8');
  }

  async getBranch(name: string): Promise<ContextBranch | null> {
    const branchPath = path.join(this.ergoPath, 'refs', 'heads', name);
    try {
      const content = await fs.readFile(branchPath, 'utf8');
      const data = JSON.parse(content);
      return {
        ...data,
        created_at: new Date(data.created_at),
        updated_at: new Date(data.updated_at)
      };
    } catch {
      return null;
    }
  }

  async listBranches(): Promise<string[]> {
    const headsPath = path.join(this.ergoPath, 'refs', 'heads');
    try {
      return await fs.readdir(headsPath);
    } catch {
      return [];
    }
  }

  // Index (staging area) management
  async saveIndex(entries: IndexEntry[]): Promise<void> {
    const indexPath = path.join(this.ergoPath, 'index');
    const indexData = entries.map(entry => ({
      ...entry,
      modified_time: entry.modified_time instanceof Date ? entry.modified_time.toISOString() : entry.modified_time
    }));
    await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
  }

  async getIndex(): Promise<IndexEntry[]> {
    const indexPath = path.join(this.ergoPath, 'index');
    try {
      const content = await fs.readFile(indexPath, 'utf8');
      const data = JSON.parse(content);
      return data.map((entry: any) => ({
        ...entry,
        modified_time: new Date(entry.modified_time)
      }));
    } catch {
      return [];
    }
  }

  // Content hashing
  hashContent(content: string | Buffer): string {
    return crypto.createHash('sha1').update(content).digest('hex');
  }

  // Utility methods
  private generateId(): string {
    return crypto.randomUUID();
  }

  private getDefaultSettings(): RepoSettings {
    return {
      auto_embed: true,
      max_file_size: 10 * 1024 * 1024, // 10MB
      ignore_patterns: [
        '.git',
        '.ergosum',
        'node_modules',
        '*.log',
        '.env',
        '.env.local',
        'dist',
        'build',
        '.DS_Store'
      ],
      ai_integration: {
        generate_summaries: true,
        optimize_for: 'general'
      }
    };
  }

  // File operations
  async readFile(filePath: string): Promise<ContentObject> {
    const fullPath = path.resolve(this.repoPath, filePath);
    const content = await fs.readFile(fullPath, 'utf8');
    const stats = await fs.stat(fullPath);
    
    return {
      id: this.hashContent(content),
      type: 'file',
      content,
      encoding: 'utf8',
      size: content.length,
      mime_type: this.getMimeType(filePath),
      created_at: new Date()
    };
  }

  async listFiles(dirPath: string = '.'): Promise<string[]> {
    const fullPath = path.resolve(this.repoPath, dirPath);
    const files: string[] = [];
    
    const traverse = async (currentPath: string, relativePath: string = '') => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(relativePath, entry.name);
        const fullEntryPath = path.join(currentPath, entry.name);
        
        if (this.shouldIgnore(entryPath)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await traverse(fullEntryPath, entryPath);
        } else {
          files.push(entryPath);
        }
      }
    };
    
    await traverse(fullPath);
    return files;
  }

  private shouldIgnore(filePath: string): boolean {
    const config = this.getDefaultSettings(); // In real implementation, get from saved config
    return config.ignore_patterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filePath);
      }
      return filePath.includes(pattern);
    });
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.json': 'application/json',
      '.py': 'text/x-python',
      '.html': 'text/html',
      '.css': 'text/css'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // Remote operations
  async getUnpushedCommits(): Promise<ContextCommit[]> {
    const commits: ContextCommit[] = [];
    const commitsPath = path.join(this.ergoPath, 'objects', 'commits');
    const pushedCommits = await this.readPushedCommits();
    
    try {
      const files = await fs.readdir(commitsPath);
      
      for (const file of files) {
        const commitPath = path.join(commitsPath, file);
        const commitData = await fs.readFile(commitPath, 'utf8');
        const commit = JSON.parse(commitData);
        
        // Only include commits that haven't been pushed
        if (!pushedCommits.includes(commit.id)) {
          commits.push(commit);
        }
      }
    } catch (error) {
      // No commits directory or no commits yet
    }
    
    return commits;
  }

  async getUnpushedObjects(): Promise<ContentObject[]> {
    const objects: ContentObject[] = [];
    const blobsPath = path.join(this.ergoPath, 'objects', 'blobs');
    const pushedObjects = await this.readPushedObjects();
    
    try {
      const files = await fs.readdir(blobsPath);
      
      for (const file of files) {
        const objectPath = path.join(blobsPath, file);
        const objectData = await fs.readFile(objectPath, 'utf8');
        const obj = JSON.parse(objectData);
        
        // Add the ID from the filename if it's missing
        if (!obj.id) {
          obj.id = file;
        }
        
        // Only include objects that haven't been pushed
        if (!pushedObjects.includes(obj.id)) {
          objects.push(obj);
        }
      }
    } catch (error) {
      // No blobs directory or no objects yet
    }
    
    return objects;
  }

  async markCommitsPushed(commitIds: string[]): Promise<void> {
    // In a real implementation, we would track which commits have been pushed
    // For now, we'll create a simple tracking file
    const pushedPath = path.join(this.ergoPath, 'pushed_commits');
    const existingPushed = await this.readPushedCommits();
    const allPushed = [...existingPushed, ...commitIds];
    
    await fs.writeFile(pushedPath, JSON.stringify(allPushed, null, 2));
  }

  async markObjectsPushed(objectIds: string[]): Promise<void> {
    const pushedPath = path.join(this.ergoPath, 'pushed_objects');
    const existingPushed = await this.readPushedObjects();
    const allPushed = [...existingPushed, ...objectIds];
    
    await fs.writeFile(pushedPath, JSON.stringify(allPushed, null, 2));
  }

  private async readPushedCommits(): Promise<string[]> {
    try {
      const pushedPath = path.join(this.ergoPath, 'pushed_commits');
      const data = await fs.readFile(pushedPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async readPushedObjects(): Promise<string[]> {
    try {
      const pushedPath = path.join(this.ergoPath, 'pushed_objects');
      const data = await fs.readFile(pushedPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async setRemoteRepository(remoteRepoId: string): Promise<void> {
    const config = await this.getConfig();
    config.remote_url = `ergosum://repository/${remoteRepoId}`;
    await this.saveConfig(config);
  }

  async getRemoteRepositoryId(): Promise<string | null> {
    const config = await this.getConfig();
    if (config.remote_url?.startsWith('ergosum://repository/')) {
      return config.remote_url.replace('ergosum://repository/', '');
    }
    return null;
  }

  // Fetch operations - download remote data without updating working directory
  async fetchFromRemote(apiClient: any): Promise<{ commits: ContextCommit[], objects: ContentObject[], branches: ContextBranch[] }> {
    const remoteRepoId = await this.getRemoteRepositoryId();
    if (!remoteRepoId) {
      throw new Error('No remote repository configured');
    }

    // Get last fetch timestamp to only fetch new data
    const lastFetchPath = path.join(this.ergoPath, 'last_fetch');
    let since: string | undefined;
    try {
      since = await fs.readFile(lastFetchPath, 'utf8');
    } catch {
      // No previous fetch
    }

    // Fetch data from remote
    const [commits, objects, branches] = await Promise.all([
      apiClient.fetchCommits(remoteRepoId, since),
      apiClient.fetchObjects(remoteRepoId, since),
      apiClient.fetchBranches(remoteRepoId)
    ]);

    // Store fetched commits locally
    for (const commit of commits) {
      await this.saveCommit(commit);
    }

    // Store fetched objects locally
    for (const obj of objects) {
      await this.saveObject(obj);
    }

    // Update branches
    for (const branch of branches) {
      await this.saveBranch(branch);
    }

    // Update last fetch timestamp
    await fs.writeFile(lastFetchPath, new Date().toISOString(), 'utf8');

    return { commits, objects, branches };
  }

  // Pull operation - fetch and merge remote changes into current branch
  async pullFromRemote(apiClient: any): Promise<{ 
    commits: ContextCommit[], 
    objects: ContentObject[], 
    branches: ContextBranch[],
    updated: boolean 
  }> {
    const currentBranch = await this.getHead();
    const branch = await this.getBranch(currentBranch);
    if (!branch) {
      throw new Error(`Current branch '${currentBranch}' not found`);
    }

    // Fetch remote data
    const fetchResult = await this.fetchFromRemote(apiClient);
    
    // Find the remote version of current branch
    const remoteBranch = fetchResult.branches.find(b => b.name === currentBranch);
    if (!remoteBranch || !remoteBranch.commit_id) {
      return { ...fetchResult, updated: false };
    }

    // Check if we need to update
    if (branch.commit_id === remoteBranch.commit_id) {
      return { ...fetchResult, updated: false };
    }

    // Update branch to point to remote commit
    branch.commit_id = remoteBranch.commit_id;
    branch.updated_at = new Date();
    await this.saveBranch(branch);

    return { ...fetchResult, updated: true };
  }

  // Clone operation - create local repository from remote
  async cloneFromRemote(remoteRepoId: string, apiClient: any, options: { name?: string } = {}): Promise<ContextRepo> {
    if (await this.isRepository()) {
      throw new Error('Repository already exists in this directory');
    }

    // Get remote repository info
    const remoteRepo = await apiClient.getRepository(remoteRepoId);
    
    // Initialize local repository
    const repo = await this.initRepository({
      name: options.name || remoteRepo.name,
      description: remoteRepo.description
    });

    // Set remote URL
    await this.setRemoteRepository(remoteRepoId);

    // Fetch all data from remote
    await this.fetchFromRemote(apiClient);

    // Set HEAD to default branch from remote
    if (remoteRepo.default_branch) {
      await this.setHead(remoteRepo.default_branch);
    }

    return repo;
  }
}