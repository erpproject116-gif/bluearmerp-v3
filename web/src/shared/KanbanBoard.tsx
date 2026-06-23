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

  return (
    <div class="flex gap-4 overflow-x-auto pb-2">
      <For each={props.columns}>
        {(col) => (
          <div class="flex w-72 shrink-0 flex-col rounded-xl border border-stroke bg-slate-50">
            <div class="border-b border-stroke px-3 py-2">
              <h3 class="text-sm font-semibold text-text-primary">
                {col.label}
                <span class="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-normal text-text-secondary">
                  {col.items.length}
                </span>
              </h3>
            </div>
            <DroppableColumn id={col.id}>
              <div class="space-y-2 p-2">
                <Show when={props.loading}>
                  <p class="py-4 text-center text-xs text-text-secondary">Loading…</p>
                </Show>
                <For each={col.items}>
                  {(item) => (
                    <DraggableCard id={String(props.getCardId(item))}>{props.renderCard(item)}</DraggableCard>
                  )}
                </For>
              </div>
            </DroppableColumn>
          </div>
        )}
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
