import type { UserDataScope } from "../../../shared/usePermissions";

export const SCOPE_OPTION_PAGE_SIZE = 500;

function key(scopeType: string, recordId: number) {
  return `${scopeType}:${recordId}`;
}

/** Add the loaded rows. Rows past the page stay as they were. */
export function selectLoadedScopes(scopes: UserDataScope[], scopeTypes: string[], recordIds: number[]): UserDataScope[] {
  const have = new Set(scopes.map((s) => key(s.scope_type, s.record_id)));
  const add: UserDataScope[] = [];
  for (const id of recordIds) {
    for (const scopeType of scopeTypes) {
      const k = key(scopeType, id);
      if (have.has(k)) continue;
      have.add(k);
      add.push({ scope_type: scopeType, record_id: id });
    }
  }
  return add.length === 0 ? scopes : [...scopes, ...add];
}

/**
 * Clear every scope of these types, including rows that were not on the loaded page.
 * A partial clear would leave hidden grants in place.
 */
export function clearScopeTypes(scopes: UserDataScope[], scopeTypes: string[]): UserDataScope[] {
  const drop = new Set(scopeTypes);
  return scopes.filter((s) => !drop.has(s.scope_type));
}

export function setScopeChecked(
  scopes: UserDataScope[],
  scopeType: string,
  recordId: number,
  checked: boolean,
): UserDataScope[] {
  const without = scopes.filter((s) => !(s.scope_type === scopeType && s.record_id === recordId));
  if (!checked) return without;
  return [...without, { scope_type: scopeType, record_id: recordId }];
}

/** A location checkbox writes both location and warehouse, and clears both when off. */
export function setLocationScope(scopes: UserDataScope[], recordId: number, checked: boolean): UserDataScope[] {
  return setScopeChecked(
    setScopeChecked(scopes, "location", recordId, checked),
    "warehouse",
    recordId,
    checked,
  );
}
