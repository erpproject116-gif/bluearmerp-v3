import { createEffect, createSignal } from "solid-js";

export function useListState(
  defaultSort: string,
  pageSize = 25,
  opts?: { defaultOrder?: "asc" | "desc"; defaultStatus?: string },
) {
  const [page, setPage] = createSignal(1);
  const [q, setQ] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal(opts?.defaultStatus ?? "active");
  const [sort, setSort] = createSignal(defaultSort);
  const [order, setOrder] = createSignal<"asc" | "desc">(opts?.defaultOrder ?? "asc");

  createEffect(() => {
    q();
    statusFilter();
    setPage(1);
  });

  const toggleSort = (key: string) => {
    if (sort() === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("asc");
    }
    setPage(1);
  };

  return { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize };
}
