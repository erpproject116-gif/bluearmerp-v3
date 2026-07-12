import { createSignal, onCleanup, Show } from "solid-js";
import type { WorkItem } from "../../shared/useOperations";

const HOUR_H = 56;

export function parseHourFraction(t?: string | null): number | null {
  if (!t) return null;
  const parts = t.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (Number.isNaN(h)) return null;
  return h + (Number.isNaN(m) ? 0 : m) / 60;
}

export function snapQuarter(f: number): number {
  const clamped = Math.max(0, Math.min(24 - 0.25, f));
  return Math.round(clamped * 4) / 4;
}

export function fractionToTime(f: number): string {
  const snapped = snapQuarter(f);
  const h = Math.floor(snapped);
  const m = Math.round((snapped - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function eventLayout(item: WorkItem): { top: number; height: number; label: string; start: number; end: number } {
  const start = parseHourFraction(item.start_time) ?? 0;
  let end = parseHourFraction(item.end_time);
  if (end == null || end <= start) end = Math.min(start + 1, 24);
  const top = start * HOUR_H;
  const height = Math.max((end - start) * HOUR_H, HOUR_H * 0.5);
  const label = item.end_time
    ? `${item.start_time} – ${item.end_time}`
    : (item.start_time ?? "");
  return { top, height, label, start, end };
}

type DragMode = "move" | "resize";

export function TimedDayEvent(props: {
  item: WorkItem;
  canEdit: boolean;
  gridEl: () => HTMLElement | undefined;
  onOpen: (item: WorkItem) => void;
  onCommitTimes: (item: WorkItem, startTime: string, endTime: string) => void;
}) {
  const [preview, setPreview] = createSignal<{ top: number; height: number; label: string } | null>(null);
  let suppressClick = false;
  let drag: {
    mode: DragMode;
    startY: number;
    origStart: number;
    origEnd: number;
    moved: boolean;
  } | null = null;

  const layout = () => preview() ?? (() => {
    const l = eventLayout(props.item);
    return { top: l.top, height: l.height, label: l.label };
  })();

  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const dHours = dy / HOUR_H;
    drag.moved = drag.moved || Math.abs(dy) > 4;
    if (drag.mode === "move") {
      const dur = drag.origEnd - drag.origStart;
      let ns = snapQuarter(drag.origStart + dHours);
      let ne = ns + dur;
      if (ne > 24) {
        ne = 24;
        ns = snapQuarter(ne - dur);
      }
      if (ns < 0) {
        ns = 0;
        ne = snapQuarter(dur);
      }
      setPreview({
        top: ns * HOUR_H,
        height: Math.max((ne - ns) * HOUR_H, HOUR_H * 0.5),
        label: `${fractionToTime(ns)} – ${fractionToTime(ne)}`,
      });
    } else {
      let ne = snapQuarter(drag.origEnd + dHours);
      if (ne <= drag.origStart + 0.25) ne = drag.origStart + 0.25;
      if (ne > 24) ne = 24;
      setPreview({
        top: drag.origStart * HOUR_H,
        height: Math.max((ne - drag.origStart) * HOUR_H, HOUR_H * 0.5),
        label: `${fractionToTime(drag.origStart)} – ${fractionToTime(ne)}`,
      });
    }
  };

  const endDrag = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    const d = drag;
    drag = null;
    const p = preview();
    setPreview(null);
    if (!d || !p || !d.moved) return;
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
    const start = p.top / HOUR_H;
    const end = start + p.height / HOUR_H;
    props.onCommitTimes(props.item, fractionToTime(start), fractionToTime(end));
  };

  const begin = (mode: DragMode, e: PointerEvent) => {
    if (!props.canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const l = eventLayout(props.item);
    drag = {
      mode,
      startY: e.clientY,
      origStart: l.start,
      origEnd: l.end,
      moved: false,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  };

  onCleanup(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  });

  return (
    <div
      class="pointer-events-auto absolute left-1 right-2 overflow-hidden rounded-md border border-blue-700/30 bg-blue-600 text-left text-xs font-medium text-white shadow-sm"
      classList={{ "opacity-90 ring-2 ring-white/50": !!preview() }}
      style={{
        top: `${layout().top}px`,
        height: `${layout().height}px`,
        cursor: props.canEdit ? "grab" : "pointer",
      }}
      title={`${layout().label} ${props.item.title} — drag to move, bottom edge to resize`}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).dataset.resize === "1") return;
        begin("move", e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (suppressClick || preview()) return;
        props.onOpen(props.item);
      }}
    >
      <div class="truncate px-2 pt-1">{props.item.title}</div>
      <div class="truncate px-2 text-[10px] opacity-90">{layout().label}</div>
      <Show when={props.item.reminder_offset_minutes && props.item.reminder_offset_minutes > 0}>
        <div class="px-2 pb-1 text-[10px] opacity-80">Reminder set</div>
      </Show>
      <Show when={props.canEdit}>
        <div
          data-resize="1"
          class="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-white/20 hover:bg-white/40"
          onPointerDown={(e) => begin("resize", e)}
        />
      </Show>
    </div>
  );
}

export { HOUR_H };
