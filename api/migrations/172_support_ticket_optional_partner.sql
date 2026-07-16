-- Support tickets: allow create without a linked partner (internal / floating Help ticket).
begin;

alter table public.sup_support_tickets
  alter column partner_id drop not null;

commit;
