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

## Planned structure

```
src/arena/            platform API client, types, purchase flow logic (no markup)
src/content/{ru,en,he}/  page texts and legal documents copied from WordPress
src/content/blog/     future blog posts (static), src/content/video/ future video entries
src/i18n/             UI strings per language
src/layouts, src/components   the site's own design (header, footer, cards, modal…)
src/styles/tokens.css design tokens: #822121 #F0E6DC #2C2C2C #D9A441 #999999 #A02828
public/fonts/         Assistant, Karla (woff2, OFL)
redirects.yaml        old WordPress addresses → new ones
builder/              rebuilds the site when platform data changes
Dockerfile, docker-compose.yml   nginx (web) + builder
```

Stack: Astro (static output) with Svelte islands for the purchase modal, seat map,
"My tickets" and the cookie banner.

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

To be filled in as tooling lands: build, link check, redirect check against the old
sitemap, JSON-LD and hreflang check, visual comparison with the WordPress
screenshots, accessibility (axe), Lighthouse.
