<script lang="ts">
  /**
   * Purchase modal for general admission: a copy of the WordPress `vino-modal`
   * (plugin vino-purchase-flow-ux, spec 62 §5.1). Steps: "Select ticket"
   * (category) → "Your details" (quantity, name, phone, e-mail, promo code,
   * mailing tick) → PAY: one `checkout/start` call holds the places, creates
   * the order and the AllPay page, then the browser goes there. "Seats are
   * reserved for 19 minutes" is static text, as on WordPress: nothing is held
   * before PAY.
   *
   * Every platform call goes through src/arena/; the rules (offered categories,
   * quantity cap, price steps, idempotency keys) live in src/arena/cart.ts.
   */
  import { onMount, tick } from 'svelte';
  import { createArenaClient, ArenaApiError, ArenaNetworkError } from '../../arena/client.ts';
  import { readAttribution } from '../../arena/attribution.ts';
  import { buildBuyerContext } from '../../arena/buyer-context.ts';
  import { createAttemptKeys, EMAIL_RE, gaItems, isSellable, isSoldOut, localTotal, maxQuantity, offeredTiers, stepHint } from '../../arena/cart.ts';
  import type { CheckoutStartRequest, FeedSession, FeedTier, PricingBreakdown } from '../../arena/types.ts';
  import { CHECKOUT_TOKEN_KEY, LAST_EVENT_KEY, errorKey, fmt, isPromoError, nav, type ErrorKey } from '../../lib/purchase.ts';
  import { readConsent } from '../../scripts/consent.ts';
  import { trackAddToCart, trackBeginCheckout } from '../../scripts/analytics.ts';
  import { funnelSessionOpen, funnelStep } from '../../scripts/funnel.ts';

  type Strings = {
    selectTitle: string; contactTitle: string; close: string; category: string; choose: string; soldOutSuffix: string;
    selectCategory: string; next: string; qty: string; timer: string; fullName: string; fullNamePlaceholder: string;
    phone: string; phonePlaceholder: string; email: string; promoToggle: string; promoPlaceholder: string; promoApply: string;
    promoChecking: string; promoApplied: string; promoLine: string; promoRemove: string; promoWait: string; pay: string;
    processing: string; qtyLess: string; qtyMore: string; back: string; ticket: string; pcs: string; stepLeft: string; fillRequired: string; invalidEmail: string;
    priceError: string; consent: string; consentTerms: string; consentPrivacy: string; priceChanged: string;
    marketing: { label: string; labelNoOrg: string; discount: string; note: string };
    errors: Record<ErrorKey, string>;
  };

  interface Props {
    t: Strings;
    lang: 'ru' | 'en' | 'he';
    intl: string;
    eventId: string;
    eventName: string;
    /** Site path of the event page (kept for the order status page's links). */
    eventPath: string;
    sessions: FeedSession[];
    apiBase: string;
    feedToken: string;
    /** Absolute address of the order status page in the purchase language. */
    returnUrl: string;
    /** Session preselected on the page. */
    sessionId: string;
  }
  let { t, lang, intl, eventId, eventName, eventPath, sessions: initialSessions, apiBase, feedToken, returnUrl, sessionId }: Props = $props();

  // svelte-ignore state_referenced_locally
  const client = createArenaClient({ apiBase, feedToken, timeoutMs: 30_000 });
  const keys = createAttemptKeys();

  // svelte-ignore state_referenced_locally
  let sessions = $state<FeedSession[]>(initialSessions);
  let open = $state(false);
  let step = $state<'selection' | 'contacts'>('selection');
  // svelte-ignore state_referenced_locally
  let selectedSessionId = $state(sessionId);
  let tierId = $state('');
  let qty = $state(1);
  let fullName = $state('');
  let phone = $state('');
  let email = $state('');
  let fieldErrors = $state<{ category?: string; name?: boolean; phone?: boolean; email?: string }>({});
  let stepError = $state('');
  let paying = $state(false);
  let boxEl = $state<HTMLElement | null>(null);
  /** The button that opened the dialog: focus goes back to it on close (WCAG 2.4.3). */
  let opener: HTMLElement | null = null;

  let promoOpen = $state(false);
  let promoInput = $state('');
  let promoCode = $state<string | null>(null);
  let promoQuote = $state<PricingBreakdown | null>(null);
  let promoBusy = $state(false);
  let promoResult = $state<{ ok: boolean; text: string } | null>(null);
  let requoteTimer: ReturnType<typeof setTimeout> | null = null;

  let marketingTicked = $state(false);
  let marketingDiscount = $state(true);
  let consentTicked = $state(false);
  /** Total the platform answered with 409 checkout.price_changed, confirmed by the next PAY. */
  let confirmedTotal = $state<number | null>(null);

  const session = $derived(sessions.find((s) => s.id === selectedSessionId) ?? sessions[0]);
  const tiers = $derived(session ? offeredTiers(session) : []);
  const sellable = $derived(tiers.filter(isSellable));
  const needsPicker = $derived(sellable.length > 1);
  const tier = $derived<FeedTier | undefined>(tiers.find((x) => x.id === tierId));
  const cap = $derived(tier ? maxQuantity(tier) : 1);
  const local = $derived(tier ? localTotal(tier, qty, session?.service_fee_percent) : null);
  const total = $derived(promoCode && promoQuote ? promoQuote.total : (local?.total ?? 0));
  const currency = $derived(tier?.currency ?? 'ILS');
  const hint = $derived(tier ? stepHint(tier) : null);
  const optin = $derived(session?.marketing_optin?.enabled ? session.marketing_optin : null);
  const consentBlock = $derived((session?.consent ?? {}) as { required?: boolean; terms_url?: string; privacy_url?: string });

  function money(minor: number, cur = currency): string {
    return new Intl.NumberFormat(intl, { style: 'currency', currency: cur, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
  }

  const summary = $derived.by(() => {
    if (!tier) return '';
    const parts = [t.ticket];
    if (qty > 1) parts.push(`${qty} ${t.pcs}`);
    if (total > 0 || tier.pricing_mode === 'free') parts.push(money(total));
    if (hint && qty <= hint.left) parts.push(fmt(t.stepLeft, hint.left, money(hint.nextPrice)));
    return parts.join(' · ');
  });

  function optionLabel(x: FeedTier): string {
    let label = x.name;
    if (x.pricing_mode === 'fixed') label += ` — ${money(x.current_price, x.currency)}`;
    if (isSoldOut(x) || !x.is_open) label += ` ${t.soldOutSuffix}`;
    return label;
  }

  function marketingLabel(): string {
    if (!optin) return '';
    let s = optin.org_name ? t.marketing.label.replace('{org}', optin.org_name) : t.marketing.labelNoOrg;
    const d = optin.discount;
    if (d && marketingDiscount) {
      const value = d.type === 'percent' ? `${d.value} %` : money(d.value, d.currency ?? currency);
      s += ' ' + t.marketing.discount.replace('{discount}', value);
    }
    return s;
  }

  function resetForm() {
    stepError = '';
    fieldErrors = {};
    qty = 1;
    promoOpen = false;
    promoInput = '';
    promoCode = null;
    promoQuote = null;
    promoResult = null;
    paying = false;
    confirmedTotal = null;
    keys.reset();
  }

  function item() {
    return { id: tier?.id ?? eventId, name: eventName, price: tier?.current_price ?? 0, quantity: qty };
  }

  function showContacts() {
    step = 'contacts';
    funnelStep(client, 'seats_chosen', eventId, selectedSessionId);
    trackAddToCart(item(), total, currency);
  }

  async function openFor(id: string) {
    opener = (document.activeElement as HTMLElement | null) ?? null;
    selectedSessionId = id || sessionId;
    resetForm();
    tierId = '';
    open = true;
    document.body.classList.add('vino-modal-open');
    funnelSessionOpen(client, eventId, selectedSessionId);
    pickDefault();
    step = needsPicker ? 'selection' : 'contacts';
    if (step === 'contacts') showContacts();
    await tick();
    focusFirst();
    // Fresh places and prices: the page was built minutes ago (spec 62 §9: availability is read only here).
    try {
      const fresh = await client.getEvent(eventId);
      if (fresh?.sessions?.length) {
        sessions = fresh.sessions;
        if (tierId && !tiers.some((x) => x.id === tierId && isSellable(x))) tierId = '';
        pickDefault();
        if (qty > cap) qty = cap;
      }
    } catch {
      /* keep the built data */
    }
  }

  function pickDefault() {
    if (!tierId && sellable.length === 1) tierId = sellable[0].id;
  }

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusables(): HTMLElement[] {
    return boxEl ? Array.from(boxEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null) : [];
  }

  /** Move focus into the dialog: the first field, else the first control. */
  function focusFirst() {
    const fields = focusables().filter((el) => el.matches('select, input:not([readonly]), textarea'));
    (fields[0] ?? focusables()[0] ?? boxEl)?.focus();
  }

  function close() {
    open = false;
    document.body.classList.remove('vino-modal-open');
    if (requoteTimer) clearTimeout(requoteTimer);
    const back = opener;
    opener = null;
    if (back?.isConnected) setTimeout(() => back.focus(), 0);
  }

  /** Keep Tab inside the dialog (WCAG 2.1.2 and 2.4.3). */
  function trapTab(e: KeyboardEvent) {
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !boxEl?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !boxEl?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  function next() {
    stepError = '';
    fieldErrors = {};
    if (!tier) {
      fieldErrors = { category: t.selectCategory };
      return;
    }
    if (!isSellable(tier) || (tier.pricing_mode === 'fixed' && tier.current_price <= 0)) {
      stepError = tier.pricing_mode === 'fixed' ? t.priceError : t.errors.unavailable;
      return;
    }
    if (qty > cap) qty = cap;
    promoCode = null;
    promoQuote = null;
    promoResult = null;
    showContacts();
  }

  function back() {
    if (needsPicker) step = 'selection';
    else close();
  }

  function setQty(n: number) {
    qty = Math.max(1, Math.min(cap, n));
    if (promoCode) {
      if (requoteTimer) clearTimeout(requoteTimer);
      requoteTimer = setTimeout(() => void quotePromo(promoCode!, true), 250);
    }
  }

  async function quotePromo(code: string, requote = false) {
    if (!tier || !session) return;
    promoBusy = true;
    if (!requote) promoResult = { ok: true, text: t.promoChecking };
    try {
      const q = await client.quote({ session_id: session.id, ga_items: gaItems(tier, qty), promo_code: code });
      if (q.promo_applied) {
        promoCode = code;
        promoQuote = q.pricing;
        promoResult = { ok: true, text: `✓ ${t.promoApplied}` };
      } else {
        promoCode = null;
        promoQuote = null;
        promoResult = { ok: false, text: t.errors.promoNotApplicable };
      }
    } catch (e) {
      promoCode = null;
      promoQuote = null;
      promoResult = { ok: false, text: t.errors[errorKey(e)] };
    } finally {
      promoBusy = false;
    }
  }

  function applyPromo() {
    const code = promoInput.trim();
    if (!code) {
      promoResult = { ok: false, text: t.promoPlaceholder };
      return;
    }
    void quotePromo(code);
  }

  function removePromo() {
    if (requoteTimer) clearTimeout(requoteTimer);
    promoCode = null;
    promoQuote = null;
    promoInput = '';
    promoResult = null;
  }

  function buildRequest(): CheckoutStartRequest {
    const c = readConsent();
    const attribution = readAttribution(sessionStorage) ?? undefined;
    const body: CheckoutStartRequest = {
      session_id: session!.id,
      ga_items: gaItems(tier!, qty),
      buyer: { email: email.trim(), name: fullName.trim(), phone: phone.trim() },
      return_url: returnUrl,
      locale: lang,
      expected_total: confirmedTotal ?? total,
    };
    if (promoCode) body.promo_code = promoCode;
    if (attribution) body.attribution = attribution;
    if (optin?.text_version) body.marketing_consent = { accepted: marketingTicked, text_version: optin.text_version, ...(marketingDiscount ? {} : { discount: false }) };
    body.buyer_context = buildBuyerContext({ pageUrl: location.href.split('#')[0], store: sessionStorage, cookies: document.cookie, consent: c });
    if (consentBlock.required) body.consent = { accepted: consentTicked, locale: lang };
    return body;
  }

  async function pay() {
    stepError = '';
    fieldErrors = {};
    if (promoBusy) {
      stepError = t.promoWait;
      return;
    }
    const errs: typeof fieldErrors = {};
    if (!fullName.trim()) errs.name = true;
    if (!phone.trim()) errs.phone = true;
    if (!EMAIL_RE.test(email.trim())) errs.email = t.invalidEmail;
    if (errs.name || errs.phone || errs.email) {
      fieldErrors = errs;
      stepError = t.fillRequired;
      await tick();
      document.querySelector<HTMLElement>('#vino-booking-modal [aria-invalid="true"]')?.focus();
      return;
    }
    if (consentBlock.required && !consentTicked) {
      stepError = t.errors.consentRequired;
      return;
    }
    if (!tier || !session) return;
    paying = true;
    const body = buildRequest();
    const key = keys.keyFor(body);
    try {
      const res = await client.startCheckout(body, key);
      try {
        sessionStorage.setItem(CHECKOUT_TOKEN_KEY, res.checkout_token);
        sessionStorage.setItem(LAST_EVENT_KEY, JSON.stringify({ path: eventPath, name: eventName }));
      } catch {
        /* storage blocked: the return URL carries the token anyway */
      }
      trackBeginCheckout(item(), res.pricing?.total ?? total, currency);
      nav.go(res.redirect_url);
    } catch (e) {
      paying = false;
      if (e instanceof ArenaApiError && e.code === 'idempotency.body_mismatch') keys.reset();
      if (e instanceof ArenaApiError && (e.code === 'checkout.price_changed' || e.code === 'checkout.pricing_mismatch')) {
        // 409 checkout.price_changed carries details {expected_total, actual_total, currency}.
        const d = e.details as { actual_total?: number; total?: number } | null;
        const fresh = Number(d?.actual_total ?? d?.total);
        if (Number.isFinite(fresh) && fresh > 0) {
          confirmedTotal = fresh;
          stepError = fmt(t.priceChanged, money(fresh));
          return;
        }
      }
      if (isPromoError(e)) removePromo();
      if (e instanceof ArenaApiError && (e.code === 'marketing.discount_used' || e.code === 'marketing.discount_unavailable')) marketingDiscount = false;
      // A lost answer keeps its key: pressing PAY again returns the same checkout, never a second one.
      stepError = t.errors[e instanceof ArenaNetworkError ? (e.timeout ? 'timeout' : 'generic') : errorKey(e)];
    }
  }

  onMount(() => {
    const onClick = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-vino-buy]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      e.preventDefault();
      void openFor(el.dataset.session || sessionId);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'Tab') trapTab(e);
    };
    // Safari restores the page from its back-forward cache after AllPay "back": unfreeze PAY.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) paying = false;
    };
    document.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pageshow', onShow);
    };
  });
