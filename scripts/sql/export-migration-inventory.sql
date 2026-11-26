-- Run on the intended project's read-only connection. Copy the single inventory value.
select json_build_object(
  'complete', not pg_catalog.row_security_active('supabase_migrations.schema_migrations'),
  'migrations', coalesce(
    json_agg(json_build_object('version', version, 'name', name) order by version),
    '[]'::json
  )
) as inventory
from supabase_migrations.schema_migrations;
