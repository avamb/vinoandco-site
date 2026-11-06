<script lang="ts">
  /**
   * Purchase modal — STUB. The real copy of the WordPress `vino-modal`
   * (choose ticket → your details → PAY → AllPay, spec 62 §5.1) comes with the
   * purchase flow; it will call the platform only through src/arena/.
   * Here the "Buy ticket" button opens the modal frame with its title.
   */
  import { onMount } from 'svelte';

  interface Props {
    title: string;
    closeLabel: string;
    stub: string;
    eventId: string;
    sessionId: string;
  }
  let { title, closeLabel, stub, eventId, sessionId }: Props = $props();
  let open = $state(false);
  let selected = $state(sessionId);

  onMount(() => {
    const buttons = document.querySelectorAll<HTMLElement>('[data-vino-buy]');
    const onClick = (e: Event) => {
      e.preventDefault();
      selected = (e.currentTarget as HTMLElement).dataset.session || sessionId;
      open = true;
    };
    buttons.forEach((b) => b.addEventListener('click', onClick));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };
    window.addEventListener('keydown', onKey);
    return () => {
      buttons.forEach((b) => b.removeEventListener('click', onClick));
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="vino-modal-backdrop" onclick={(e) => { if (e.target === e.currentTarget) open = false; }}>
    <div class="vino-modal" role="dialog" aria-modal="true" aria-labelledby="vino-modal-title" data-event={eventId} data-session={selected}>
      <button type="button" class="vino-modal__close" aria-label={closeLabel} onclick={() => (open = false)}>&#x2715;</button>
      <h2 id="vino-modal-title">{title}</h2>
      <p>{stub}</p>
    </div>
  </div>
{/if}
