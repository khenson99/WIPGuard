/**
 * Conflict detection and resolution for offline sync.
 * Never loses data -- even "server-wins" preserves client values.
 */

export type ConflictType = "no-conflict" | "field-level" | "status-mismatch" | "concurrent-edit" | "deleted-on-server";
export type ConflictStrategy = "client-wins" | "server-wins" | "merge" | "manual";
export interface MergeResult { merged: Record<string, unknown>; conflictType: ConflictType; strategy: ConflictStrategy; preservedValues: Record<string, unknown>; }

export function detectConflict(clientPayload: Record<string, unknown>, serverPayload: Record<string, unknown>): ConflictType {
  if (!serverPayload || Object.keys(serverPayload).length === 0) return "deleted-on-server";
  if (clientPayload.status !== undefined && serverPayload.status !== undefined && clientPayload.status !== serverPayload.status) return "status-mismatch";
  const conflictingFields: string[] = [];
  for (const key of Object.keys(clientPayload)) {
    if (key in serverPayload && JSON.stringify(clientPayload[key]) !== JSON.stringify(serverPayload[key])) conflictingFields.push(key);
  }
  if (conflictingFields.length === 0) return "no-conflict";
  return conflictingFields.length <= 2 ? "field-level" : "concurrent-edit";
}

export function resolveWithStrategy(conflictType: ConflictType, strategy: ConflictStrategy, clientPayload: Record<string, unknown>, serverPayload: Record<string, unknown>): Record<string, unknown> {
  if (conflictType === "no-conflict") return { ...serverPayload, ...clientPayload };
  switch (strategy) {
    case "client-wins": return { ...serverPayload, ...clientPayload, _serverOverridden: { ...serverPayload } };
    case "server-wins": return { ...clientPayload, ...serverPayload, _clientOverridden: { ...clientPayload } };
    case "merge": return mergeChanges(clientPayload, serverPayload);
    case "manual": return { _requiresManualResolution: true, client: { ...clientPayload }, server: { ...serverPayload } };
  }
}

export function mergeChanges(clientPayload: Record<string, unknown>, serverPayload: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const conflicts: Record<string, { client: unknown; server: unknown }> = {};
  const allKeys = new Set([...Object.keys(clientPayload), ...Object.keys(serverPayload)]);
  for (const key of allKeys) {
    const inClient = key in clientPayload;
    const inServer = key in serverPayload;
    if (inClient && !inServer) { merged[key] = clientPayload[key]; }
    else if (!inClient && inServer) { merged[key] = serverPayload[key]; }
    else if (JSON.stringify(clientPayload[key]) === JSON.stringify(serverPayload[key])) { merged[key] = clientPayload[key]; }
    else { merged[key] = clientPayload[key]; conflicts[key] = { client: clientPayload[key], server: serverPayload[key] }; }
  }
  if (Object.keys(conflicts).length > 0) merged._conflicts = conflicts;
  return merged;
}
