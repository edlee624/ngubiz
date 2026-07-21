# First-time setup — new accounts under `nguedwardlee@gmail.com`

This project is deliberately kept separate from the `edlee624@gmail.com` accounts
used by the other repos. Work through these in order.

> **You create the accounts.** Signing up and entering passwords is yours to do —
> the steps below pick up right after each account exists.

> ## ⚠️ Read first: the CLIs default to the OLD account
>
> Verified on this machine — the installed CLIs are authenticated as
> `edlee624`, **not** `nguedwardlee`:
>
> | Tool | Signed in as | Check with |
> |---|---|---|
> | Vercel | `edlee624-4296` | `vercel whoami` |
> | Supabase | old org (gigcute, glowupbook…) | `supabase projects list` |
> | git | global `edlee624@gmail.com` | `git config --global user.email` |
>
> Deploying without switching puts NGU on the wrong accounts. Switch first:
>
> ```bash
> vercel logout   && vercel login      # sign in as nguedwardlee@gmail.com
> supabase logout && supabase login    # sign in as nguedwardlee@gmail.com
> ```
>
> Git is already handled — this repo has a **local** identity override
> (`nguedwardlee@gmail.com`), so the global one doesn't apply here.

---

## 0. Local repo — DONE ✅

Already set up:
- `git init` on `main`, initial commit made
- **Repo-local** identity so commits here are attributed correctly:
  ```
  user.name  = Edward Lee
  user.email = nguedwardlee@gmail.com
  ```
  Your **global** identity is still `edlee624@gmail.com` — other repos unaffected.
- `credential.useHttpPath = true` on this repo, so git credentials are keyed by
  full repo path and won't silently reuse the other GitHub account's token.

Verify any time:
```bash
git -C . config user.email      # → nguedwardlee@gmail.com
git log -1 --format='%an <%ae>' # → Edward Lee <nguedwardlee@gmail.com>
```

---

## 1. GitHub

1. **Sign up / sign in** as `nguedwardlee@gmail.com` → create an **empty** repo
   (no README, no .gitignore — this repo already has both).
   Suggested name: `ngu-brokerage` or `biz-brokerage`.
2. Add the remote and push (replace `<user-or-org>` and `<repo>`):
   ```bash
   cd "C:\Users\edios\Documents\GitHub\biz-brokerage"
   git remote add origin https://nguedwardlee@github.com/<user-or-org>/<repo>.git
   git push -u origin main
   ```
   Putting `nguedwardlee@` in the URL makes the Windows credential manager
   authenticate as the **new** account rather than reusing `edlee624`'s token.

### If it pushes as the wrong account
Windows Credential Manager may have `edlee624`'s GitHub token cached. Either:
- **Cleanest:** install the GitHub CLI (`winget install GitHub.cli`), then
  `gh auth login` as the new account and `gh auth setup-git`. Use
  `gh auth switch` to move between the two accounts later.
- **Or:** Control Panel → Credential Manager → Windows Credentials → remove the
  `git:https://github.com` entry, then push again and sign in as the new account.
- **Or:** create a Personal Access Token on the new account and paste it when
  prompted for a password.

---

## 2. Supabase

1. **Sign up / sign in** as `nguedwardlee@gmail.com` → **New project**
   (region: US East is closest to NYC). Save the DB password somewhere safe.
2. **SQL Editor** → paste **`supabase/all_in_one.sql`** and hit Run. That single
   file is the migrations + seed concatenated in the right order, so it's one
   paste instead of three. Safe to re-run (all inserts are guarded).

   <details><summary>Prefer to run them separately?</summary>

   1. `supabase/migrations/0001_init.sql`    — schema, RLS, public RPCs
   2. `supabase/migrations/0002_brokers.sql` — brokers + listing/lead attribution
   3. `supabase/seed.sql`                    — 2 brokers + the 22-listing catalogue
   </details>

   **Project ref for this install:** `xwzlmpppdgbkywmrpvqf`
   (already wired into `public/config.js` as the `SUPABASE_URL`).
3. **Settings → API** → copy the **Project URL** and the **anon / public** key
   into `public/config.js`:
   ```js
   SUPABASE_URL: 'https://<your-ref>.supabase.co',
   SUPABASE_ANON_KEY: '<anon-public-key>',
   ```
   Only ever the **anon** key here — never `service_role`. The anon key is safe in
   the browser; RLS is what protects the data. (This is why `config.js` is
   committed — the static Vercel deploy needs it at runtime.)
4. **Authentication → Users → Add user** → your email + a password. The first
   user created is auto-promoted to `admin` by the `handle_new_user` trigger.
   That's your `/admin` login.
5. **Storage** → create two buckets:
   - `listing-photos` — **public** (photo URLs go on public listings)
   - `documents` — **private** (CIMs / financials, released after NDA)

---

## 3. Vercel

1. **Sign up / sign in** as `nguedwardlee@gmail.com`. Signing up *with GitHub*
   (the new account) is easiest — it links them automatically.
2. **Add New → Project → Import** the GitHub repo. Framework preset: **Other**.
   `vercel.json` already configures the static build + SPA rewrites; leave the
   build/output settings empty.
3. Deploy. Every push to `main` auto-deploys from then on.

CLI alternative (the `vercel` CLI is already installed):
```bash
cd "C:\Users\edios\Documents\GitHub\biz-brokerage"
vercel login        # sign in as nguedwardlee@gmail.com
vercel link
vercel --prod
```
> If the CLI is still signed in as the old account, run `vercel logout` first.

---

## 4. Post-deploy checks

- [ ] Homepage lists 22 businesses; the demo-mode banner is **gone**
      (it only shows when `config.js` still has placeholder keys)
- [ ] `/listing/laundromat-bronx-long-lease` shows $299,000 / $120,000 / $600,000
- [ ] Submit the contact form → the lead appears in `/admin` → **Leads**
- [ ] Sign the NDA on the active listing → appears in **NDAs** + a buyer lead
- [ ] `/admin` requires login and rejects a wrong password

---

## Notes

- **Custom domain**: Vercel → Project → Settings → Domains. Use a current-brand
  domain; the firm's older domain is retired and should not be reused.
- **Listing photos** are placeholders. Upload real ones to the `listing-photos`
  bucket and paste the public URLs into each listing in `/admin`.
- **Broker photos**: also placeholders (initials tiles). Upload real headshots to
  the `listing-photos` bucket and paste the URL in `/admin` → **Brokers** → Edit.
- **Catalogue edits**: don't hand-edit `public/js/demo-data.js` or
  `supabase/seed.sql` — both are generated. Edit `tools/build-catalogue.mjs` and
  re-run `node tools/build-catalogue.mjs`. Once live on Supabase, manage listings
  and brokers in `/admin` instead; the seed only bootstraps an empty database.
