/**
 * Event carousel of the home page (the Elementor loop carousel on WordPress): two cards
 * per view (one on a phone), arrows and dots, scroll-snap so it also works by swipe.
 * No autoplay: moving content that cannot be paused fails WCAG 2.2.2; WordPress autoplayed
 * every 5 seconds, which is the one deliberate difference.
 */
function init(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>('[data-carousel-track]');
  const prev = root.querySelector<HTMLButtonElement>('[data-carousel-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]');
  const dots = root.querySelector<HTMLElement>('[data-carousel-dots]');
  if (!track) return;
  const cards = Array.from(track.children) as HTMLElement[];
  const rtl = getComputedStyle(track).direction === 'rtl';
  const perView = () => (track.clientWidth > 0 ? Math.max(1, Math.round(track.clientWidth / (cards[0]?.offsetWidth || track.clientWidth))) : 1);
  const step = () => (cards[1] ? Math.abs(cards[1].offsetLeft - cards[0]!.offsetLeft) : track.clientWidth);
  const index = () => Math.round(Math.abs(track.scrollLeft) / (step() || 1));
  const maxIndex = () => Math.max(0, cards.length - perView());
  const go = (i: number) => {
    const n = Math.max(0, Math.min(i, maxIndex()));
    track.scrollTo({ left: (rtl ? -1 : 1) * n * step(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const sync = () => {
    const i = index();
    dots?.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    root.classList.toggle('is-static', cards.length <= perView());
  };
  if (dots) {
    dots.replaceChildren(
      ...cards.map((_, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vc-carousel__dot';
        b.setAttribute('aria-label', `${k + 1} / ${cards.length}`);
        b.addEventListener('click', () => go(k));
        return b;
      }),
    );
  }
  prev?.addEventListener('click', () => go(index() === 0 ? maxIndex() : index() - 1));
  next?.addEventListener('click', () => go(index() >= maxIndex() ? 0 : index() + 1));
  track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  addEventListener('resize', sync);
  sync();
}
document.querySelectorAll<HTMLElement>('[data-carousel]').forEach(init);
