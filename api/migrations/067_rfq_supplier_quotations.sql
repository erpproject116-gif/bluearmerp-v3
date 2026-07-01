-- RFQ chain: request for quotation, supplier quotations, and lines.
begin;

create table if not exists public.rfq_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  rfq_date date not null default current_date,
  date_seq int not null default 1,
  rfq_no varchar(30) not null,
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'sent', 'closed', 'cancelled')),
  notes text,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rfq_no)
);

create table if not exists public.rfq_request_lines (
  id bigserial primary key,
  rfq_id bigint not null references public.rfq_requests(id) on delete cascade,
  line_no int not null,
  item_id bigint references public.inv_items(id),
  item_code varchar(50) not null default '',
  item_name varchar(255) not null default '',
  qty numeric(18,4) not null check (qty > 0),
  notes text,
  unique (rfq_id, line_no)
);

create table if not exists public.rfq_supplier_quotations (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  rfq_id bigint not null references public.rfq_requests(id) on delete cascade,
  partner_id bigint not null references public.inv_partners(id),
  quote_date date not null default current_date,
  quote_no varchar(30) not null,
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'received', 'accepted', 'rejected')),
  valid_until date,
  notes text,
  grand_total numeric(18,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, quote_no)
);

create table if not exists public.rfq_supplier_quotation_lines (
  id bigserial primary key,
  supplier_quotation_id bigint not null references public.rfq_supplier_quotations(id) on delete cascade,
  rfq_request_line_id bigint references public.rfq_request_lines(id),
  line_no int not null,
  item_id bigint references public.inv_items(id),
  qty numeric(18,4) not null check (qty > 0),
  unit_price numeric(18,4) not null default 0,
  line_total numeric(18,4) not null default 0,
  unique (supplier_quotation_id, line_no)
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('purchase_order.rfq', 'purchase_order', 'rfq', 'Request for Quotation', 45),
  ('purchase_order.rfq_create', 'purchase_order', 'rfq_create', 'Create RFQ', 46)
on conflict (permission_code) do nothing;

commit;
