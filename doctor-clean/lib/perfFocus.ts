/**
 * DEV timing for navigation/focus work. Search logs: [perf:focus]
 */
const active = new Map<string, number>();

export function focusPerfStart(label: string): () => void {
  if (!__DEV__) return () => {};
  const key = label;
  active.set(key, Date.now());
  console.time(`[perf:focus] ${key}`);
  return () => {
    const started = active.get(key);
    console.timeEnd(`[perf:focus] ${key}`);
    if (started != null) {
      const ms = Date.now() - started;
      if (ms > 120) {
        console.warn(`[perf:focus] slow ${key} ${ms}ms`);
      }
      active.delete(key);
    }
  };
}

export function focusPerfMark(label: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log(`[perf:focus] ${label}`, detail ?? {});
}
