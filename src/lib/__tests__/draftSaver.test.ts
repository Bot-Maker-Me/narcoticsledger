import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftSaver } from '@/lib/draftSaver';

describe('DraftSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (save = vi.fn().mockResolvedValue(undefined)) => ({
    save,
    saver: new DraftSaver<string>({ save, debounceMs: 1000, onError: () => undefined }),
  });

  it('coalesces a burst of edits into one save after the quiet period', async () => {
    const { saver, save } = make();
    saver.submit('a', 'a');
    saver.submit('b', 'b');
    saver.submit('c', 'c');

    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('c');
  });

  it('saves the first snapshot immediately when asked', async () => {
    const { saver, save } = make();
    saver.submit('a', 'a', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('never saves an unchanged snapshot (not dirty, no request)', async () => {
    const { saver, save } = make();
    saver.submit('a', 'a', true);
    await vi.advanceTimersByTimeAsync(0);
    saver.submit('a', 'a');
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.isDirty).toBe(false);
    expect(saver.status).toBe('saved');
  });

  it('never overlaps saves and sends the newest edit last', async () => {
    let release: () => void = () => undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockResolvedValue(undefined);
    const { saver } = make(save);

    saver.submit('a', 'a', true);
    await vi.advanceTimersByTimeAsync(0);
    saver.submit('b', 'b');
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1); // second waits for the first

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('b');
  });

  it('keeps the snapshot dirty and retries with backoff after a failure', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const { saver } = make(save);

    saver.submit('a', 'a', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.status).toBe('error');
    expect(saver.isDirty).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(saver.status).toBe('saved');
  });

  it('cancelAndSettle drops unsent edits and waits for the one in flight', async () => {
    const { saver, save } = make();
    saver.submit('a', 'a');
    await saver.cancelAndSettle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it('reset forgets the last saved snapshot so the same data saves again', async () => {
    const { saver, save } = make();
    saver.submit('a', 'a', true);
    await vi.advanceTimersByTimeAsync(0);
    saver.reset();
    saver.submit('a', 'a', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
