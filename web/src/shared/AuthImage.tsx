import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { apiAbsoluteUrl, getAccessToken } from "./api";

type AuthImageProps = {
  src?: string | null;
  alt: string;
  class?: string;
  fallback?: () => any;
};

/**
 * Renders an image from an authenticated API endpoint. Because the API uses
 * bearer-token auth, a plain <img src> cannot authenticate; we fetch the bytes
 * with the token and expose an object URL instead.
 */
export function AuthImage(props: AuthImageProps) {
  const [objectUrl, setObjectUrl] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);

  createEffect(() => {
    const src = props.src;
    // Reset when src changes.
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFailed(false);
    if (!src) return;
    let revoked = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(apiAbsoluteUrl(src), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const blob = await res.blob();
        if (revoked) return;
        setObjectUrl(URL.createObjectURL(blob));
      } catch {
        setFailed(true);
      }
    })();
    onCleanup(() => {
      revoked = true;
    });
  });

  onCleanup(() => {
    const u = objectUrl();
    if (u) URL.revokeObjectURL(u);
  });

  return (
    <Show when={props.src && !failed() && objectUrl()} fallback={props.fallback?.()}>
      <img src={objectUrl()!} alt={props.alt} class={props.class} />
    </Show>
  );
}
