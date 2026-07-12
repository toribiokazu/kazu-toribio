# Deploying a StockFlow sandbox

StockFlow is a single Node 22 process with an embedded SQLite database file.
That means: **any host works as long as it gives you a persistent disk.**
Serverless platforms (Vercel, Netlify, Cloudflare Pages) will lose the
database on every deploy/restart — don't use them for this app.

## First-run setup and accounts

The very first time you open a fresh instance, StockFlow shows a **setup
screen** that creates the **super admin** account (name, email, password).
After that, every visit requires signing in — there is no anonymous access.

The super admin then adds people under **Users & Roles** (top nav bar) and
chooses one of three roles for each:

- **Super admin** — everything, including Users & Roles and data Export.
- **Admin** — exactly the areas the super admin ticks (you decide whether
  admins can see Purchasing, the developer tools, integrations, etc.).
- **User** — a fixed set: day-to-day operations and the directory.

So sharing a client sandbox is: deploy, open it once to create your super
admin, then create a login for the client at whatever role you want. No
shared password to leak.

Environment variables (all optional):

| Variable | Purpose |
| --- | --- |
| `STOCKFLOW_DATA_DIR` | Where the SQLite file lives (the Docker image sets `/data`) |
| `RESEND_API_KEY` | Enables invoice emailing via [Resend](https://resend.com) (free tier: 100 emails/day) |
| `STOCKFLOW_FROM_EMAIL` | The From address for invoice emails (must be verified in Resend; `onboarding@resend.dev` works for testing) |
| `STOCKFLOW_COMPANY_NAME` | Company name shown on invoices (default "StockFlow") |

> Accounts live in the database, so they persist as long as the `/data`
> volume does. There is no longer a `STOCKFLOW_PASSWORD` env var — user
> accounts replace it entirely.

## Sending invoices by email

Invoice emailing uses Resend because it needs no SMTP setup: create a free
account at resend.com, add an API key, and set `RESEND_API_KEY` +
`STOCKFLOW_FROM_EMAIL`. Until those are set, the Send button returns a clear
"not configured" message — everything else (creating, printing, marking paid)
works without it.

## Option 1 — Railway (~$5/mo, easiest)

1. Push this repo to GitHub and sign in at railway.app with GitHub.
2. New Project → Deploy from GitHub repo → pick this repo. Railway detects the Dockerfile.
3. In the service: **Settings → Volumes → Add volume**, mount path `/data`.
4. **Settings → Networking → Generate domain** — open that URL once to
   create your super admin, then add a login for your client.

## Option 2 — Fly.io (~$3–5/mo)

```bash
fly launch --copy-config --no-deploy   # uses fly.toml in this repo
fly volumes create stockflow_data --size 1
fly deploy
# then open the app URL once to create your super admin account
```

## Option 3 — Free: Oracle Cloud "Always Free" VM (or any VPS)

Oracle's Always Free tier gives you a permanently free VM that comfortably
runs StockFlow (Google Cloud's free `e2-micro` also works). On the VM:

```bash
docker build -t stockflow .
docker run -d --name stockflow --restart unless-stopped \
  -p 3000:3000 -v stockflow-data:/data \
  stockflow
```

Put HTTPS in front with Caddy (automatic certificates):

```bash
docker run -d --name caddy --restart unless-stopped --network host caddy \
  caddy reverse-proxy --from your-domain.example.com --to localhost:3000
```

No Docker? Bare metal works too: `npm install && npm run build`, then run
`npm run start` under systemd or pm2. Open the URL once to create the super
admin account.

## Option 4 — Free: your own machine + Cloudflare Tunnel

Good for a demo call or a short test window; the URL only works while your
machine is on.

```bash
npm run build && npm run start
# in another terminal (no Cloudflare account needed for a quick tunnel):
cloudflared tunnel --url http://localhost:3000
```

`cloudflared` prints a `https://….trycloudflare.com` URL you can share.

## A note on Render's free tier

Render's free web services have **no persistent disk** and spin down when
idle — the sandbox database would be wiped. Use the Starter plan with a disk
(`render.yaml` in this repo is set up for it), or pick one of the options above.

## Seeding data on a deployed instance

`npm run seed` talks to `http://localhost:3000` by default. On a brand-new
instance (before you've created the super admin) it runs straight through.
Once accounts exist, give it an API key instead — create one under
**Developer → API Keys**:

```bash
STOCKFLOW_URL=https://your-sandbox.example.com \
STOCKFLOW_API_KEY=sfk_... \
node scripts/seed.mjs
```

For a client sandbox you'll usually skip the demo seed and use
**Import Data** in the app to load their real SOS Inventory CSV exports.
