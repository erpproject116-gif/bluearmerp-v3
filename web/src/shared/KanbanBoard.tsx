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
};

function DraggableCard(props: { id: string; children: JSX.Element }) {
  const draggable = createDraggable(props.id);
  return <div ref={draggable.ref}>{props.children}</div>;
}

function DroppableColumn(props: { id: string; children: JSX.Element }) {
  const droppable = createDroppable(props.id);
  return (
    <div ref={droppable.ref} class="min-h-[8rem] flex-1">
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

  return (
    <div class={vertical() ? "flex flex-col gap-3" : "flex gap-4 overflow-x-auto pb-2"}>
      <For each={props.columns}>
        {(col) => {
          const shut = () => !!props.onToggleColumn && collapsed(col.id);
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
