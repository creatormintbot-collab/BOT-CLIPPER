export class InMemoryQueue {
  constructor({ logger }) {
    this.logger = logger;
    this.jobs = [];
    this.handler = null;
    this.running = false;
  }

  async add(job) {
    this.jobs.push(job);
    this.logger.debug('Job queued in memory.', { jobId: job.id, type: job.type });
    return job;
  }

  process(handler) {
    this.handler = handler;
  }

  async runNext() {
    if (this.running || this.jobs.length === 0) {
      return null;
    }

    if (typeof this.handler !== 'function') {
      throw new Error('No queue processor registered. Call queue.process(handler) first.');
    }

    const job = this.jobs.shift();
    this.running = true;

    try {
      return await this.handler(job);
    } finally {
      this.running = false;
    }
  }
}

export function createInMemoryQueue({ logger }) {
  return new InMemoryQueue({ logger });
}
