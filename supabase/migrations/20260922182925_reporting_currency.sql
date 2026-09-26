-- The original Shopify amount/currency remain immutable. These columns hold
-- the amount converted into the administrator's reporting currency at the
-- order date, so aggregate reports never add unlike currencies together.
ALTER TABLE public.rotator_settings
  ADD COLUMN reporting_currency text NOT NULL DEFAULT 'USD',
  ADD CONSTRAINT rotator_settings_reporting_currency_check
    CHECK (reporting_currency ~ '^[A-Z]{3}$');

INSERT INTO public.rotator_settings (id, reporting_currency)
VALUES (true, 'USD')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.orders_log
  ADD COLUMN reporting_total numeric(12, 2),
  ADD COLUMN reporting_currency text,
  ADD COLUMN exchange_rate numeric(18, 8),
  ADD COLUMN exchange_rate_date date,
  ADD CONSTRAINT orders_log_reporting_currency_check
    CHECK (reporting_currency IS NULL OR reporting_currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT orders_log_exchange_rate_check
    CHECK (exchange_rate IS NULL OR exchange_rate > 0);

CREATE INDEX orders_log_reporting_currency_idx
  ON public.orders_log (reporting_currency, created_at DESC)
  WHERE reporting_total IS NOT NULL;
