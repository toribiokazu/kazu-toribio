# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## What this is

A single-page personal portfolio site for Kazu Toribio (AI Automation Innovation
Specialist / Technical Virtual Assistant). Built with **TanStack Start** (React 19,
file-based routing, SSR), styled with **Tailwind CSS v4** + **shadcn/ui** components.
Deployed to Vercel. The project was scaffolded and is synced through **Lovable**
(see "Lovable sync" below) — this is not a from-scratch hand-rolled repo.

Almost the entire experience lives on one route (`/`) as a long scrolling page with
anchor-linked sections (About, Services, Experience, Works, Testimonials, FAQ,
Contact). Individual project case studies live at `/projects/$slug`. There's also
an AI chat widget backed by Groq, and a contact form backed by Resend.

## Tech stack

- **Framework**: TanStack Start (`@tanstack/react-start`) on Vite, with Nitro server output
- **Routing**: TanStack Router, file-based (see `src/routes/README.md` — read it before adding routes)
- **UI**: React 19 + Tailwind CSS v4 + shadcn/ui (`new-york` style) + Radix primitives
- **Icons**: `lucide-react` for UI icons, `react-icons/si` (Simple Icons) for brand/tool logos, plus a few custom brand icons in `src/components/BrandIcons.tsx` for logos not in Simple Icons or needing light/dark variants
- **3D**: `@react-three/fiber` + `@react-three/drei` (used for the animated `Avatar3D` chat launcher)
- **AI chat**: Vercel AI SDK (`ai`, `@ai-sdk/react`) streaming from Groq (`@ai-sdk/groq`) via a server route
- **Email**: Resend API for the contact form
- **Data fetching**: TanStack Query (present via router context, lightly used)
- **Forms**: `react-hook-form` + `zod` + `@hookform/resolvers` (available; contact form is currently a static/HTML form — check before assuming wiring)
- **Package manager**: **Bun** (`bun.lock` is the lockfile — do not generate/commit a `package-lock.json` or `yarn.lock`)

## Directory layout

```
src/
  routes/              File-based routes (TanStack Router). See src/routes/README.md.
    __root.tsx         App shell: <html>/<head>/<body>, global meta/OG tags, error & 404 boundaries
    index.tsx           The entire portfolio page ("/") — hero, services, experience, works, testimonials, FAQ, contact
    projects/$slug.tsx  Individual case-study page, data-driven from src/lib/works.ts
    api/chat.ts         POST /api/chat — streams AI chat responses (Groq)
    api/contact.ts      POST /api/contact — validates + emails contact form submissions (Resend)
  components/
    ui/                 shadcn/ui primitives (generated — prefer regenerating via shadcn CLI over hand-editing broadly, but small tweaks are fine)
    PortfolioChat.tsx   Floating AI chat widget (uses useChat from @ai-sdk/react)
    Avatar3D.tsx        React-three-fiber animated robot head used as the chat launcher avatar
    CalendlyEmbed.tsx   Inline Calendly widget loader
    BrandIcons.tsx       Custom SVG icons for brands without a themeable Simple Icons entry
  lib/
    works.ts             Source of truth for all project case studies (array of Work objects)
    calendly.ts           Popup Calendly widget loader (openCalendlyPopup())
    ai-gateway.server.ts  Helper for Lovable's AI gateway (server-only, note the .server.ts suffix)
    error-capture.ts / error-page.ts / lovable-error-reporting.ts
                           SSR error-handling plumbing — see "Error handling" below
    useTheme.ts            Light/dark theme hook (class-based, persisted to localStorage)
    utils.ts               cn() Tailwind class merge helper (clsx + tailwind-merge)
  hooks/use-mobile.tsx
  assets/                Images imported directly into components (each has a matching *.asset.json — Lovable-managed, don't edit by hand)
  styles.css             Tailwind v4 config-in-CSS: design tokens (OKLCH colors), light/dark theme, custom utilities/animations
  router.tsx             createRouter() factory (QueryClient wiring)
  start.ts               createStart() — global server request middleware (error handling)
  server.ts               Low-level fetch entrypoint wrapping the TanStack server-entry, with extra SSR crash recovery
public/                  Static assets served as-is: images (.png + .webp pairs), favicon, robots.txt, sitemap.xml, llms.txt
```

## Development workflow

