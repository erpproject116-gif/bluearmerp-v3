/** Split comma, semicolon, newline, or tab separated serial tokens. */
export function parseSerialBulkInput(raw: string): string[] {
  return raw
    .split(/[,;\n\r\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Deduplicate serials (case-insensitive), preserving first casing. */
export function dedupeSerials(serials: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of serials) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function formatSerialBulkList(serials: string[]): string {
  return serials.join(", ");
}

export function parseAndDedupeSerialBulkInput(raw: string): string[] {
  return dedupeSerials(parseSerialBulkInput(raw));
}
