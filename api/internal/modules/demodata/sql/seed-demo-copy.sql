-- Per-industry transactional copy overlay — BASE (no-op).
-- Industry folders (retail/pharmacy/restaurant) override this file to re-theme the
-- printed narrative (quotation validity/terms/notes, payment terms) on seeded
-- documents. Manufacturing and legacy/unspecified tenants keep the original base
-- document copy, so this base file intentionally does nothing.
begin;
do $$
begin
  raise notice 'seed-demo-copy: base no-op (default document copy retained)';
end $$;
commit;
