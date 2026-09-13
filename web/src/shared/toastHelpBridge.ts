/** Optional bridge so toast chrome can open Help without importing the panel tree. */
type OpenHelpFn = (query: string) => void;

let openHelpFn: OpenHelpFn | null = null;

export function registerToastHelpOpener(fn: OpenHelpFn | null) {
  openHelpFn = fn;
}

export function openToastHelp(query: string) {
  const q = query.trim();
  if (!q || !openHelpFn) return false;
  openHelpFn(q);
  return true;
}

export function toastHelpAvailable(): boolean {
  return openHelpFn != null;
}
