/**
 * Offline sync engine for field workflows.
 * IndexedDB-backed queue with FIFO ordering and conflict resolution.
 */

import { type ConflictType, type ConflictStrategy, detectConflict, resolveWithStrategy } from "./conflict-resolution";

export type ActionType = "status-update" | "field-note" | "insight-note" | "metric-update";

export interface OfflineAction { id: string; type: ActionType; payload: Record<string, unknown>; timestamp: number; retries: number; status: "pending" | "syncing" | "synced" | "conflict"; }
export interface SyncQueue { actions: OfflineAction[]; lastSyncedAt: number | null; }
export interface ConflictResolution { actionId: string; conflictType: ConflictType; strategy: ConflictStrategy; resolved: boolean; serverValue?: unknown; clientValue?: unknown; mergedValue?: unknown; }
export interface QueueStatus { pending: number; syncing: number; synced: number; conflict: number; total: number; lastSyncedAt: number | null; }
export interface SyncStorage { getAll(): Promise<OfflineAction[]>; put(action: OfflineAction): Promise<void>; delete(id: string): Promise<void>; clear(): Promise<void>; }
export interface SyncResult { synced: string[]; conflicts: ConflictResolution[]; errors: Array<{ id: string; error: string }>; }

export function createMemoryStorage(): SyncStorage {
  let store: OfflineAction[] = [];
  return {
    async getAll() { return [...store]; },
    async put(action) { const idx = store.findIndex((a) => a.id === action.id); if (idx >= 0) { store[idx] = action; } else { store.push(action); } },
    async delete(id) { store = store.filter((a) => a.id !== id); },
    async clear() { store = []; },
  };
}

let _storage: SyncStorage = createMemoryStorage();
export function setStorage(s: SyncStorage): void { _storage = s; }
export function getStorage(): SyncStorage { return _storage; }

let _seq = 0;
export function nextId(): string { _seq += 1; return `offline-${Date.now()}-${_seq}`; }
export function _resetSeq(): void { _seq = 0; }

export async function queueOfflineAction(type: ActionType, payload: Record<string, unknown>): Promise<OfflineAction> {
  const action: OfflineAction = { id: nextId(), type, payload, timestamp: Date.now(), retries: 0, status: "pending" };
  await _storage.put(action);
  return action;
}

export async function getQueueStatus(): Promise<QueueStatus> {
  const actions = await _storage.getAll();
  const counts: Record<OfflineAction["status"], number> = { pending: 0, syncing: 0, synced: 0, conflict: 0 };
  for (const a of actions) counts[a.status] += 1;
  const lastSynced = actions.filter((a) => a.status === "synced").map((a) => a.timestamp);
  return { ...counts, total: actions.length, lastSyncedAt: lastSynced.length ? Math.max(...lastSynced) : null };
}

export async function processSync(
  sendFn: (action: OfflineAction) => Promise<{ ok: true } | { ok: false; conflict: true; serverValue: unknown }>,
  conflictStrategy: ConflictStrategy = "client-wins",
): Promise<SyncResult> {
  const result: SyncResult = { synced: [], conflicts: [], errors: [] };
  const actions = await _storage.getAll();
  const pending = actions.filter((a) => a.status === "pending" || a.status === "conflict").sort((a, b) => a.timestamp - b.timestamp);
  for (const action of pending) {
    action.status = "syncing";
    await _storage.put(action);
    try {
      const response = await sendFn(action);
      if (response.ok) { action.status = "synced"; await _storage.put(action); result.synced.push(action.id); }
      else if (response.conflict) {
        const conflictType = detectConflict(action.payload, response.serverValue as Record<string, unknown>);
        const merged = resolveWithStrategy(conflictType, conflictStrategy, action.payload, response.serverValue as Record<string, unknown>);
        action.status = "conflict"; await _storage.put(action);
        result.conflicts.push({ actionId: action.id, conflictType, strategy: conflictStrategy, resolved: true, serverValue: response.serverValue, clientValue: action.payload, mergedValue: merged });
      }
    } catch (err) {
      action.status = "pending"; action.retries += 1; await _storage.put(action);
      result.errors.push({ id: action.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

export async function resolveConflict(actionId: string, strategy: ConflictStrategy, serverValue: Record<string, unknown>): Promise<ConflictResolution> {
  const actions = await _storage.getAll();
  const action = actions.find((a) => a.id === actionId);
  if (!action) throw new Error(`Action ${actionId} not found in queue`);
  const conflictType = detectConflict(action.payload, serverValue);
  const mergedValue = resolveWithStrategy(conflictType, strategy, action.payload, serverValue);
  action.status = "synced"; await _storage.put(action);
  return { actionId, conflictType, strategy, resolved: true, serverValue, clientValue: action.payload, mergedValue };
}
