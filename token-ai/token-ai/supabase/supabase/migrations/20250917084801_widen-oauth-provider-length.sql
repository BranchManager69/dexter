-- widen oauth_provider columns to store full issuer URLs
ALTER TABLE public.account_links
  ALTER COLUMN oauth_provider TYPE varchar(128);

ALTER TABLE public.linking_codes
  ALTER COLUMN oauth_provider TYPE varchar(128);
