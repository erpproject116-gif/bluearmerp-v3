import { Show } from "solid-js";

type Props = {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md";
  title?: string;
  class?: string;
};

const sizeClass: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
};

export function UserAvatar(props: Props) {
  const initial = () => {
    const parts = props.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    return (parts[0]?.charAt(0) ?? "?").toUpperCase();
  };

  return (
    <span
      class={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700 ${sizeClass[props.size ?? "sm"]} ${props.class ?? ""}`}
      title={props.title ?? props.name}
    >
      <Show when={props.avatarUrl?.trim()} fallback={initial()}>
        {(url) => (
          <img
            src={url()}
            alt=""
            class="h-full w-full object-cover"
            referrerpolicy="no-referrer"
            loading="lazy"
          />
        )}
      </Show>
    </span>
  );
}
