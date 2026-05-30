export interface QueueTask {
  taskId: string;
  tenantId: string;
}

interface TaskQueueOptions<T extends QueueTask> {
  maxConcurrent: number;
  maxConcurrentPerTenant: number;
  maxQueueSize: number;
  worker: (task: T) => Promise<void>;
  onQueueChanged?: (queuedTasks: T[]) => Promise<void> | void;
}

export class TaskDispatchQueue<T extends QueueTask> {
  private readonly queue: T[] = [];
  private readonly activeByTask = new Map<string, T>();
  private readonly activeByTenant = new Map<string, number>();
  private scheduling = false;

  constructor(private readonly options: TaskQueueOptions<T>) {}

  get pendingCount() {
    return this.queue.length;
  }

  /** 队列与 worker 均无未完成任务时返回 true（便于 Demo 安全清空数据） */
  isIdle() {
    return this.queue.length === 0 && this.activeByTask.size === 0;
  }

  canAccept() {
    return this.queue.length < this.options.maxQueueSize;
  }

  async enqueue(task: T) {
    this.queue.push(task);
    await this.notifyQueueChanged();
    this.schedule();
  }

  isQueued(taskId: string) {
    return this.queue.some((task) => task.taskId === taskId);
  }

  getQueuePosition(taskId: string) {
    const index = this.queue.findIndex((task) => task.taskId === taskId);
    return index >= 0 ? index + 1 : undefined;
  }

  private schedule() {
    if (this.scheduling) {
      return;
    }
    this.scheduling = true;
    void this.runScheduler();
  }

  private async runScheduler() {
    try {
      while (this.activeByTask.size < this.options.maxConcurrent) {
        const nextIndex = this.queue.findIndex((task) => this.canRunTenant(task.tenantId));
        if (nextIndex < 0) {
          break;
        }
        const [task] = this.queue.splice(nextIndex, 1);
        this.activeByTask.set(task.taskId, task);
        this.activeByTenant.set(
          task.tenantId,
          (this.activeByTenant.get(task.tenantId) ?? 0) + 1
        );
        await this.notifyQueueChanged();
        void this.runTask(task);
      }
    } finally {
      this.scheduling = false;
      if (this.queue.length > 0 && this.activeByTask.size < this.options.maxConcurrent) {
        this.schedule();
      }
    }
  }

  private async runTask(task: T) {
    try {
      await this.options.worker(task);
    } finally {
      this.activeByTask.delete(task.taskId);
      const remaining = (this.activeByTenant.get(task.tenantId) ?? 1) - 1;
      if (remaining > 0) {
        this.activeByTenant.set(task.tenantId, remaining);
      } else {
        this.activeByTenant.delete(task.tenantId);
      }
      await this.notifyQueueChanged();
      this.schedule();
    }
  }

  private canRunTenant(tenantId: string) {
    return (
      (this.activeByTenant.get(tenantId) ?? 0) <
      this.options.maxConcurrentPerTenant
    );
  }

  private async notifyQueueChanged() {
    await this.options.onQueueChanged?.([...this.queue]);
  }
}

interface ServiceGateOptions {
  name: string;
  maxConcurrent: number;
  maxConcurrentPerTenant: number;
}

interface Waiter {
  tenantId: string;
  resolve: (waitedMs: number) => void;
  enqueuedAt: number;
}

export class ServiceConcurrencyGate {
  private activeTotal = 0;
  private readonly activeByTenant = new Map<string, number>();
  private readonly waiters: Waiter[] = [];

  constructor(private readonly options: ServiceGateOptions) {}

  get name() {
    return this.options.name;
  }

  async acquire(tenantId: string) {
    if (this.canRun(tenantId)) {
      this.markActive(tenantId);
      return 0;
    }
    return new Promise<number>((resolve) => {
      this.waiters.push({
        tenantId,
        resolve,
        enqueuedAt: Date.now(),
      });
    });
  }

  release(tenantId: string) {
    this.activeTotal = Math.max(0, this.activeTotal - 1);
    const tenantActive = (this.activeByTenant.get(tenantId) ?? 1) - 1;
    if (tenantActive > 0) {
      this.activeByTenant.set(tenantId, tenantActive);
    } else {
      this.activeByTenant.delete(tenantId);
    }
    this.flushWaiters();
  }

  private flushWaiters() {
    let index = 0;
    while (index < this.waiters.length && this.activeTotal < this.options.maxConcurrent) {
      const waiter = this.waiters[index];
      if (!this.canRun(waiter.tenantId)) {
        index += 1;
        continue;
      }
      this.waiters.splice(index, 1);
      this.markActive(waiter.tenantId);
      waiter.resolve(Date.now() - waiter.enqueuedAt);
    }
  }

  private canRun(tenantId: string) {
    return (
      this.activeTotal < this.options.maxConcurrent &&
      (this.activeByTenant.get(tenantId) ?? 0) < this.options.maxConcurrentPerTenant
    );
  }

  private markActive(tenantId: string) {
    this.activeTotal += 1;
    this.activeByTenant.set(
      tenantId,
      (this.activeByTenant.get(tenantId) ?? 0) + 1
    );
  }
}
