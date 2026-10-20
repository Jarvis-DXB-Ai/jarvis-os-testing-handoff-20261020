select c.column_name, c.data_type, c.is_nullable, c.column_default
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'social_performance_post_observations'
order by c.ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.social_performance_post_observations'::regclass;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'social_performance_post_observations';
