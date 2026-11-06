<script lang="ts">
  /**
   * Order status ("Спасибо") after AllPay (spec 62 §5.5). The return from the
   * payment page proves nothing: the state comes only from
   * GET /v1/public/checkout/{token}. The token arrives in the address once,
   * moves to sessionStorage and leaves the address at once (§5.6). Personal
   * page: no third-party scripts; the share buttons are plain links.
   */
  import { onDestroy, onMount } from 'svelte';
  import { createArenaClient, ArenaApiError } from '../../arena/client.ts';
  import type { CheckoutStatus, ReferralOffer } from '../../arena/types.ts';
  import { isFinal, nextPollDelay, shareLinks, takeToken, viewOf, type StatusView } from '../../lib/order-status.ts';
  import { LAST_EVENT_KEY, fmt } from '../../lib/purchase.ts';
  import { formatWhen } from '../../lib/when.ts';

  type Strings = Record<string, string>;
  interface Props {
    t: Strings;
    apiBase: string;
    feedToken: string;
    /** Site paths in the page's language. */
    myTicketsPath: string;
    upcomingPath: string;
    /** Absolute URL the share buttons share (the WordPress page shared the events list). */
    shareUrl: string;
    contactEmail: string;
    /** BCP 47 tag of the page language for the date. */
    intl?: string;
  }
  let { t, apiBase, feedToken, myTicketsPath, upcomingPath, shareUrl, contactEmail, intl = 'ru-RU' }: Props = $props();

  // svelte-ignore state_referenced_locally
  const client = createArenaClient({ apiBase, feedToken, timeoutMs: 20_000 });

  let token = $state<string | null>(null);
  let status = $state<CheckoutStatus | null>(null);
  let view = $state<StatusView | 'none' | 'error'>('pending');
  let slow = $state(false);
  let referral = $state<ReferralOffer | null>(null);
  let recovering = $state(false);
  let recoverMessage = $state('');
  let eventLink = $state<{ path: string; name: string } | null>(null);
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let alive = true;

  const links = $derived(shareLinks(shareUrl, t.share));
  const ev = $derived(status?.event ?? null);

  async function poll() {
    if (!token || !alive) return;
    try {
      const s = await client.checkoutStatus(token);
      status = s;
      view = viewOf(s.status);
      if (view === 'paid' && !referral) void loadReferral();
    } catch (e) {
      if (e instanceof ArenaApiError && e.status === 404) {
        view = 'error';
        return;
      }
      /* a failed poll is retried on the schedule below */
    }
    if (view !== 'pending' && view !== 'error') return;
    const delay = nextPollDelay(Date.now() - started);
    if (delay === null) {
      slow = true;
      return;
    }
    timer = setTimeout(poll, delay);
  }

  async function loadReferral() {
    try {
      const r = await client.referral(token!);
      if (r && r.code) referral = r;
    } catch {
      /* no programme block */
    }
  }

  async function recover() {
    if (!token) return;
    recovering = true;
    recoverMessage = '';
    try {
      await client.recoverCheckout(token);
      slow = false;
      started = Date.now();
      view = 'pending';
      await poll();
    } catch (e) {
      recoverMessage = e instanceof ArenaApiError && e.status === 409 ? t.recoverGone : t.error;
    } finally {
      recovering = false;
    }
  }

  function pdfHref(path: string) {
    return client.absolute(path);
  }

  onMount(() => {
    let store: Storage | null = null;
    try {
      store = sessionStorage;
    } catch {
      store = null;
    }
    const taken = takeToken(location.href, store);
    if (taken.cleanUrl !== null) history.replaceState(null, '', taken.cleanUrl);
    token = taken.token;
    try {
      const last = store?.getItem(LAST_EVENT_KEY);
      eventLink = last ? (JSON.parse(last) as { path: string; name: string }) : null;
    } catch {
      eventLink = null;
    }
    if (!token) {
      view = 'none';
      return;
    }
    started = Date.now();
    void poll();
  });

  onDestroy(() => {
    alive = false;
    if (timer) clearTimeout(timer);
  });
</script>

