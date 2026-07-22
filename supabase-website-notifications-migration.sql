-- Run once in the Supabase SQL Editor before deploying the updated functions.
-- The browser keeps the raw random token; Supabase stores only its salted hash.

alter table public.enquiries
add column if not exists website_notification_token_hash text unique
check (website_notification_token_hash is null or char_length(website_notification_token_hash) = 64);
