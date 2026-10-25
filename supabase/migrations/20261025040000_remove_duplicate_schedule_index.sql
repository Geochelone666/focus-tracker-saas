-- Focus V1 post-deploy: avoid maintaining the same (user_id, scheduled_date) btree twice.
-- The original schedules_user_date_idx exists in earlier planning migrations.
-- The planned/actual migration introduced schedules_owner_date with the same definition.
-- Drop only the redundant newer index; preserve the original, query paths, and data.
drop index if exists public.schedules_owner_date;
