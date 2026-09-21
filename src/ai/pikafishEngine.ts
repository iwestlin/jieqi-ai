export type PikafishEngineMessage = {
  type: 'ready' | 'output' | 'error' | 'fatal';
  line?: string;
  error?: string;
};

export class PikafishEngine {
  #worker: Worker;
  #listeners = new Set<(message: PikafishEngineMessage) => void>();
  #startPromise: Promise<void> | null = null;

  constructor() {
    this.#worker = new Worker(
      new URL('/pikafish.worker.js', document.baseURI),
      { type: 'module' },
    );
    this.#worker.addEventListener('message', event => {
      for (const listener of this.#listeners) listener(event.data);
    });
    this.#worker.addEventListener('error', event => {
      this.#emit({
        type: 'fatal',
        error: event.message || 'Pikafish worker failed to load',
      });
    });
  }

  start({ threads = 1, hashMB = 48 } = {}): Promise<void> {
    if (!this.#startPromise) {
      this.#startPromise = new Promise((resolve, reject) => {
        const unsubscribe = this.onOutput(message => {
          if (message.type === 'ready') {
            unsubscribe();
            resolve();
          } else if (message.type === 'fatal') {
            unsubscribe();
            reject(new Error(message.error ?? 'Pikafish worker failed to load'));
          }
        });
        this.#worker.postMessage({
          type: 'init',
          options: { threads, hashMB },
        });
      });
    }
    return this.#startPromise;
  }

  send(command: string): void {
    this.#worker.postMessage({ type: 'command', command });
  }

  stop(): void {
    this.#worker.postMessage({ type: 'stop' });
  }

  terminate(): void {
    this.#worker.terminate();
  }

  onOutput(listener: (message: PikafishEngineMessage) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  waitFor(
    predicate: (message: PikafishEngineMessage) => boolean,
    timeoutMs = 30_000,
  ): Promise<PikafishEngineMessage> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out after ${timeoutMs} ms waiting for engine output`));
      }, timeoutMs);
      const unsubscribe = this.onOutput(message => {
        if (message.type === 'fatal') {
          clearTimeout(timer);
          unsubscribe();
          reject(new Error(message.error ?? 'Pikafish worker failed'));
          return;
        }
        if (predicate(message)) {
          clearTimeout(timer);
          unsubscribe();
          resolve(message);
        }
      });
    });
  }

  #emit(message: PikafishEngineMessage) {
    for (const listener of this.#listeners) listener(message);
  }
}
