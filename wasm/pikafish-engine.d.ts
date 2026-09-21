export class PikafishEngine {
  start(options?: { threads?: number; hashMB?: number }): Promise<PikafishEngine>;
  send(command: string): void;
  stop(): void;
  onOutput(
    listener: (message: { type: string; line?: string; error?: string }) => void,
  ): () => boolean;
  waitFor(
    predicate: (message: { line?: string }) => boolean,
    timeoutMs?: number,
  ): Promise<{ type: string; line?: string }>;
  terminate(): void;
}
