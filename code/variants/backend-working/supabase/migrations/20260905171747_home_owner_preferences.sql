CREATE TABLE public.home_owner_notification_reads (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 255),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 280),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id,source_key)
);
CREATE TABLE public.home_owner_suggestion_dismissals (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 255),
  dedupe_identity text NOT NULL,
  evidence_hash text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  PRIMARY KEY (owner_id,dedupe_identity,evidence_hash),
  CHECK (expires_at > dismissed_at)
);
ALTER TABLE public.home_owner_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_owner_suggestion_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.home_owner_notification_reads,public.home_owner_suggestion_dismissals FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.home_owner_notification_reads,public.home_owner_suggestion_dismissals TO service_role;
CREATE INDEX home_owner_dismissal_expiry ON public.home_owner_suggestion_dismissals(owner_id,expires_at);
-- Deliberately do not attribute old global read/dismiss state to an invented user.
-- Archived-suggestion suppression remains global task lifecycle evidence.
