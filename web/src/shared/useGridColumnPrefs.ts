import { createEffect, createMemo, createSignal } from "solid-js";

const STORAGE_PREFIX = "bluearm:grid.columns:";

export type GridColumnPrefMeta = {
  key: string;
  header: string;
  /** When false, column always shows and is omitted from the picker. Default true. */
  hideable?: boolean;
};

function storageKey(prefsKey: string) {
  return `${STORAGE_PREFIX}${prefsKey}`;
}

function readHidden(prefsKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(prefsKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeHidden(prefsKey: string, hidden: string[]) {
  try {
    localStorage.setItem(storageKey(prefsKey), JSON.stringify(hidden));
  } catch {
    /* private mode */
  }
}

/**
 * Personal show/hide prefs for SpreadsheetGrid lists.
 * Tenant-hidden columns should already be removed from `columns` before calling.
 */
export function useGridColumnPrefs(
  prefsKey: () => string | undefined,
  columns: () => GridColumnPrefMeta[],
) {
  const [hiddenKeys, setHiddenKeys] = createSignal<string[]>([]);

  createEffect(() => {
    const key = prefsKey();
    if (!key) {
      setHiddenKeys([]);
      return;
    }
    setHiddenKeys(readHidden(key));
  });

  const hideableColumns = createMemo(() => columns().filter((c) => c.hideable !== false));

  const visibleColumns = createMemo(() => {
    const hidden = new Set(hiddenKeys());
    return columns().filter((c) => c.hideable === false || !hidden.has(c.key));
  });

  const isHidden = (key: string) => hiddenKeys().includes(key);

  const setColumnVisible = (key: string, visible: boolean) => {
    const pk = prefsKey();
    if (!pk) return;
    const col = columns().find((c) => c.key === key);
    if (!col || col.hideable === false) return;
    setHiddenKeys((prev) => {
      const next = visible ? prev.filter((k) => k !== key) : prev.includes(key) ? prev : [...prev, key];
      writeHidden(pk, next);
      return next;
    });
  };

  const showAll = () => {
    const pk = prefsKey();
    if (!pk) return;
    setHiddenKeys([]);
    writeHidden(pk, []);
  };

  const enabled = () => Boolean(prefsKey());

  return {
    enabled,
    hideableColumns,
    visibleColumns,
    isHidden,
    setColumnVisible,
    showAll,
  };
}
