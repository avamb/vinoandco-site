<script lang="ts">
  /**
   * "My tickets by link" (spec 62 §7). Three screens: the e-mail form (the
   * platform answers 202 whatever the address, so the text is always "check
   * your e-mail"), the landing from the e-mailed link (a button spends the
   * one-time token, the page itself never does) and the orders of the 4-hour
   * session with PDF download through fetch + Bearer + blob. Personal page: no
   * third-party scripts.
   */
  import { onMount } from 'svelte';
  import { createArenaClient } from '../../arena/client.ts';
  import { EMAIL_RE } from '../../arena/cart.ts';
  import type { MyTicketsOrder, MyTicketsSession } from '../../arena/types.ts';
  import { clearSession, errorKind, exchangeLinkToken, readSession, takeLinkToken, ticketFileName, type ErrorKind } from '../../lib/my-tickets.ts';
  import { fmt } from '../../lib/purchase.ts';
  import { formatWhen } from '../../lib/when.ts';

  type Strings = Record<string, string>;
  interface Props {
    t: Strings;
    apiBase: string;
    feedToken: string;
    lang: string;
    intl: string;
    /** Absolute address of this page; the e-mailed link opens it with ?t=. */
    pageUrl: string;
    upcomingPath: string;
  }
  let { t, apiBase, feedToken, lang, intl, pageUrl, upcomingPath }: Props = $props();

  // svelte-ignore state_referenced_locally
  const client = createArenaClient({ apiBase, feedToken, timeoutMs: 20_000 });

  type Screen = 'request' | 'landing' | 'orders';
  let screen = $state<Screen>('request');
  let store: Storage | null = null;
  let session: MyTicketsSession | null = null;

  let email = $state('');
  let sending = $state(false);
  let sent = $state(false);
  let notice = $state('');

  let opening = $state(false);
  let loading = $state(false);
  let orders = $state<MyTicketsOrder[]>([]);
  let page = $state(1);
  let totalPages = $state(1);
  let loaded = $state(false);
  let busyTicket = $state<string | null>(null);

  const text = (k: ErrorKind): string => (k === 'rateLimited' ? t.rateLimited : k === 'unavailable' ? t.unavailable : k === 'notReady' ? t.pdfNotReady : t.error);

  async function requestLink(ev: SubmitEvent) {
    ev.preventDefault();
    notice = '';
    if (!EMAIL_RE.test(email.trim())) {
      notice = t.invalidEmail;
      return;
    }
    sending = true;
    try {
      await client.requestMyTicketsLink({ email: email.trim(), locale: lang, page_url: pageUrl });
      sent = true;
    } catch (e) {
      notice = text(errorKind(e));
    } finally {
      sending = false;
    }
  }

  function backToRequest(message = '') {
    clearSession(store);
    session = null;
    orders = [];
    loaded = false;
    screen = 'request';
    sent = false;
    notice = message;
  }

  async function open() {
    opening = true;
    notice = '';
    const r = await exchangeLinkToken(client, store);
    opening = false;
    if (r.kind === 'expired') return backToRequest(t.linkExpired);
    if (r.kind === 'error') {
      notice = text(r.reason);
      return;
    }
    session = r.session;
    screen = 'orders';
    await loadPage(1);
  }

  async function loadPage(n: number) {
    if (!session) return;
    loading = true;
    notice = '';
    try {
      const res = await client.myTicketsOrders(session.session_token, n);
      orders = n === 1 ? res.orders : [...orders, ...res.orders];
      page = res.pagination.page;
      totalPages = res.pagination.total_pages;
      loaded = true;
    } catch (e) {
      if (errorKind(e) === 'session') return backToRequest(t.sessionExpired);
      notice = text(errorKind(e));
    } finally {
      loading = false;
    }
  }

  async function download(o: MyTicketsOrder, ticketId: string, index: number, code?: string | null) {
    if (!session || busyTicket) return;
    busyTicket = ticketId;
    notice = '';
    try {
      const blob = await client.myTicketsPdf(session.session_token, o.order_id, ticketId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = ticketFileName(o.order_number, code, index);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      const k = errorKind(e);
      if (k === 'session') backToRequest(t.sessionExpired);
      else notice = k === 'notReady' ? t.pdfNotReady : t.pdfError;
    } finally {
      busyTicket = null;
    }
  }

  async function logout() {
    const s = session;
    backToRequest(t.loggedOut);
    if (!s) return;
    try {
      await client.revokeMyTicketsSession(s.session_token);
    } catch {
      /* the session ends by itself in 4 hours; a 401 means it already has */
    }
  }

  function orderState(o: MyTicketsOrder): string {
    if (o.session_cancelled) return t.sessionCancelled;
    if (o.status === 'refunded') return t.statusRefunded;
    if (o.status === 'cancelled') return t.statusCancelled;
    return '';
  }

  onMount(() => {
    try {
      store = sessionStorage;
    } catch {
      store = null;
    }
    const taken = takeLinkToken(location.href, store);
    if (taken.cleanUrl !== null) history.replaceState(null, '', taken.cleanUrl);
    session = readSession(store);
    if (session) {
      screen = 'orders';
      void loadPage(1);
    } else if (taken.token) {
      screen = 'landing';
    }
  });
</script>

<div class="vc-mt" data-screen={screen} aria-live="polite">
  {#if screen === 'request'}
    {#if sent}
      <p class="vc-personal__status">{t.sent}</p>
    {:else}
      <p>{t.intro}</p>
      <form onsubmit={requestLink} novalidate>
        <label for="vc-mt-email">{t.email}</label>
        <input type="email" id="vc-mt-email" name="email" bind:value={email} required autocomplete="email" />
        <button type="submit" class="vc-btn vc-btn--primary vc-btn--block" disabled={sending}>{sending ? t.sending : t.submit}</button>
      </form>
    {/if}
    {#if notice}<p class="vc-order__error" role="alert">{notice}</p>{/if}
  {:else if screen === 'landing'}
    <p>{t.landingIntro}</p>
    <button type="button" class="vc-btn vc-btn--primary vc-btn--block" onclick={open} disabled={opening}>{opening ? t.opening : t.open}</button>
    {#if notice}<p class="vc-order__error" role="alert">{notice}</p>{/if}
  {:else}
    {#if !loaded && loading}
      <p class="vc-personal__status"><span class="vc-order__spinner" aria-hidden="true"></span>{t.loading}</p>
    {:else if loaded && orders.length === 0}
      <p class="vc-personal__status">{t.empty}</p>
      <p><a href={upcomingPath}>{t.toEvents}</a></p>
    {/if}
    {#each orders as o (o.order_id)}
      <section class="vc-mt__order">
        <h2 class="vc-mt__event">{o.event.name}</h2>
        <p class="vc-mt__when">
          {formatWhen(o.event.start_at, o.event.timezone, intl)}{#if o.event.venue_name}, {o.event.venue_name}{/if}
        </p>
        <p class="vc-mt__meta">
          {fmt(t.orderNumber, o.order_number)}
          {#if orderState(o)}<strong class="vc-mt__state">{orderState(o)}</strong>{/if}
        </p>
        <ul class="vc-mt__tickets">
          {#each o.tickets as ticket, i (ticket.ticket_id)}
            <li>
              <span class="vc-mt__ticket">
                {fmt(t.ticket, ticket.human_code || String(i + 1))}
                {#if ticket.tier_name}<small>{ticket.tier_name}</small>{/if}
              </span>
              {#if ticket.status === 'active' && o.status === 'paid' && !o.session_cancelled}
                <button type="button" class="vc-btn vc-btn--primary" onclick={() => download(o, ticket.ticket_id, i, ticket.human_code)} disabled={busyTicket !== null}>
                  {busyTicket === ticket.ticket_id ? t.downloading : t.download}
                </button>
              {:else}
                <small>{t.ticketInactive}</small>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
    {#if notice}<p class="vc-order__error" role="alert">{notice}</p>{/if}
    {#if page < totalPages}
      <p><button type="button" class="vc-btn vc-btn--primary" onclick={() => loadPage(page + 1)} disabled={loading}>{t.loadMore}</button></p>
    {/if}
    <p class="vc-mt__logout"><button type="button" class="vc-mt__link" onclick={logout}>{t.logout}</button></p>
  {/if}
</div>
