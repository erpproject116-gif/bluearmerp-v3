import {
  DragDropProvider,
  DragDropSensors,
  createDraggable,
  createDroppable,
  useDragDropContext,
  type DragEvent,
} from "@thisbeyond/solid-dnd";
import type { JSX } from "solid-js";
import { For, Show, onMount } from "solid-js";
import { LoadingText } from "../shared/LoadingText";

export type KanbanColumn<T> = {
  id: string;
  label: string;
  items: T[];
  color?: string;
  icon?: string;
};

type BoardInnerProps<T> = {
  columns: KanbanColumn<T>[];
  getCardId: (item: T) => string | number;
  onDrop: (item: T, fromColumnId: string, toColumnId: string) => void;
  renderCard: (item: T) => JSX.Element;
  loading?: boolean;
  orientation?: "horizontal" | "vertical";
  collapsedIds?: string[];
  onToggleColumn?: (id: string) => void;
  class?: string;
};

function DraggableCard(props: { id: string; children: JSX.Element }) {
  const draggable = createDraggable(props.id);
  return <div ref={draggable.ref}>{props.children}</div>;
}

function DroppableColumn(props: { id: string; children: JSX.Element; class?: string }) {
  const droppable = createDroppable(props.id);
  return (
    <div ref={droppable.ref} class={props.class ?? "min-h-[8rem] flex-1"}>
      {props.children}
    </div>
  );
}

function KanbanBoardInner<T>(props: BoardInnerProps<T>) {
  const ctx = useDragDropContext();

  onMount(() => {
    if (!ctx) return;
    const [, { onDragEnd }] = ctx;
    onDragEnd((event: DragEvent) => {
      const { draggable, droppable } = event;
      if (!droppable) return;
      const cardId = String(draggable.id);
      const toColumnId = String(droppable.id);
      let fromColumnId: string | null = null;
      let item: T | undefined;

      for (const col of props.columns) {
        const found = col.items.find((i) => String(props.getCardId(i)) === cardId);
        if (found) {
          fromColumnId = col.id;
          item = found;
          break;
        }
      }
      if (!item || !fromColumnId || fromColumnId === toColumnId) return;
      props.onDrop(item, fromColumnId, toColumnId);
    });
  });

  const vertical = () => props.orientation === "vertical";
  const collapsed = (id: string) => (props.collapsedIds ?? []).includes(id);
  const styled = () => props.columns.some((c) => !!c.color);

  return (
    <div
      class={
        props.class ??
        (vertical()
          ? "hr-kb-board hr-kb-vertical"
          : "hr-kb-board hr-kb-horizontal")
      }
      classList={{
        "flex flex-col gap-3": vertical() && !styled(),
        "flex gap-4 overflow-x-auto pb-2": !vertical() && !styled(),
      }}
    >
      <For each={props.columns}>
        {(col) => {
          const shut = () => !!props.onToggleColumn && collapsed(col.id);
          const color = () => col.color || "#64748B";
          if (styled()) {
            return (
              <section
                class="hr-kb-lane"
                classList={{ "hr-kb-lane-col": shut() }}
                style={{ "--c": color() }}
                aria-label={`${col.label} lane, ${col.items.length} cards`}
              >
                <header class="hr-kb-lh">
                  <span class="hr-kb-dot" aria-hidden="true" />
                  <Show when={col.icon}>
                    <span class="hr-kb-ic" aria-hidden="true">
                      {col.icon}
                    </span>
                  </Show>
                  <span class="hr-kb-badge">{col.label}</span>
                  <span class="hr-kb-cnt">{col.items.length}</span>
                  <Show when={props.onToggleColumn}>
                    <button
                      type="button"
                      class="hr-btn hr-btn-sm hr-btn-ghost hr-kb-col"
                      aria-expanded={!shut()}
                      aria-label={`${shut() ? "Expand" : "Collapse"} ${col.label}`}
                      onClick={() => props.onToggleColumn?.(col.id)}
                    >
                      {shut() ? "▸" : "▾"}
                    </button>
                  </Show>
                </header>
                <Show when={!shut()}>
                  <DroppableColumn id={col.id} class="hr-kb-list">
                    <Show when={props.loading}>
                      <LoadingText class="py-4 text-center text-xs text-text-secondary" as="p" />
                    </Show>
                    <For each={col.items}>
                      {(item) => (
                        <DraggableCard id={String(props.getCardId(item))}>{props.renderCard(item)}</DraggableCard>
                      )}
                    </For>
                  </DroppableColumn>
                </Show>
              </section>
            );
          }
          return (
            <div
              class="flex flex-col rounded-xl border border-stroke bg-slate-50"
              classList={{
                "w-80 shrink-0": !vertical() && !shut(),
                "w-16 shrink-0": !vertical() && shut(),
                "w-full": vertical(),
              }}
            >
              <div class="border-b border-stroke px-3 py-2">
                <h3 class="text-sm font-semibold text-text-primary">
                  <Show when={props.onToggleColumn}>
                    <button
                      type="button"
                      class="mr-2 text-xs text-text-secondary"
                      aria-expanded={!shut()}
                      onClick={() => props.onToggleColumn?.(col.id)}
                    >
                      {shut() ? "Show" : "Hide"}
                    </button>
                  </Show>
                  {col.label}
                  <span class="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-normal text-text-secondary">
                    {col.items.length}
                  </span>
                </h3>
              </div>
              <Show when={!shut()}>
                <DroppableColumn id={col.id}>
                  <div class="space-y-2 p-2">
                    <Show when={props.loading}>
                      <LoadingText class="py-4 text-center text-xs text-text-secondary" as="p" />
                    </Show>
                    <For each={col.items}>
                      {(item) => (
                        <DraggableCard id={String(props.getCardId(item))}>{props.renderCard(item)}</DraggableCard>
                      )}
                    </For>
                  </div>
                </DroppableColumn>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

export function KanbanBoard<T>(props: BoardInnerProps<T>) {
  return (
    <DragDropProvider>
      <DragDropSensors>
        <KanbanBoardInner {...props} />
      </DragDropSensors>
    </DragDropProvider>
  );
}
