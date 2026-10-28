export type DraftStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface DraftSaverOptions<T> {
  /** Writes one snapshot. Must be safe to call again with a newer snapshot. */
  save: (value: T) => Promise<void>;
  /** Quiet period after the last change before a save is sent. */
  debounceMs: number;
  onStatus?: (status: DraftStatus) => void;
  onError?: (error: unknown) => void;
  /** Longest wait between automatic retries after a failed save. */
  maxRetryMs?: number;
}

/**
 * Debounced, dirty-tracked autosave with at most one save in flight.
 *
 * - Nothing is sent unless the snapshot actually differs from the last one saved (the
 *   caller passes a stable `key`, so cosmetic state changes never trigger a request).
 * - Edits are coalesced: typing in a count field sends one request after the user pauses,
 *   not one per keystroke and not one per fixed 30-second tick.
 * - Saves never overlap, so a slow response cannot be overtaken and overwritten by a
 *   quicker, newer one.
 * - A failed save is retried with backoff and keeps the snapshot marked dirty.
 */
export class DraftSaver<T> {
  private lastSavedKey: string | null = null;
  private pending: { key: string; value: T } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;
  private failures = 0;
  private current: DraftStatus = 'idle';

  constructor(private readonly options: DraftSaverOptions<T>) {}

  get status(): DraftStatus {
    return this.current;
  }

  /** True while there is a change that has not reached the server. */
  get isDirty(): boolean {
    return this.pending !== null || this.current === 'saving';
  }

  /** Offers a snapshot. `immediate` skips the debounce (used for the very first save). */
  submit(key: string, value: T, immediate = false): void {
    if (this.pending === null && key === this.lastSavedKey) return;

    this.pending = { key, value };
    this.setStatus(this.current === 'saving' ? 'saving' : 'dirty');
    this.schedule(immediate ? 0 : this.options.debounceMs);
  }

  /** Sends any pending snapshot now and resolves when nothing is left in flight. */
  flush(): Promise<void> {
    this.clearTimer();
    this.run();
    return this.chain;
  }

  /**
   * Drops any snapshot that has not been sent and waits for the one in flight. Used right
   * before an explicit save, which writes the whole table itself.
   */
  async cancelAndSettle(): Promise<void> {
    this.clearTimer();
    this.pending = null;
    await this.chain;
  }

  /** Forgets everything (a new import replaces the draft wholesale). */
  reset(): void {
    this.clearTimer();
    this.generation += 1;
    this.pending = null;
    this.lastSavedKey = null;
    this.failures = 0;
    this.setStatus('idle');
  }

  dispose(): void {
    this.clearTimer();
  }

  private schedule(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => this.run(), delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(status: DraftStatus): void {
    if (status === this.current) return;
    this.current = status;
    this.options.onStatus?.(status);
  }

  private run(): void {
    this.timer = null;
    const generation = this.generation;

    this.chain = this.chain.then(async () => {
      const snapshot = this.pending;
      if (snapshot === null || generation !== this.generation) return;

      this.pending = null;
      this.setStatus('saving');

      try {
        await this.options.save(snapshot.value);
        if (generation !== this.generation) return;

        this.lastSavedKey = snapshot.key;
        this.failures = 0;
        this.setStatus(this.pending === null ? 'saved' : 'dirty');
      } catch (error) {
        if (generation !== this.generation) return;

        // Keep the snapshot unless a newer one has already replaced it.
        this.pending = this.pending ?? snapshot;
        this.failures += 1;
        this.setStatus('error');
        this.options.onError?.(error);

        const backoff = Math.min(this.options.maxRetryMs ?? 30_000, 2_000 * 2 ** (this.failures - 1));
        this.schedule(backoff);
      }
    });
  }
}
