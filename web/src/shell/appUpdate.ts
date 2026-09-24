import { createSignal } from "solid-js";

const [updateReady, setUpdateReady] = createSignal(false);
let acceptUpdate: (() => Promise<void>) | null = null;
let updateWaiting = false;
let dismissedUntilVisible = false;

export { updateReady };

export function registerAcceptUpdate(fn: () => Promise<void>) {
  acceptUpdate = fn;
}

export function noteUpdateWaiting() {
  updateWaiting = true;
  if (!dismissedUntilVisible) setUpdateReady(true);
}

export function dismissUpdateUntilVisible() {
  dismissedUntilVisible = true;
  setUpdateReady(false);
}

export function promptUpdateIfWaiting() {
  dismissedUntilVisible = false;
  if (updateWaiting) setUpdateReady(true);
}

export async function runAcceptUpdate() {
  setUpdateReady(false);
  if (acceptUpdate) await acceptUpdate();
}
