<script lang="ts">
  /**
   * Cookie banner in the look of the WordPress "Cookie Notice" plugin, same
   * texts, plus a "Decline" button (Р-10). One choice covers analytics and
   * advertising together (spec 62 §8.1). The choice is kept in the necessary
   * cookie `vc_consent`; tracking loads only on `granted` (src/scripts/tracking.ts).
   */
  import { onMount } from 'svelte';
  import { readConsent, writeConsent, CONSENT_EVENT } from '../../scripts/consent.ts';

  interface Props {
    text: string;
    accept: string;
    decline: string;
    label: string;
  }
  let { text, accept, decline, label }: Props = $props();
  let open = $state(false);

  onMount(() => {
    open = readConsent() === null;
    const reopen = () => (open = true);
    document.querySelectorAll('[data-vc-cookie-settings]').forEach((el) => el.addEventListener('click', reopen));
    return () => document.querySelectorAll('[data-vc-cookie-settings]').forEach((el) => el.removeEventListener('click', reopen));
  });

  function choose(granted: boolean) {
    writeConsent(granted);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { granted } }));
    open = false;
  }
</script>

{#if open}
  <div class="cn-bar" role="dialog" aria-label={label}>
    <div class="cn-bar__container">
      <span class="cn-bar__text">{text}</span>
      <span class="cn-bar__buttons">
        <button type="button" class="cn-bar__button" onclick={() => choose(true)}>{accept}</button>
        <button type="button" class="cn-bar__button cn-bar__button--decline" onclick={() => choose(false)}>{decline}</button>
      </span>
    </div>
  </div>
{/if}
