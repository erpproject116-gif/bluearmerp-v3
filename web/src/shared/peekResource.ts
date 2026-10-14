import { untrack, type Resource } from "solid-js";

/**
 * Read a resource without suspending the page or throwing its error.
 * Solid's data.latest still suspends the first pending read and throws once the request fails.
 */
export function peekResource<T>(resource: Resource<T>): T | undefined {
  const state = resource.state;
  if (state === "unresolved" || state === "pending" || state === "errored") return undefined;
  return untrack(() => resource());
}