{#snippet eventBlock()}
  {#if ev}
    <div class="vc-order__event">
      <strong class="vc-order__event-name">{ev.name}</strong>
      <span class="vc-order__event-when">{formatWhen(ev.start_at, ev.timezone, intl)}</span>
      {#if ev.venue_name}<span class="vc-order__event-venue">{ev.venue_name}</span>{/if}
    </div>
  {/if}
{/snippet}

<div class="vc-order" data-view={view} aria-live="polite">
  {#if view === 'none'}
    <p class="vc-personal__status">{t.noToken}</p>
    <a class="vc-btn vc-btn--primary" href={myTicketsPath}>{t.myTickets}</a>
  {:else if view === 'error'}
    <p class="vc-personal__status">{t.error}</p>
    <a class="vc-btn vc-btn--primary" href={myTicketsPath}>{t.myTickets}</a>
  {:else if view === 'pending'}
    {#if !slow}
      <p class="vc-personal__status"><span class="vc-order__spinner" aria-hidden="true"></span>{t.checking}</p>
    {:else}
      <p class="vc-personal__status">{fmt(t.pendingSlow, contactEmail)}</p>
      <a class="vc-btn vc-btn--primary" href={myTicketsPath}>{t.myTickets}</a>
    {/if}
  {:else if view === 'paid'}
    <h2 class="vc-order__title">{t.paidTitle}</h2>
    {@render eventBlock()}
    <p>{t.paidText1}<br />{t.paidText2}</p>
    {#if status?.order_number}<p class="vc-order__number">{t.orderNumber} <strong>{status.order_number}</strong></p>{/if}
    {#if status?.tickets?.length}
      <ul class="vc-order__tickets" aria-label={t.ticketsTitle}>
        {#each status.tickets as ticket, i (ticket.ticket_id)}
          <li>
            {#if ticket.pdf_url}
              <a href={pdfHref(ticket.pdf_url)} target="_blank" rel="noopener">{fmt(t.ticketPdf, ticket.human_code || String(i + 1))}</a>
            {:else}
              <span>{fmt(t.ticketPdf, ticket.human_code || String(i + 1))}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <p class="vc-order__account"><strong>{t.accountStrong}</strong> {t.accountText}</p>
    <p><a class="vc-btn vc-btn--primary" href={myTicketsPath}>{t.accountButton}</a></p>
    <p>{t.thanks1}<br />{t.thanks2}</p>
    {#if referral}
      <section class="vc-order__referral">
        <h3>{t.referralTitle}</h3>
        <p>{fmt(t.referralText, referral.friend_discount_pct, referral.cashback_pct)}</p>
        <p>{t.referralCode} <strong class="vc-order__code">{referral.code}</strong></p>
        {#if referral.share_url}<p><a class="vc-btn vc-btn--primary" href={referral.share_url} target="_blank" rel="noopener">{t.referralShare}</a></p>{/if}
      </section>
    {/if}
    <h3 class="vc-order__share-title">{t.share}</h3>
    <ul class="vc-order__share">
      {#each links as l (l.name)}
        <li><a class={`vc-share vc-share--${l.name.toLowerCase()}`} href={l.href} target="_blank" rel="noopener" aria-label={fmt(t.shareAria, l.name)}>{l.name}</a></li>
      {/each}
    </ul>
  {:else if view === 'failed'}
    <h2 class="vc-order__title">{t.failedTitle}</h2>
    {@render eventBlock()}
    <p>{t.failedText}</p>
    {#if status?.payment_url}<p><a class="vc-btn vc-btn--primary" href={status.payment_url}>{t.retry}</a></p>{/if}
    <p><a href={eventLink?.path ?? upcomingPath}>{eventLink?.name ?? t.toEvents}</a></p>
  {:else if view === 'expired'}
    <h2 class="vc-order__title">{t.expiredTitle}</h2>
    {@render eventBlock()}
    <p><button type="button" class="vc-btn vc-btn--primary" onclick={recover} disabled={recovering}>{t.recover}</button></p>
    {#if recoverMessage}<p class="vc-order__error" role="alert">{recoverMessage}</p>{/if}
    <p><a href={eventLink?.path ?? upcomingPath}>{eventLink?.name ?? t.toEvents}</a></p>
  {:else if view === 'cancelled'}
    <h2 class="vc-order__title">{t.cancelledTitle}</h2>
    {@render eventBlock()}
    <p>{t.cancelledText}</p>
    <p><a href={eventLink?.path ?? upcomingPath}>{eventLink?.name ?? t.toEvents}</a></p>
  {:else if view === 'refunded'}
    <h2 class="vc-order__title">{t.refundedTitle}</h2>
    {@render eventBlock()}
    <p>{t.refundedText}</p>
  {:else if view === 'review'}
    <h2 class="vc-order__title">{t.reviewTitle}</h2>
    {@render eventBlock()}
    <p>{fmt(t.reviewText, contactEmail)}</p>
  {/if}
</div>
