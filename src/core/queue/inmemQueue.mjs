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
    this.#kick();
    return job;
  }

  process(handler) {
    this.handler = handler;
    this.#kick();
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
      const result = await this.handler(job);
      return result;
    } finally {
      this.running = false;
      this.#kick();
    }
  }

  #kick() {
    if (this.running || typeof this.handler !== 'function' || this.jobs.length === 0) {
      return;
    }

    setImmediate(async () => {
      while (!this.running && this.jobs.length > 0) {
        await this.runNext();
      }
    });
  }
}

export function createInMemoryQueue({ logger }) {
  return new InMemoryQueue({ logger });
}
