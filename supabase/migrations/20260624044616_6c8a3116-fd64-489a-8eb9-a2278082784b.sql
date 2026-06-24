CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old schedule if present
DO $$
BEGIN
  PERFORM cron.unschedule('work_report_reminder_20');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- 15:00 UTC = 20:00 Asia/Tashkent
SELECT cron.schedule(
  'work_report_reminder_20',
  '0 15 * * *',
  $$ SELECT net.http_post(
       url := current_setting('app.site_url', true) || '/api/public/hooks/work-report-reminder',
       headers := '{"Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);