-- Starter data: one laundry room with two washers and two dryers
with loc as (
  insert into public.locations (name, address)
  select 'Main Laundry Room', 'Ground floor'
  where not exists (select 1 from public.locations)
  returning id
)
insert into public.machines (location_id, name, type)
select loc.id, m.name, m.type::public.machine_type
from loc,
  (values ('Washer 1','washer'), ('Washer 2','washer'), ('Dryer 1','dryer'), ('Dryer 2','dryer')) as m(name, type);
