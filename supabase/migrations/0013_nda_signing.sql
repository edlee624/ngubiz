-- ============================================================================
-- Online NDA signing (the /nda page).
--
-- Extends the ndas table with the captured signature + the Didit identity-
-- verification reference, and adds submit_nda(): a SECURITY DEFINER RPC that
-- records a signed NDA, creates/links a buyer lead, and returns the business
-- name so the server can build the PDF. The public (anon) can call it, but can
-- never READ ndas or leads back — staff-only select policies still apply.
-- Safe to re-run.
-- ============================================================================

alter table public.ndas add column if not exists signature       text;   -- PNG data URL, or the typed name
alter table public.ndas add column if not exists signature_type  text;   -- 'drawn' | 'typed'
alter table public.ndas add column if not exists didit_session_id text;
alter table public.ndas add column if not exists didit_status    text;   -- e.g. 'Approved'

create or replace function public.submit_nda(
  p_listing_id        uuid,
  p_name              text,
  p_email             text,
  p_phone             text default null,
  p_signature         text default null,
  p_signature_type    text default 'typed',
  p_didit_session_id  text default null,
  p_didit_status      text default null,
  p_agreement_version text default 'v1'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_listing record;
  v_lead_id uuid;
  v_nda_id  uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'Name and email are required';
  end if;
  select id, title, ref_code, status into v_listing
    from public.listings where id = p_listing_id;
  if v_listing.id is null then
    raise exception 'Business not found';
  end if;

  -- Upsert a buyer lead for this signer.
  select id into v_lead_id from public.leads
    where email = p_email and type = 'buyer' limit 1;
  if v_lead_id is null then
    insert into public.leads (type, stage, listing_id, name, email, phone, message, source)
    values ('buyer', 'contacted', p_listing_id, p_name, p_email, p_phone,
            'Signed NDA for ' || coalesce(v_listing.title, 'a listing'), 'nda')
    returning id into v_lead_id;
  else
    update public.leads
       set phone = coalesce(p_phone, phone),
           listing_id = coalesce(listing_id, p_listing_id),
           updated_at = now()
     where id = v_lead_id;
  end if;

  -- Link the lead to this business (many-to-many).
  insert into public.lead_listings (lead_id, listing_id)
    values (v_lead_id, p_listing_id) on conflict do nothing;

  insert into public.ndas (listing_id, lead_id, signer_name, signer_email, signer_phone,
                           signature, signature_type, didit_session_id, didit_status,
                           agreement_version, signed_at)
  values (p_listing_id, v_lead_id, p_name, p_email, p_phone,
          p_signature, p_signature_type, p_didit_session_id, p_didit_status,
          coalesce(p_agreement_version, 'v1'), now())
  returning id into v_nda_id;

  return jsonb_build_object('nda_id', v_nda_id, 'business', v_listing.title, 'ref_code', v_listing.ref_code);
end; $$;

grant execute on function public.submit_nda(uuid, text, text, text, text, text, text, text, text)
  to anon, authenticated;
