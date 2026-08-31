-- ============================================================================
-- Email the broker whenever a lead comes in from the website.
--
-- On INSERT into leads (only form submissions, source = 'website'), a trigger
-- POSTs to the Resend API via pg_net and sends a formatted notification. The
-- Resend API key lives in Supabase Vault (encrypted) — never in the repo — and
-- is read only inside this SECURITY DEFINER function.
--
-- SETUP (once, separately — see the notes at the bottom):
--   1. Verify a sending domain in Resend and create an API key.
--   2. Store the key:  select vault.create_secret('re_your_key', 'resend_api_key');
--   3. Set the from/to (already defaulted below for NGU).
--
-- pg_net is asynchronous, so a slow or failing email never blocks or fails the
-- lead insert — the lead is always saved regardless.
-- ============================================================================

create extension if not exists pg_net;

-- Small HTML escaper for values dropped into the email body.
create or replace function public.html_escape(t text)
returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

create or replace function public.notify_new_lead()
returns trigger
language plpgsql security definer set search_path = public, extensions, vault, net as $$
declare
  v_key     text;
  v_from    text := 'NGU Business Real Estate <notifications@ngubiz.com>';
  v_to      text := 'nguedwardlee@gmail.com';
  v_listing text;
  v_rows    text := '';
  v_html    text;
  v_amount  text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if v_key is null then
    return new;   -- not configured yet; do nothing
  end if;

  if new.listing_id is not null then
    select title into v_listing from public.listings where id = new.listing_id;
  end if;
  if new.investment_amount is not null then
    v_amount := '$' || to_char(new.investment_amount, 'FM999,999,999');
  end if;

  -- Build the detail rows, skipping empty fields.
  v_rows := v_rows || '<tr><td style="padding:4px 12px 4px 0;color:#5b6b7f">Type</td><td>' || public.html_escape(new.type::text) || '</td></tr>';
  if coalesce(new.email, '') <> '' then
    v_rows := v_rows || '<tr><td style="padding:4px 12px 4px 0;color:#5b6b7f">Email</td><td><a href="mailto:' || public.html_escape(new.email) || '">' || public.html_escape(new.email) || '</a></td></tr>';
  end if;
  if coalesce(new.phone, '') <> '' then
    v_rows := v_rows || '<tr><td style="padding:4px 12px 4px 0;color:#5b6b7f">Phone</td><td>' || public.html_escape(new.phone) || '</td></tr>';
  end if;
  if coalesce(new.company, '') <> '' then
    v_rows := v_rows || '<tr><td style="padding:4px 12px 4px 0;color:#5b6b7f">Company</td><td>' || public.html_escape(new.company) || '</td></tr>';
  end if;
  if v_listing is not null then
    v_rows := v_rows || '<tr><td style="padding:4px 12px 4px 0;color:#5b6b7f">Listing</td><td>' || public.html_escape(v_listing) || '</td></tr>';
  end if;
  if v_amount is not null then
    v_rows := v_rows || '<tr><td style="padding:4px 12px 4px 0;color:#5b6b7f">To invest</td><td>' || v_amount || '</td></tr>';
  end if;
  if coalesce(array_length(new.interested_categories, 1), 0) > 0 then
    v_rows := v_rows || '<tr><td style="padding:4px 12px 4px 0;color:#5b6b7f">Interested in</td><td>' || public.html_escape(array_to_string(new.interested_categories, ', ')) || '</td></tr>';
  end if;
  if coalesce(new.timeframe, '') <> '' then
    v_rows := v_rows || '<tr><td style="padding:4px 12px 4px 0;color:#5b6b7f">Timeframe</td><td>' || public.html_escape(new.timeframe) || '</td></tr>';
  end if;

  v_html :=
    '<div style="font-family:Arial,sans-serif;color:#1a2433">' ||
    '<h2 style="color:#10243e">New ' || public.html_escape(new.type::text) || ' lead from the website</h2>' ||
    '<p style="font-size:16px;font-weight:bold;margin:0 0 12px">' || public.html_escape(coalesce(new.name, '(no name)')) || '</p>' ||
    '<table style="font-size:14px;border-collapse:collapse">' || v_rows || '</table>' ||
    case when coalesce(new.message, '') <> ''
      then '<p style="color:#5b6b7f;margin:16px 0 4px">Message</p><p style="white-space:pre-wrap;background:#f4f6f9;padding:12px;border-radius:8px;margin:0">' || public.html_escape(new.message) || '</p>'
      else '' end ||
    '<p style="margin-top:20px"><a href="https://www.ngubiz.com/admin.html" style="background:#1d6fb8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open the admin</a></p>' ||
    '</div>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', v_from,
      'to', jsonb_build_array(v_to),
      'reply_to', coalesce(new.email, v_to),
      'subject', 'New ' || new.type::text || ' lead: ' || coalesce(new.name, '(no name)'),
      'html', v_html
    )
  );

  return new;
exception when others then
  return new;   -- never let a notification failure roll back the lead
end; $$;

drop trigger if exists leads_notify_new on public.leads;
create trigger leads_notify_new
  after insert on public.leads
  for each row when (new.source = 'website')
  execute function public.notify_new_lead();
