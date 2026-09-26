CREATE TABLE public.currency_rates (
  base_currency text NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text NOT NULL CHECK (quote_currency ~ '^[A-Z]{3}$'),
  effective_date date NOT NULL,
  rate numeric(18, 8) NOT NULL CHECK (rate > 0),
  source text NOT NULL CHECK (source IN ('market', 'manual')),
  provider_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (base_currency, quote_currency, effective_date),
  CHECK (base_currency <> quote_currency)
);

COMMENT ON TABLE public.currency_rates IS 'Saved market and operator-entered exchange rates. Original Shopify amounts are never changed.';

ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.currency_rates TO service_role;

ALTER TABLE public.orders_log
  ADD COLUMN exchange_source text,
  ADD CONSTRAINT orders_log_exchange_source_check
    CHECK (exchange_source IS NULL OR exchange_source IN ('market', 'manual', 'identity'));

CREATE INDEX currency_rates_lookup_idx
  ON public.currency_rates (base_currency, quote_currency, effective_date DESC);
