/**
 * DEV-only surface for push registration pipeline (banner + subscription).
 * Searchable from logs: callers use [PUSH_INIT] / [PUSH_TOKEN] / [PUSH_SYNC] on console.
 */

export type PushDiagState = {
  updatedAt: number;
  /** Last high-level milestone (for on-screen DEV banner). */
  step: string;
  isDevice: boolean;
  projectIdPresent: boolean;
  projectIdPreview: string | null;
  notificationsPluginActive: boolean | null;
  permissionStatus: string | null;
  expoTokenPreview: string | null;
  lastSyncOk: boolean | null;
  lastSyncReason: string | null;
  lastError: string | null;
};

const initial: PushDiagState = {
  updatedAt: Date.now(),
  step: "module_loaded",
  isDevice: false,
  projectIdPresent: false,
  projectIdPreview: null,
  notificationsPluginActive: null,
  permissionStatus: null,
  expoTokenPreview: null,
  lastSyncOk: null,
  lastSyncReason: null,
  lastError: null,
};

let state: PushDiagState = { ...initial };

const listeners = new Set<() => void>();

export function getPushDiagState(): PushDiagState {
  return { ...state };
}

export function updatePushDiag(partial: Partial<PushDiagState>): void {
  state = { ...state, ...partial, updatedAt: Date.now() };
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

export function subscribePushDiag(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function resetPushDiagForTests(): void {
  state = { ...initial };
}
