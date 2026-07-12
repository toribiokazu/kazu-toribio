# Deploying a StockFlow sandbox

StockFlow is a single Node 22 process with an embedded SQLite database file.
That means: **any host works as long as it gives you a persistent disk.**
Serverless platforms (Vercel, Netlify, Cloudflare Pages) will lose the
database on every deploy/restart — don't use them for this app.

## Before you share a URL with a client

Set the `STOCKFLOW_PASSWORD` environment variable. This turns on the login
gate for the whole UI and API. Without it, anyone with the URL can read and
edit everything.

Environment variables:

| Variable | Purpose |
| --- | --- |
| `STOCKFLOW_PASSWORD` | Enables the password gate (share this with your client) |
| `STOCKFLOW_DATA_DIR` | Where the SQLite file lives (the Docker image sets `/data`) |
| `RESEND_API_KEY` | Enables invoice emailing via [Resend](https://resend.com) (free tier: 100 emails/day) |
| `STOCKFLOW_FROM_EMAIL` | The From address for invoice emails (must be verified in Resend; `onboarding@resend.dev` works for testing) |
| `STOCKFLOW_COMPANY_NAME` | Company name shown on invoices (default "StockFlow") |

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
4. **Variables**: add `STOCKFLOW_PASSWORD`.
5. **Settings → Networking → Generate domain** — send that URL + password to your client.

## Option 2 — Fly.io (~$3–5/mo)

```bash
fly launch --copy-config --no-deploy   # uses fly.toml in this repo
fly volumes create stockflow_data --size 1
fly secrets set STOCKFLOW_PASSWORD=your-sandbox-password
fly deploy
```

## Option 3 — Free: Oracle Cloud "Always Free" VM (or any VPS)

Oracle's Always Free tier gives you a permanently free VM that comfortably
runs StockFlow (Google Cloud's free `e2-micro` also works). On the VM:

```bash
docker build -t stockflow .
docker run -d --name stockflow --restart unless-stopped \
  -p 3000:3000 -v stockflow-data:/data \
  -e STOCKFLOW_PASSWORD=your-sandbox-password \
  stockflow
```

Put HTTPS in front with Caddy (automatic certificates):

```bash
docker run -d --name caddy --restart unless-stopped --network host caddy \
  caddy reverse-proxy --from your-domain.example.com --to localhost:3000
```

No Docker? Bare metal works too: `npm install && npm run build`, then run
`STOCKFLOW_PASSWORD=... npm run start` under systemd or pm2.

## Option 4 — Free: your own machine + Cloudflare Tunnel

Good for a demo call or a short test window; the URL only works while your
machine is on.

```bash
npm run build && STOCKFLOW_PASSWORD=your-sandbox-password npm run start
# in another terminal (no Cloudflare account needed for a quick tunnel):
cloudflared tunnel --url http://localhost:3000
```

`cloudflared` prints a `https://….trycloudflare.com` URL you can share.

## A note on Render's free tier

Render's free web services have **no persistent disk** and spin down when
idle — the sandbox database would be wiped. Use the Starter plan with a disk
(`render.yaml` in this repo is set up for it), or pick one of the options above.

## Seeding data on a deployed instance

`npm run seed` talks to `http://localhost:3000` by default and uses the
UI's same-origin path, so run it before enabling the password, or point it
at the deployed instance with an API key:

```bash
STOCKFLOW_URL=https://your-sandbox.example.com \
STOCKFLOW_API_KEY=sfk_... \
node scripts/seed.mjs
```

For a client sandbox you'll usually skip the demo seed and use
**Import Data** in the app to load their real SOS Inventory CSV exports.
