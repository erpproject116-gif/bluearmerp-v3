-- Production module display name (sidebar); permissions stay manufacturing.*
begin;

update public.module_registry
set module_name = 'Production'
where module_code = 'manufacturing';

commit;
