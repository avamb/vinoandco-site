# vinoandco-site

The website of **Vino&Co** — wine-tasting evenings in Israel — served at
[vinoandco.events](https://vinoandco.events).

This repository replaces the former WordPress site. It is a static site: it holds the
pages, texts and design of Vino&Co, and takes events, prices, availability and
ticket purchase from the public API of the [Arena Sold Out](https://arenasoldout.com)
ticketing platform. The site has no database and stores no buyer data.

> Status: **work in progress.** The new site is being built and checked on a staging
> address; vinoandco.events still runs on WordPress until the switch.

## How it works

```
visitor ──► static pages (this repo, built with Astro)
              │  in the browser: availability, prices, purchase modal, "My tickets"
              ▼
         Arena public API (events, holds, checkout)
              │
              └─► AllPay hosted payment page ──► back to /order-status/
```

- **Languages:** Russian (default, no prefix), English (`/en/`), Hebrew (`/he/`, right-to-left).
- **Events** are built into pages from the platform; when an event ends it moves to
  "Past events" automatically and its page stays at the same address without the
  purchase button.
- **Builder:** a small service polls the platform feed every 2 minutes, rebuilds the site
  when events change (and when a session ends, and hourly), checks the result and only
  then switches the folder nginx serves; a failed build leaves the last good one online.
  `GET :8081/healthz` inside the container shows when it last read the feed and published.
- **Purchase** happens in the site's own modal (the same one the WordPress site had)
  and is paid on the AllPay page.
- **Tracking** (Meta Pixel, Google Analytics) loads only after the visitor accepts
  cookies.

## Personal pages and forms

These need the platform routes of the "site off WordPress" work (see the table below);
until they are deployed the pages render and say the service is unavailable.

| Page | Address (ru / en / he) | What it does | Platform route |
|---|---|---|---|
| Order status | `/order-status/`, `/en/order-status/`, `/he/order-status/` | Reads the order by its token, shows paid / failed / expired / cancelled / refunded / "we are checking your payment" (`needs_help`), the event with its date in the venue time zone and the ticket PDF links as the platform gives them | `GET /v1/public/checkout/{token}` with the `event` block |
| My tickets | `/my-tickets/`, `/en/my-tickets/`, `/he/my-tickets/` | E-mail form asks for a link (always "check your e-mail"). The link opens the page with `#t=<token>` (fragment, so analytics never see it; the older `?t=` still works) and the token is removed from the address at once; a button spends the one-time token for a 4-hour session kept in `sessionStorage`; orders, PDF download (fetch + Bearer + blob), log out | `POST .../my-tickets/link`, `POST /v1/public/my-tickets/session`, `GET .../my-tickets/orders`, `GET .../tickets/{id}/pdf`, `DELETE .../my-tickets/session` |
| Contact, private events, club | `/contact-us/`, `/private-events/` (popup), home (club popup) | Forms with Cloudflare Turnstile (action = topic, `club` for the club), one `Idempotency-Key` per submission | `POST .../organizer-contact`, `POST .../marketing-subscriptions` |

Settings: `PUBLIC_TURNSTILE_SITE_KEY` (public, empty by default: the forms are then disabled and
say so). The Turnstile hostname list and the secret key are the platform's business. The channel
must list this site's origin (`settings.site.origins`) and the origin must be in the platform's
CORS list, or every browser call fails.

The purchase modal also sends `buyer_context` (click ids from the landing URL, `_fbp` / `_fbc`
when present, the GA4 client id only after consent, the page address and the cookie banner
answer) for the platform's server-side conversions.

Events that left the feed (`include_removed=true`) are recorded in the builder's `state.json`,
have no page and answer 410; `/data/allow-shrink` stays as the manual override.

## Working on the site

Read [AGENTS.md](AGENTS.md) first: it describes the structure, the rules that keep
the site identical to the original, and how to check a change. It is written for
people and for AI coding assistants alike.

### Commands

Node 22 or newer.

```
npm install          # once
npm run dev          # local site at http://localhost:4321 (events from src/data/events.sample.json)
npm run build        # static site into dist/ (+ nginx rules and CSP hashes in dist/.nginx/)
npm run check        # type check, redirect map and build sanity checks (after a build)
npm test             # unit and component tests (no live platform calls)
npm run preview      # serve dist/ locally
docker compose up --build web   # the production container (nginx) on http://localhost:8080
docker compose --profile builder up --build -d   # plus the builder: real events, rebuilt on change
```

Build settings come from the environment (see `.env.example`); all of them are public.
Without `PUBLIC_FEED_TOKEN` / `EVENTS_SNAPSHOT` the site builds from the sample events.

**Test channel (staging only).** With `PUBLIC_TEST_FEED_TOKEN` (the test channel's public feed token) and `TEST_EVENT_IDS` (comma-separated event UUIDs and/or display numbers) set, the builder also reads those events from the test feed in the same 2-minute poll and builds them as normal event pages (ru/en/he, purchase modal included) with `noindex, nofollow`, left out of every list, the carousel, `sitemap.xml` and the 410 logic. Their checkout calls use the test token, so orders land in the test channel. If the test feed fails, the previous test events stay in the build and the main release is not affected. Both variables are empty in production and nothing changes.

## Ownership

The code belongs to Vino&Co's site and can be built and hosted anywhere a Docker
container or a static host runs. It talks to the platform only through the public,
documented API, kept in one folder (`src/arena/`).
