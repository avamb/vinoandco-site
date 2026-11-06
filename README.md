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
- **Purchase** happens in the site's own modal (the same one the WordPress site had)
  and is paid on the AllPay page.
- **Tracking** (Meta Pixel, Google Analytics) loads only after the visitor accepts
  cookies.

## Working on the site

Read [AGENTS.md](AGENTS.md) first: it describes the structure, the rules that keep
the site identical to the original, and how to check a change. It is written for
people and for AI coding assistants alike.

Commands are added as the project is scaffolded.

## Ownership

The code belongs to Vino&Co's site and can be built and hosted anywhere a Docker
container or a static host runs. It talks to the platform only through the public,
documented API, kept in one folder (`src/arena/`).
