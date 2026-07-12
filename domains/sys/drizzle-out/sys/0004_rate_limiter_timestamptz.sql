DO $$
DECLARE
  target_column_name text;
BEGIN
  FOREACH target_column_name IN ARRAY ARRAY['createdAt', 'updatedAt', 'windowStart', 'resetAt', 'blockedAt', 'lastViolationAt']
  LOOP
    IF EXISTS (
      SELECT 1
        FROM information_schema.columns AS c
       WHERE table_schema = 'public'
         AND table_name = 'sys_rate_limiters'
         AND c.column_name = target_column_name
         AND data_type = 'timestamp without time zone'
    ) THEN
      EXECUTE format(
        'ALTER TABLE "sys_rate_limiters" ALTER COLUMN %I TYPE timestamp with time zone USING %I AT TIME ZONE ''UTC''',
        target_column_name,
        target_column_name
      );
    END IF;
  END LOOP;
END $$;
