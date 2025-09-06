import { SingleBar, MultiBar, Presets } from 'cli-progress';
import { Listr, ListrTask } from 'listr2';
import ora, { Ora } from 'ora';
import chalk from 'chalk';

// Simple spinner for single operations
export class ProgressSpinner {
  private spinner: Ora;

  constructor(text: string, color: 'blue' | 'green' | 'yellow' | 'red' = 'blue') {
    this.spinner = ora({ text, color });
  }

  start(): void {
    this.spinner.start();
  }

  succeed(text?: string): void {
    this.spinner.succeed(text);
  }

  fail(text?: string): void {
    this.spinner.fail(text);
  }

  warn(text?: string): void {
    this.spinner.warn(text);
  }

  info(text?: string): void {
    this.spinner.info(text);
  }

  stop(): void {
    this.spinner.stop();
  }

  updateText(text: string): void {
    this.spinner.text = text;
  }
}

// Progress bar for operations with known progress
export class ProgressBar {
  private bar: SingleBar;

  constructor(total: number, format?: string) {
    this.bar = new SingleBar({
      format: format || chalk.blue('{bar}') + ' {percentage}% | {value}/{total} | {text}',
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
    }, Presets.shades_classic);

    this.bar.start(total, 0, { text: '' });
  }

  update(current: number, text?: string): void {
    this.bar.update(current, { text: text || '' });
  }

  increment(text?: string): void {
    this.bar.increment({ text: text || '' });
  }

  stop(): void {
    this.bar.stop();
  }
}

// Multi-bar progress for multiple concurrent operations
export class MultiProgress {
  private multibar: MultiBar;
  private bars: Map<string, SingleBar>;

  constructor() {
    this.multibar = new MultiBar({
      format: chalk.blue('{bar}') + ' {percentage}% | {name} | {text}',
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: true,
    }, Presets.shades_grey);

    this.bars = new Map();
  }

  addBar(name: string, total: number): void {
    const bar = this.multibar.create(total, 0, { name, text: '' });
    this.bars.set(name, bar);
  }

  updateBar(name: string, current: number, text?: string): void {
    const bar = this.bars.get(name);
    if (bar) {
      bar.update(current, { name, text: text || '' });
    }
  }

  incrementBar(name: string, text?: string): void {
    const bar = this.bars.get(name);
    if (bar) {
      bar.increment({ name, text: text || '' });
    }
  }

  stop(): void {
    this.multibar.stop();
  }
}

// Task list with rich output for complex operations
export class TaskRunner {
  private tasks: ListrTask[];

  constructor() {
    this.tasks = [];
  }

  addTask(title: string, task: (ctx: any, task: any) => Promise<any> | any, options?: any): void {
    this.tasks.push({
      title,
      task,
      ...options,
    });
  }

  async run(context: any = {}): Promise<any> {
    const listr = new Listr(this.tasks, {
      concurrent: false,
      rendererOptions: {
        collapse: false,
        collapseSkips: false,
      },
    });

    try {
      return await listr.run(context);
    } catch (error) {
      throw error;
    }
  }
}

// Factory functions for common patterns
export function createSpinner(text: string): ProgressSpinner {
  return new ProgressSpinner(text);
}

export function createProgressBar(total: number, format?: string): ProgressBar {
  return new ProgressBar(total, format);
}

export function createMultiProgress(): MultiProgress {
  return new MultiProgress();
}

export function createTaskRunner(): TaskRunner {
  return new TaskRunner();
}

// Utility function for timing operations
export async function withProgress<T>(
  operation: () => Promise<T>,
  text: string,
  successText?: string,
  failText?: string
): Promise<T> {
  const spinner = createSpinner(text);
  spinner.start();

  try {
    const result = await operation();
    spinner.succeed(successText || `${text} - completed`);
    return result;
  } catch (error) {
    spinner.fail(failText || `${text} - failed`);
    throw error;
  }
}

// Batch operation progress
export async function withBatchProgress<T, R>(
  items: T[],
  operation: (item: T, index: number) => Promise<R>,
  text: string = 'Processing items'
): Promise<R[]> {
  const progressBar = createProgressBar(items.length);
  const results: R[] = [];

  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      progressBar.update(i, `${text} (${i}/${items.length})`);
      
      const result = await operation(item, i);
      results.push(result);
      
      progressBar.update(i + 1, `${text} (${i + 1}/${items.length})`);
    }

    progressBar.stop();
    console.log(chalk.green(`✅ ${text} completed`));
    return results;
  } catch (error) {
    progressBar.stop();
    console.log(chalk.red(`❌ ${text} failed`));
    throw error;
  }
}

// Advanced task runner with sub-tasks
export class AdvancedTaskRunner {
  static async authenticateAndSetup(): Promise<void> {
    const runner = createTaskRunner();

    runner.addTask('Checking authentication', async (ctx) => {
      // Implementation would go here
      await new Promise(resolve => setTimeout(resolve, 1000));
      return 'Authenticated';
    });

    runner.addTask('Validating API connection', async (ctx) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return 'Connected';
    });

    runner.addTask('Loading configuration', async (ctx) => {
      await new Promise(resolve => setTimeout(resolve, 300));
      return 'Loaded';
    });

    await runner.run();
  }

  static async bulkMemoryOperation(items: any[]): Promise<void> {
    const runner = createTaskRunner();

    runner.addTask(`Processing ${items.length} memories`, async (ctx, task) => {
      const subTasks = items.map((item, index) => ({
        title: `Memory ${index + 1}: ${item.title || 'Untitled'}`,
        task: async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return `Processed ${item.title || 'Untitled'}`;
        },
      }));

      return task.newListr(subTasks, { concurrent: false });
    });

    await runner.run();
  }
}