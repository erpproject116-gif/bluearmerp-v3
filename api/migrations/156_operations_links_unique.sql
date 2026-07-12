-- Prevent duplicate ERP document links on the same work item.
create unique index if not exists uq_wm_links_work_item_doc
  on public.wm_links (work_item_id, doc_type, doc_id);
