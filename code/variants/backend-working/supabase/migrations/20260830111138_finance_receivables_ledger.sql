-- Finance receivables are balance-sheet awareness records. They deliberately
-- do not create revenue, invoices, or payment confirmations.
CREATE TABLE public.jarvis_finance_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text UNIQUE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  debtor_name text NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'outstanding',
  source_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jarvis_finance_receivables_debtor_name_check
    CHECK (char_length(debtor_name) BETWEEN 1 AND 180),
  CONSTRAINT jarvis_finance_receivables_description_check
    CHECK (char_length(description) BETWEEN 1 AND 300),
  CONSTRAINT jarvis_finance_receivables_amount_check CHECK (amount > 0),
  CONSTRAINT jarvis_finance_receivables_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT jarvis_finance_receivables_status_check
    CHECK (status IN ('outstanding', 'settled', 'written_off'))
);

CREATE INDEX jarvis_finance_receivables_open_currency_idx
  ON public.jarvis_finance_receivables (currency, debtor_name)
  WHERE status = 'outstanding';

CREATE INDEX jarvis_finance_receivables_client_idx
  ON public.jarvis_finance_receivables (client_id)
  WHERE client_id IS NOT NULL;

CREATE TRIGGER jarvis_finance_receivables_set_updated_at
  BEFORE UPDATE ON public.jarvis_finance_receivables
  FOR EACH ROW EXECUTE FUNCTION public.jarvis_finance_set_updated_at();

ALTER TABLE public.jarvis_finance_receivables ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.jarvis_finance_receivables TO service_role;
