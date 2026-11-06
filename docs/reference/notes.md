# Reference snapshot of the WordPress site and what is not yet 1:1

Taken 2026-11-06 from https://vinoandco.events (WordPress + Elementor + WooCommerce).

## What is in this folder

| Folder | Content |
|---|---|
| `html/` | Page HTML of every page in ru / en / he, the event page `premera-vina-v-tel-avive` and the 404 page. All `<script>` tags removed. Next to each page a `.json` with its extracted main content. |
| `css/` | The site's own CSS: Elementor kit 542 (design tokens), header 467, footer 472, page templates, product template 442, 404 template 1224, age-gate, cookie-notice, vino-purchase-flow-ux. Elementor core and WooCommerce CSS are not copied. |
| `screenshots/` | Desktop (1440 px) and mobile (390 px) full-page screenshots. The `ru-home`, `ru-about`, `ru-private`, `ru-contact`, `ru-past`, `ru-terms`, `he-home` shots were retaken with the Elementor entrance animations switched off, so every block is visible. |
| `sitemap/` | Slim SEO sitemaps (pages, products, product categories and tags): the source of `redirects.yaml`. |

Where the new site takes what:

- colours and typography: `css/uploads_elementor_css_post-542.css` -> `src/styles/tokens.css`;
- page texts: `html/*.json` -> `src/content/{ru,en,he}/` (copied by a one-off script, legal texts as they are);
- card states: the inline styles `vino-event-cards` and `vino-sales-state` in `html/ru-home.html`;
- purchase modal texts: the `#vino-booking-modal` markup in `html/ru-event.html` -> `src/i18n/*.json` `modal`.

## Not yet identical, and why

| Fragment | WordPress | New site now | Next step |
|---|---|---|---|
| Event carousel on the home page | Elementor Loop Carousel (Swiper, arrows, dots, two cards per view) | Two-column grid of the same cards | Svelte carousel island |
| Entrance animations | Elementor `fadeInUp` / `fadeInLeft` / `fadeInRight` on scroll (JS) | None | Optional CSS-only animation with `prefers-reduced-motion` |
| Mobile header on the home page | Transparent over the hero photo | Solid burgundy, as on the other pages | Check on a phone, copy if confirmed |
| 404 figures | Three background slideshows of the figures `c1`–`c5`, `w1`–`w3` behind the digits, Montserrat font | One fixed figure per digit, Montserrat not loaded (falls back to Assistant) | Small CSS slideshow if wanted |
| Section photo overlays | Elementor overlay colours were not readable from the CSS (none set on the containers) | A light dark overlay estimated from the screenshots | Compare side by side on staging |
| Age gate | Plugin age-gate v3 in JS mode; it did not show to the headless screenshot browser, so its look is rebuilt from the plugin CSS and the markup in `html/*.html` | Same texts (one set for all languages, as configured on WP), same cookie name `age_gate`, "Remember me" keeps it for a year | Compare on a real browser |
| Age gate heading | `<h1>` | `<p>` with the same look (one `<h1>` per page) | — |
| Cookie banner close icon | A grey × that also meant "accept" | Removed; "Decline" button added (Р-10) | — |
| Fonts | Assistant and Karla requested from the dead `tempvino.andreevmaster.com` and Google; Assistant 404, so everything was Arial | Assistant and Karla served from `/_site/fonts/` (Р-6). **Neither font has Cyrillic glyphs**: Russian text still falls back to the system sans, Latin letters and digits are now Assistant | Decide with the owner whether to add a Cyrillic font |
| Days to start on the event page | Live JS counter | Computed at build time (the builder rebuilds at least hourly) | Client-side counter in the purchase island |
| Event page selects | Hidden WooCommerce variation `<select>`s (category, tariff) | Not reproduced: the modal will offer them | Purchase modal |
| "We're Hiring" block on About | In the HTML, invisible on the page | Omitted | — |
| Lightbox gallery on Private events | Three links in the HTML, invisible on the page | Omitted | — |
| Event list on `/en/` and `/he/` | Empty (WPML products were not translated) | Events in every language with the original text (Р-7) | — |
| Past events | 27 Bil24-era product posters + platform events | Platform events + `src/content/past-legacy/` (3 example cards, dates and slugs are placeholders) | Export of the 27 products |
| Forms and popups | Elementor Pro forms with reCAPTCHA v3, Brevo | Same fields and texts, submit disabled | Platform forms with Turnstile (П-17) |

Icons: Facebook and Instagram are Font Awesome Free brand icons (CC BY 4.0), as on WordPress.
