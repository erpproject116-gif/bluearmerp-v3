/** Map custom field values from a source entity onto destination field keys. */
export function mapCustomValuesToEntity(
  sourceValues: Record<string, unknown> | null | undefined,
  destFields: Array<{ field_key: string; label: string; kind?: string }>,
): Record<string, unknown> {
  if (!sourceValues || Object.keys(sourceValues).length === 0) return {};
  const destCustom = destFields.filter((f) => f.kind === "custom" || !f.kind);
  const byKey = new Map(destCustom.map((f) => [f.field_key, f.field_key]));
  const byLabel = new Map(
    destCustom.map((f) => [normalizeCustomLabel(f.label), f.field_key] as const).filter(([lab]) => lab),
  );
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(sourceValues)) {
    if (val == null || val === "") continue;
    if (byKey.has(key)) {
      out[key] = val;
      continue;
    }
    // Source key may not exist on dest — try matching via shared naming conventions later.
    void key;
  }
  // Second pass: if source used a different key but same label isn't available client-side,
  // keep exact key matches only unless we also receive source labels.
  for (const [key, val] of Object.entries(sourceValues)) {
    if (val == null || val === "") continue;
    if (out[key] !== undefined) continue;
    const labKey = normalizeCustomLabel(key);
    const destKey = byLabel.get(labKey);
    if (destKey && out[destKey] === undefined) out[destKey] = val;
  }
  return out;
}

function normalizeCustomLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Merge mapped source values into existing custom values without overwriting filled keys. */
export function mergeCustomValues(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    if (out[k] != null && out[k] !== "") continue;
    out[k] = v;
  }
  return out;
}
