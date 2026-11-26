-- Catalog evidence for #55. Run on the intended project's read-only connection.
-- Definition hashes help compare the same objects without exporting their SQL.
with relations as (
  select c.oid, n.nspname as schema_name, c.relname as object_name,
         c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm')
    and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
), evidence as (
  select 'relation' as kind, schema_name, object_name, '' as member,
    jsonb_build_object('rls_enabled', rls_enabled, 'rls_forced', rls_forced) as details
  from relations
  union all
  select 'column', r.schema_name, r.object_name, a.attname,
    jsonb_build_object('type', pg_catalog.format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull, 'identity', a.attidentity,
      'default_hash', md5(pg_catalog.pg_get_expr(d.adbin, d.adrelid)))
  from relations r
  join pg_catalog.pg_attribute a on a.attrelid = r.oid
  left join pg_catalog.pg_attrdef d on d.adrelid = r.oid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped
  union all
  select 'constraint', r.schema_name, r.object_name, c.conname,
    jsonb_build_object('validated', c.convalidated,
      'definition_hash', md5(pg_catalog.pg_get_constraintdef(c.oid)))
  from relations r
  join pg_catalog.pg_constraint c on c.conrelid = r.oid
  union all
  select 'index', r.schema_name, r.object_name, c.relname,
    jsonb_build_object('valid', i.indisvalid,
      'definition_hash', md5(pg_catalog.pg_get_indexdef(i.indexrelid)))
  from relations r
  join pg_catalog.pg_index i on i.indrelid = r.oid
  join pg_catalog.pg_class c on c.oid = i.indexrelid
  union all
  select 'trigger', r.schema_name, r.object_name, t.tgname,
    jsonb_build_object('enabled', t.tgenabled,
      'definition_hash', md5(pg_catalog.pg_get_triggerdef(t.oid)))
  from relations r
  join pg_catalog.pg_trigger t on t.tgrelid = r.oid
  where not t.tgisinternal
  union all
  select 'policy', p.schemaname, p.tablename, p.policyname,
    jsonb_build_object('command', p.cmd, 'roles', p.roles, 'mode', p.permissive,
      'using_hash', md5(p.qual), 'check_hash', md5(p.with_check))
  from pg_catalog.pg_policies p
  join relations r on r.schema_name = p.schemaname and r.object_name = p.tablename
  union all
  select 'routine', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid),
    jsonb_build_object('security_definer', p.prosecdef,
      'definition_hash', md5(pg_catalog.pg_get_functiondef(p.oid)),
      'anon_execute', pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_execute', pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')
  union all
  select 'table_access', r.schema_name, r.object_name, roles.role_name,
    jsonb_build_object(
      'select', pg_catalog.has_table_privilege(roles.role_name, r.oid, 'SELECT'),
      'insert', pg_catalog.has_table_privilege(roles.role_name, r.oid, 'INSERT'),
      'update', pg_catalog.has_table_privilege(roles.role_name, r.oid, 'UPDATE'),
      'delete', pg_catalog.has_table_privilege(roles.role_name, r.oid, 'DELETE'))
  from relations r
  cross join (values ('anon'), ('authenticated')) as roles(role_name)
)
select kind, schema_name, object_name, member, details
from evidence
order by kind, schema_name, object_name, member;
