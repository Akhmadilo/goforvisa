DO $$
BEGIN
  PERFORM cron.unschedule('daily_cash_report_hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('daily_cash_report_21');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily_cash_report_21_tashkent',
  '0 16 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--da47c250-b9f9-4500-9f76-b2b676e74aae.lovable.app/api/public/hooks/daily-cash-report',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvb2x6bnR4Ym90Y253eXBrYmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzUzODcsImV4cCI6MjA5NDUxMTM4N30.sssjNccX1bfEer9ITqa53KCzrdeh9pUQdxikrDnFH8A"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);