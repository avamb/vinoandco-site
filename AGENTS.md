# AGENTS.md — vinoandco-site

Read this before changing anything. Keep it current: when you learn a convention the
hard way, add one short, factual line here.

## What this project is

The public website of Vino&Co (vinoandco.events). It replaces a WordPress + Elementor
+ WooCommerce site. **Visitors must not notice the change**: same addresses, same
look, same texts, same purchase steps. Events, prices, availability, holds, checkout,
tickets and e-mails come from the Arena platform's public API; this repository holds
only pages, texts, design and the browser-side code.

## Hard rules

1. **Design is a copy of the original site.** Do not "improve" layout, colours,
   spacing or wording on your own. The only intentional differences from WordPress:
   fonts actually load (served from this site), and the cookie banner has a
   "Decline" button.
2. **Legal pages are copied as they are** (terms, privacy, refund). Do not edit their
   wording; a separate text audit will do that.
3. **No secrets in this repository.** It is public. Only public values belong here
   (the channel's public feed token, Meta Pixel id, GA4 measurement id). Server
   addresses, deploy ids and tokens live elsewhere.
4. **All platform calls go through `src/arena/`.** No `fetch` to the platform from
   pages or components directly. This folder will later become a shared library for
   other sites, so keep it free of Vino&Co-specific markup.
5. **No tracking before consent.** Meta Pixel, GA4 and any marketing script load only
   after the visitor accepts cookies; Google Consent Mode defaults to `denied`.
6. **Keep every old address working.** Any URL that existed on WordPress either
   renders here or is listed in `redirects.yaml` with a 301.
7. **Three languages always move together**: ru (default, no prefix), en (`/en/`),
   he (`/he/`, RTL). A change to one language's UI text needs the other two.

## Structure

```
site.config.ts              languages (ru default no prefix, en, he RTL), origin, indexing,
                            feed token, pixel / GA4 ids — read from the build environment
src/arena/                  platform boundary: feed types, fetch client, lifecycle rules (no markup)
src/lib/                    routes (every address per language), content loaders, events
                            view model, i18n, HTML allow-list for event descriptions
src/content/{ru,en,he}/     page texts (*.json) and legal documents (*.html) copied from WordPress
src/content/past-legacy/    Bil24-era past events, one JSON per event (poster in public/_site/img/past/)
src/data/events.sample.json events snapshot in the feed contract (spec 62 §6.0), used when no
                            snapshot is given; the builder will write the real one
src/i18n/{ru,en,he}.json    UI strings (menu, cards, event page, modal, forms, banner, age gate)
src/layouts/Base.astro      <head>, age gate, header, footer, cookie banner, tracking loader
src/components/             Header, Footer, EventCard, Split, PageHero, SiteForm, Popup, AgeGate
src/components/pages/       one component per page type; src/pages/[...path].astro routes them
src/components/islands/     Svelte islands: CookieBanner, BuyModal (stub)
src/scripts/                consent cookie and the consent-gated GA4 / Meta Pixel loader
src/styles/                 tokens.css (from the Elementor kit), fonts.css, global.css
public/_site/               fonts (OFL), images, age-gate.js — every static file lives under /_site/
redirects.yaml              every WordPress address with its expected code (200 / 301 / 410 / pending)
nginx/                      server config template and header snippets
scripts/                    postbuild (CSP hashes, nginx redirects), check-dist, check-redirects
builder/                    feed poller and rebuilder (stub)
Dockerfile, docker-compose.yml   build with Node, serve with nginx; builder service (profile)
docs/reference/             snapshot of the WordPress site (HTML, CSS, screenshots, sitemaps)
                            and notes.md: what is not yet 1:1
```

Stack: Astro 5 (static output, `trailingSlash: 'always'`, directory format) with Svelte 5 islands.

## Commands

```
npm install
npm run dev            # http://localhost:4321
npm run build          # dist/ + dist/.nginx/{csp-hashes,redirects}.conf
npm run check          # astro check + check:redirects + check:dist (needs a build first)
docker compose up --build web
```

## Conventions learned while building

- **Addresses keep the WordPress shape** (trailing slash, folder per page). Add a page
  to `src/lib/routes.ts` for all three languages; the catch-all `src/pages/[...path].astro`
  builds it. Hebrew slugs are the transliterated WPML ones.
- **No inline CSS or JS of our own**: the CSP is `'self'` plus hashes. Astro is set to emit
  external CSS/JS (`inlineStylesheets: 'never'`, `assetsInlineLimit: 0`); the few inline
  scripts Astro adds for islands are hashed by `scripts/postbuild.mjs` into
  `dist/.nginx/csp-hashes.conf`. Never use a `style="..."` attribute (check-dist fails):
  section photos are CSS classes `.vc-bg-*` in `global.css`.
- **nginx `add_header` in a location replaces the server's headers**: every location that
  adds a header includes `nginx/headers.conf` (or `headers-personal.conf`). Personal pages
  use `^~` prefix locations so they beat `/en/` and `/he/`.
- **Static files under `/_site/`** (spec 62 §4.1): fonts, images, scripts and Astro assets
  (`build.assets: '_site/assets'`). Rollback routing relies on that prefix.
- Texts in `src/content/` were generated from `docs/reference/html/*.json`; edit the JSON
  directly now. Links to `https://vinoandco.events/...` inside texts are made relative by
  `localizeLinks`.
- Assistant and Karla have no Cyrillic: Russian falls back to the system sans, as it did
  on WordPress. Not a bug of the font setup.
- On Windows/git-bash, pass Windows paths (`C:\...`) and `MSYS_NO_PATHCONV=1` to node
  scripts that receive URL paths, or `/` gets rewritten to `C:/Program Files/Git/`.

## Behaviour to preserve

- **Event lifecycle:** an event is listed as upcoming until its last session ends;
  the next build moves it to "Past events". The past event page stays at the same
  URL, without purchase, with the after-event materials (photo report, video, text).
- **Purchase modal (general admission):** choose category/tariff → "Your details"
  (quantity, name, phone, e-mail — all required, optional promo code) → "PAY" creates
  the hold and the order in one call and redirects to AllPay. The "seats reserved for
  19 minutes" line is static text, exactly as on the original.
- **Purchase with a seat map:** "Continue" holds the seats and starts a live timer;
  closing the modal releases them.
- **Sales states:** open / soon / sold out / ended, shown as on the original (SOLD OUT
  ribbon on the poster, disabled button with the state's text).
- **Age gate 18+** on every page, same screen and texts as the original.

## Checks before a change is done

1. `npm run build` passes (postbuild prints the page count and the hashes).
2. `npm run check` passes: types, `check:redirects` (every `redirects.yaml` entry against
   `dist/`), `check:dist` (all pages in ru/en/he, one `<h1>`, lang/dir, no inline styles,
   personal pages noindex and without tracking).
3. Visual comparison with `docs/reference/screenshots/` at 1440 and 390 px, ru/en/he.
4. For nginx changes: `docker compose up --build web` and `curl -I` the pages; no CSP
   errors in the browser console.

Still to add: link check, JSON-LD and hreflang check, axe, Lighthouse.
