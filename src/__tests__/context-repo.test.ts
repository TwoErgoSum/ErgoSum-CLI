import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { RepositoryManager } from '../lib/repo-manager';
import { InitOptions } from '../types';

describe('Context Repository', () => {
  let tempDir: string;
  let repoManager: RepositoryManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ergosum-test-'));
    repoManager = new RepositoryManager(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Repository Initialization', () => {
    test('should create .ergosum directory structure', async () => {
      const options: InitOptions = {
        name: 'test-repo',
        description: 'Test repository'
      };

      const repo = await repoManager.initRepository(options);

      expect(repo.name).toBe('test-repo');
      expect(repo.description).toBe('Test repository');
      expect(repo.default_branch).toBe('main');

      // Check directory structure
      const ergoPath = path.join(tempDir, '.ergosum');
      
      expect(await fs.stat(ergoPath)).toBeTruthy();
      expect(await fs.stat(path.join(ergoPath, 'objects'))).toBeTruthy();
      expect(await fs.stat(path.join(ergoPath, 'objects', 'commits'))).toBeTruthy();
      expect(await fs.stat(path.join(ergoPath, 'objects', 'trees'))).toBeTruthy();
      expect(await fs.stat(path.join(ergoPath, 'objects', 'blobs'))).toBeTruthy();
      expect(await fs.stat(path.join(ergoPath, 'refs', 'heads'))).toBeTruthy();
      expect(await fs.stat(path.join(ergoPath, 'refs', 'tags'))).toBeTruthy();
    });

    test('should create config file', async () => {
      await repoManager.initRepository({ name: 'test-repo' });
      
      const config = await repoManager.getConfig();
      expect(config.name).toBe('test-repo');
      expect(config.settings).toBeDefined();
      expect(config.settings.auto_embed).toBe(true);
      expect(config.settings.ignore_patterns).toContain('node_modules');
    });

    test('should initialize main branch', async () => {
      await repoManager.initRepository();
      
      const head = await repoManager.getHead();
      expect(head).toBe('main');
      
      const branch = await repoManager.getBranch('main');
      expect(branch).toBeTruthy();
      expect(branch!.name).toBe('main');
    });

    test('should fail if repository already exists', async () => {
      await repoManager.initRepository();
      
      await expect(repoManager.initRepository()).rejects.toThrow(
        'Repository already exists'
      );
    });
  });

  describe('File Operations', () => {
    beforeEach(async () => {
      await repoManager.initRepository();
    });

    test('should read and hash file content', async () => {
      // Create a test file
      const testFile = 'test.md';
      const content = '# Test File\n\nThis is a test.';
      await fs.writeFile(path.join(tempDir, testFile), content, 'utf8');

      const contentObj = await repoManager.readFile(testFile);
      
      expect(contentObj.content).toBe(content);
      expect(contentObj.type).toBe('file');
      expect(contentObj.encoding).toBe('utf8');
      expect(contentObj.size).toBe(content.length);
      expect(contentObj.mime_type).toBe('text/markdown');
      expect(contentObj.id).toBe(repoManager.hashContent(content));
    });

    test('should list files and ignore patterns', async () => {
      // Create test files
      await fs.writeFile(path.join(tempDir, 'README.md'), 'readme', 'utf8');
      await fs.writeFile(path.join(tempDir, 'script.js'), 'console.log("hello")', 'utf8');
      await fs.writeFile(path.join(tempDir, '.env'), 'SECRET=123', 'utf8');
      
      // Create node_modules directory
      await fs.mkdir(path.join(tempDir, 'node_modules'));
      await fs.writeFile(path.join(tempDir, 'node_modules', 'package.js'), 'module', 'utf8');

      const files = await repoManager.listFiles();
      
      expect(files).toContain('README.md');
      expect(files).toContain('script.js');
      expect(files).not.toContain('.env'); // Should be ignored
      expect(files).not.toContain('node_modules/package.js'); // Should be ignored
    });
  });

  describe('Object Storage', () => {
    beforeEach(async () => {
      await repoManager.initRepository();
    });

    test('should save and retrieve content objects', async () => {
      const contentObj = {
        id: 'test-id',
        type: 'file' as const,
        content: 'test content',
        encoding: 'utf8' as const,
        size: 12,
        mime_type: 'text/plain',
        created_at: new Date()
      };

      await repoManager.saveObject(contentObj);
      const retrieved = await repoManager.getObject('test-id');

      expect(retrieved).toBeTruthy();
      expect(retrieved!.content).toBe('test content');
      expect(retrieved!.type).toBe('file');
      expect(retrieved!.size).toBe(12);
    });

    test('should return null for non-existent objects', async () => {
      const result = await repoManager.getObject('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('Index Operations', () => {
    beforeEach(async () => {
      await repoManager.initRepository();
    });

    test('should save and retrieve index entries', async () => {
      const entries = [
        {
          path: 'file1.txt',
          object_id: 'obj1',
          mode: '100644',
          size: 100,
          modified_time: new Date(),
          staged: true
        },
        {
          path: 'file2.txt',
          object_id: 'obj2',
          mode: '100644',
          size: 200,
          modified_time: new Date(),
          staged: false
        }
      ];

      await repoManager.saveIndex(entries);
      const retrieved = await repoManager.getIndex();

      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].path).toBe('file1.txt');
      expect(retrieved[0].staged).toBe(true);
      expect(retrieved[1].staged).toBe(false);
    });
  });
});