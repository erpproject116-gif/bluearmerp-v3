/**
 * Product rule: document-line Description and item Spec name are the same concept.
 * Item master stores it as `spec_name`; sell/buy lines often use `description`.
 */

export function itemSpecAsLineDescription(item: {
  spec_name?: string | null;
}): string {
  return (item.spec_name ?? "").trim();
}

/** Prefer either column; keep both equal when hydrating PR/PO lines. */
export function coalesceSpecDescription(a?: string | null, b?: string | null): string {
  const x = (a ?? "").trim();
  if (x) return x;
  return (b ?? "").trim();
}

/** When editing one of the dual PR/PO columns, mirror into the other. */
export function syncSpecDescriptionPatch(patch: {
  spec_name?: string;
  description?: string;
}): { spec_name?: string; description?: string } {
  if (patch.spec_name !== undefined && patch.description === undefined) {
    return { spec_name: patch.spec_name, description: patch.spec_name };
  }
  if (patch.description !== undefined && patch.spec_name === undefined) {
    return { description: patch.description, spec_name: patch.description };
  }
  if (patch.spec_name !== undefined && patch.description !== undefined) {
    const v = coalesceSpecDescription(patch.description, patch.spec_name);
    return { spec_name: v, description: v };
  }
  return patch;
}