</script>

{#if open}
  <div id="vino-booking-modal" role="dialog" aria-modal="true" aria-labelledby="vino-modal-title">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="vino-modal-overlay" onclick={close}></div>
    <div class="vino-modal-box" bind:this={boxEl} tabindex="-1">
      <div class="vino-modal-header">
        <h2 id="vino-modal-title">{step === 'selection' ? t.selectTitle : t.contactTitle}</h2>
        <button type="button" class="vino-modal-close" aria-label={t.close} onclick={close}>&#x2715;</button>
      </div>

      {#if step === 'selection'}
        <div class="vino-modal-step">
          <div class="vino-modal-field">
            <label for="vino-modal-category">{t.category} <span class="vino-req">*</span></label>
            <select id="vino-modal-category" bind:value={tierId} class:vino-input-error={fieldErrors.category} aria-invalid={fieldErrors.category ? true : undefined} aria-describedby={fieldErrors.category ? "vino-err-category" : undefined} onchange={() => { if (qty > cap) qty = cap; }}>
              <option value="" disabled>{t.choose}</option>
              {#each tiers as x (x.id)}
                <option value={x.id} disabled={!isSellable(x)}>{optionLabel(x)}</option>
              {/each}
            </select>
            {#if fieldErrors.category}<div class="vino-field-error" id="vino-err-category" role="alert">{fieldErrors.category}</div>{/if}
          </div>
          {#if stepError}<div class="vino-step-errors" id="vino-step-error" role="alert">{stepError}</div>{/if}
          <button type="button" class="vino-modal-btn-primary" onclick={next}>{t.next}</button>
        </div>
      {:else}
        <div class="vino-modal-step">
          {#if summary}<div class="vino-booking-summary">{summary}</div>{/if}
          <div class="vino-modal-field">
            <label for="vino-modal-qty">{t.qty}</label>
            <div class="vino-qty-row">
              <button type="button" class="vino-qty-btn" aria-label={t.qtyLess} onclick={() => setQty(qty - 1)} disabled={qty <= 1}>&minus;</button>
              <input type="number" id="vino-modal-qty" value={qty} min="1" max={cap} readonly />
              <button type="button" class="vino-qty-btn" aria-label={t.qtyMore} onclick={() => setQty(qty + 1)} disabled={qty >= cap}>+</button>
            </div>
          </div>
          <p class="vino-modal-timer">{t.timer}</p>
          <div class="vino-modal-field">
            <label for="vino-field-fullname">{t.fullName} <span class="vino-req">*</span></label>
            <input type="text" id="vino-field-fullname" placeholder={t.fullNamePlaceholder} autocomplete="name" bind:value={fullName} class:vino-input-error={fieldErrors.name} aria-required="true" aria-invalid={fieldErrors.name ? true : undefined} aria-describedby={fieldErrors.name ? "vino-step-error" : undefined} />
          </div>
          <div class="vino-modal-field">
            <label for="vino-field-phone">{t.phone} <span class="vino-req">*</span></label>
            <input type="tel" id="vino-field-phone" placeholder={t.phonePlaceholder} autocomplete="tel" dir="ltr" bind:value={phone} class:vino-input-error={fieldErrors.phone} aria-required="true" aria-invalid={fieldErrors.phone ? true : undefined} aria-describedby={fieldErrors.phone ? "vino-step-error" : undefined} />
          </div>
          <div class="vino-modal-field">
            <label for="vino-field-email">{t.email} <span class="vino-req">*</span></label>
            <input type="email" id="vino-field-email" autocomplete="email" dir="ltr" bind:value={email} class:vino-input-error={fieldErrors.email} aria-required="true" aria-invalid={fieldErrors.email ? true : undefined} aria-describedby={fieldErrors.email ? "vino-err-email" : undefined} />
            {#if fieldErrors.email}<div class="vino-field-error" id="vino-err-email" role="alert">{fieldErrors.email}</div>{/if}
          </div>

          {#if session?.promo_codes_available !== false}
            <div class="vino-promo-section">
              <button type="button" class="vino-promo-toggle" aria-expanded={promoOpen} onclick={() => (promoOpen = !promoOpen)}>
                <span>{t.promoToggle}</span>
                <span class="vino-promo-arrow" class:is-open={promoOpen}>&#x25be;</span>
              </button>
              {#if promoOpen}
                <div class="vino-promo-box">
                  <div class="vino-promo-row">
                    <input type="text" placeholder={t.promoPlaceholder} bind:value={promoInput} disabled={Boolean(promoCode)} aria-label={t.promoPlaceholder} />
                    <button type="button" class="vino-promo-apply" onclick={applyPromo} disabled={promoBusy || Boolean(promoCode)}>
                      {promoBusy ? '...' : promoCode ? '✓' : t.promoApply}
                    </button>
                  </div>
                  {#if promoResult}<div class="vino-promo-result" class:success={promoResult.ok && promoCode} class:error={!promoResult.ok}>{promoResult.text}</div>{/if}
                  {#if promoCode && promoQuote}
                    <div class="vino-promo-line">
                      <span>{fmt(t.promoLine, promoCode, money(promoQuote.discount, promoQuote.currency))}</span>
                      <button type="button" class="vino-promo-remove" aria-label={t.promoRemove} onclick={removePromo}>&times;</button>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          {#if optin}
            <label class="vino-modal-check">
              <input type="checkbox" bind:checked={marketingTicked} />
              <span>{marketingLabel()}<small>{t.marketing.note}</small></span>
            </label>
          {/if}
          {#if consentBlock.required}
            <label class="vino-modal-check">
              <input type="checkbox" bind:checked={consentTicked} />
              <span>
                {t.consent}
                {#if consentBlock.terms_url}<a href={consentBlock.terms_url} target="_blank" rel="noopener">{t.consentTerms}</a>{/if}
                {#if consentBlock.privacy_url}<a href={consentBlock.privacy_url} target="_blank" rel="noopener">{t.consentPrivacy}</a>{/if}
              </span>
            </label>
          {/if}

          {#if stepError}<div class="vino-step-errors" id="vino-step-error" role="alert">{stepError}</div>{/if}
          <button type="button" class="vino-modal-btn-primary" onclick={pay} disabled={paying}>{paying ? t.processing : t.pay}</button>
          {#if needsPicker}<button type="button" class="vino-modal-back-link" onclick={back}>{t.back}</button>{/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
