/**
 * `Array.map` with an async callback that runs at most `limit` calls at a time. Results keep the
 * order of `items`, however the calls finish. After the first failure no further call is started;
 * calls already running settle, then the first error is thrown.
 */
export const mapWithConcurrency = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  callback: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> => {
  const results: Result[] = Array.from({ length: items.length });
  let nextIndex = 0;
  let failure: { error: unknown } | undefined;

  const worker = async (): Promise<void> => {
    while (!failure && nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = await callback(items[index], index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };

  const workerCount = Math.max(1, Math.min(Math.floor(limit), items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  if (failure) throw failure.error;
  return results;
};