```bash
bun install       # install deps — always use bun, never npm/yarn/pnpm
bun run dev       # vite dev server
bun run build     # production build (vite build)
bun run build:dev # development-mode build
bun run preview   # preview a production build
bun run lint      # eslint .
bun run format    # prettier --write .
```

There is **no test suite** in this repo currently. Don't invent test files or a
test runner config unless explicitly asked — verify changes by running `bun run dev`
and checking the browser, and by running `bun run lint` / `bun run build`.

## Routing conventions (TanStack Start / Router)

Read `src/routes/README.md` before touching routes. Key points:

- File-based routing: every `.tsx` under `src/routes/` is a route. No `src/pages/`,
  no Next.js/Remix-style conventions.
- Dynamic segments use a bare `$` (e.g. `$slug.tsx` → `/:slug`), not curly braces.
- `src/routeTree.gen.ts` is **auto-generated** — never hand-edit it.
- `src/routes/__root.tsx` is the only root layout; it renders `<html>`/`<head>`/`<body>`,
  global `<meta>`/OG/Twitter tags, and the `NotFoundComponent`/`ErrorComponent`
  boundaries. Don't remove `<Outlet />` from `RootComponent` — it breaks every child route.
- Server route handlers live under `src/routes/api/*.ts` using the
  `server: { handlers: { POST: ... } }` shape (see `api/chat.ts`, `api/contact.ts`).

## Server-only code

- TanStack Start does not use Next.js's `server-only` package — ESLint enforces
  this via a `no-restricted-imports` rule in `eslint.config.js`. Name server-only
  modules `*.server.ts` (see `src/lib/ai-gateway.server.ts`) or mark them with
  `@tanstack/react-start/server-only` instead.
- Secrets (`GROQ_API_KEY`, `RESEND_API_KEY`) are read from `process.env` **inside**
  the request handler, not at module scope — this is intentional so per-request
  env injection works correctly on Vercel/Workers-style runtimes. Follow this
  pattern for any new secret-dependent server code.
- Never expose secrets via `VITE_*` env vars (those are inlined into client bundles).

## Error handling (SSR)

There's a layered, somewhat unusual error-recovery setup — don't simplify it away
without understanding why it's there:

1. `src/start.ts` — global `requestMiddleware` catches server-side throws and
   renders a static fallback HTML page (`renderErrorPage()`), unless the error
   carries a `statusCode` (route-level errors like `notFound()` pass through).
