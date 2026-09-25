import { createEffect, createSignal } from "solid-js";
import { snapPageSize } from "./pageSize";

export function useListState(
  defaultSort: string,
  initialPageSize = 20,
  opts?: { defaultOrder?: "asc" | "desc"; defaultStatus?: string },
) {
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSizeSignal] = createSignal(snapPageSize(initialPageSize));
  const [q, setQ] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal(opts?.defaultStatus ?? "active");
  const [sort, setSort] = createSignal(defaultSort);
  const [order, setOrder] = createSignal<"asc" | "desc">(opts?.defaultOrder ?? "asc");

  const setPageSize = (n: number) => {
    setPageSizeSignal(snapPageSize(n));
    setPage(1);
  };

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

  return { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize };
}

/** Transaction/document lists: newest activity first (updated_at desc by default). */
export function useTransactionListState(
  defaultSort = "updated_at",
  initialPageSize = 20,
  opts?: { defaultStatus?: string },
) {
  return useListState(defaultSort, initialPageSize, {
    defaultOrder: "desc",
    defaultStatus: opts?.defaultStatus ?? "",
  });
}
