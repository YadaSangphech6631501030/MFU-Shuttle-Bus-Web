-- Run once in this project's Supabase SQL Editor.
-- Bus locations are already public through GET /api/buses. Allow read-only
-- visitors on this one private channel; no Supabase user account is needed.
begin;

drop policy if exists "mfu_bus_receive" on realtime.messages;
create policy "mfu_bus_receive"
on realtime.messages for select to anon, authenticated
using (
  (select realtime.topic()) = 'mfu-buses'
  and extension = 'broadcast'
);

-- A restrictive rule also blocks browser writes if another permissive policy exists.
drop policy if exists "mfu_bus_no_client_send" on realtime.messages;
create policy "mfu_bus_no_client_send"
on realtime.messages as restrictive for insert to anon, authenticated
with check ((select realtime.topic()) is distinct from 'mfu-buses');

commit;

-- Inspect the installed policies. RLS is already enabled on realtime.messages.
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'realtime' and tablename = 'messages';