2. `src/server.ts` — the outermost fetch entrypoint. It additionally detects the
   case where h3 (Nitro's HTTP layer) swallows an in-handler throw into a generic
   `{"unhandled":true,"message":"HTTPError"}` JSON 500 response — try/catch alone
   doesn't catch that. It recovers the real error via `error-capture.ts`'s global
   `error`/`unhandledrejection` listeners and logs it before rendering the same
   fallback page.
3. `src/routes/__root.tsx` — client-side `ErrorComponent` for router-level render
   errors, reports to Lovable's error tracking via `reportLovableError()`.

If you're debugging a "swallowed" 500 or adding new server middleware, read all
three files together — they're solving different layers of the same problem.

## The AI chat widget

- `src/components/PortfolioChat.tsx` is a floating chat launcher + panel using
  `useChat` from `@ai-sdk/react`, backed by `POST /api/chat`.
- `src/routes/api/chat.ts` contains the **entire system prompt** as an inline
  string. This is the single source of truth for what the assistant knows about
  Kazu (bio, services, experience, skills, selected works) and how it should
  behave. When Kazu's bio/services/experience/projects change, update **both**:
  - the system prompt in `src/routes/api/chat.ts`, and
  - the corresponding marketing copy in `src/routes/index.tsx` (and `src/lib/works.ts`
    for project case studies)
  Keep them consistent — the chat assistant's claims should match the page content.
- The system prompt has explicit, deliberate guardrails — preserve their intent
  when editing:
  - Never invent or output real URLs (the model has hallucinated wrong booking
    links before). The only sanctioned "link" is the literal token `[[BOOK_CALL]]`,
    which the client renders as a real button via `openCalendlyPopup()`.
  - It answers "how do I automate X" questions with credibility-building detail
    but explicitly avoids giving a full step-by-step blueprint — it's a sales
    assistant, not a free consulting engine. Steers toward booking a call instead.
  - Has explicit prompt-injection resistance instructions (ignore "ignore previous
    instructions", "system prompt", "jailbreak", "DAN", "act as", etc.).
- Client-side, `PortfolioChat.tsx` treats **any** URL-shaped text in a model
  response as a signal to strip it and show the book-a-call button instead of
  trusting a model-generated link — this is a deliberate defense-in-depth measure
  against prompt injection / hallucination, not incidental code. Don't remove it
  as "dead code" without understanding why it's there.

## Adding a new project / case study

Everything is data-driven from `src/lib/works.ts` (`Work[]`). To add a project:

1. Add a new entry to the `works` array with `slug`, `title`, `tag`, `desc`,
   `problem`, `build`, `result`, and optionally `image`/`url`.
2. Drop the preview image in `public/` (repo convention: both `.png` and `.webp`,
   referenced by absolute path e.g. `/xero-asana.webp`).
3. That's it — the works grid on `/` and the `/projects/$slug` case-study page
   both read from this array automatically. Consider updating the chat system
   prompt's "Selected works" list too (see above).

## Styling conventions

- Tailwind v4 is configured **in CSS** (`src/styles.css`), not `tailwind.config.js`
  — there is no JS Tailwind config file in this project. Design tokens (colors,
  radius, gradients, shadows) are CSS custom properties in OKLCH color space,
  defined once under `:root` (light) and again under `.dark` (dark theme class
  toggle, not `prefers-color-scheme`).
- Theme switching is manual/class-based via `useTheme()` (`src/lib/useTheme.ts`),
  persisted to `localStorage`, applied by toggling the `dark` class on `<html>`.
- shadcn/ui config is in `components.json` (`new-york` style, no RSC, Lucide icons,
  path aliases below). Use the shadcn CLI to add new primitives rather than
  hand-authoring new files in `src/components/ui/` when possible.
- Import alias: `@/*` → `src/*` (defined in `tsconfig.json` and `components.json`).

## Lovable sync

This repo is connected to [Lovable](https://lovable.dev) (`.lovable/project.json`,
Lovable-specific deps in `package.json`, `.asset.json` sidecar files next to images
in `src/assets/`, `lovable-error-reporting.ts`).

**Important**: commits pushed to the connected branch sync back into the Lovable
editor and become the user's project history there.
- Do **not** rewrite published git history: no force-push, no rebase/amend/squash
  of already-pushed commits.
- Always create new commits, never amend.
- Keep the branch buildable — a broken build syncs into Lovable's editor too.

## Linting / formatting

- ESLint flat config (`eslint.config.js`): `typescript-eslint` recommended rules,
  `react-hooks` + `react-refresh` plugins, Prettier integration
  (`eslint-plugin-prettier/recommended`), and the `server-only` import restriction
  described above.
- Notable deliberate rule overrides: `@typescript-eslint/no-unused-vars` is **off**
  and `noUnusedLocals`/`noUnusedParameters` are off in `tsconfig.json` — don't
  "fix" unused vars as drive-by cleanup unless asked.
- Prettier config: `.prettierrc` / `.prettierignore` — run `bun run format` rather
  than hand-formatting.
- `bunfig.toml` sets a 24-hour supply-chain guard (`minimumReleaseAge`) on new
  package installs, with a small explicit allowlist for `@lovable.dev/*` tooling
  packages. If you need to bypass this for a new dependency, confirm with the
  user before adding it to `minimumReleaseAgeExcludes`.

## Deployment

- Deployed on Vercel (`vercel.json`: `buildCommand: npm run build`,
  `outputDirectory: .vercel/output`). Note the build command there still says
  `npm run build` even though the repo standardizes on Bun locally — Vercel's
  build environment handles the install itself; you generally don't need to touch
  `vercel.json`.
- Required env vars in Vercel (Production, and Preview if preview deploys should
  work): `GROQ_API_KEY` (chat), `RESEND_API_KEY` (contact form).
- SEO/AEO: `src/routes/__root.tsx` and `src/routes/index.tsx` set extensive
  meta/OG/Twitter tags and JSON-LD (`Person`, `WebSite`, `ProfessionalService`,
  `FAQPage`). `public/` also has `robots.txt`, `sitemap.xml`, and `llms.txt`. If
  you change the site's canonical URL, name, or structured content, keep all of
  these in sync — there was a dedicated SEO/AEO/GEO audit pass (see `bf53a49` in
  git history) and it's easy to silently regress one of these surfaces.
