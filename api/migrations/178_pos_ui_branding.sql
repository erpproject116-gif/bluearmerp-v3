-- POS register UI labels + theme (terminology and color palette).
begin;

alter table public.pos_settings
  add column if not exists ui_labels jsonb not null default '{}'::jsonb,
  add column if not exists theme jsonb not null default '{}'::jsonb;

comment on column public.pos_settings.ui_labels is
  'Tenant overrides for POS button/form labels (manage, discount, commission, pay, …).';
comment on column public.pos_settings.theme is
  'POS color palette: primary, accent, header_bg, header_text, surface, button_text.';

commit;
