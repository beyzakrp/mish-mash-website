/**
 * mish-mash motion layer: scroll reveals, magnetic buttons, the chrome
 * wordmark hero and the cart drawer suggestions.
 * Everything here is progressive enhancement; the page works without it.
 */

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const designMode = Boolean(window.Shopify && window.Shopify.designMode);

/* Scroll reveal ---------------------------------------------------------- */

const REVEAL_SELECTOR = [
  '.mm-section-head',
  '.mm-product',
  '.mm-character',
  '.mm-story-media',
  '.mm-story-copy > *',
  '[data-mm-reveal]',
].join(',');

const revealObserver =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-revealed');
            revealObserver.unobserve(entry.target);
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
      )
    : null;

/** @param {ParentNode} root */
function initReveal(root = document) {
  if (!revealObserver || reducedMotion.matches || designMode) return;

  for (const element of root.querySelectorAll(REVEAL_SELECTOR)) {
    if (!(element instanceof HTMLElement) || element.classList.contains('mm-reveal')) continue;
    // Anything already on screen at load stays put, so nothing flashes.
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) continue;

    const siblings = element.parentElement ? [...element.parentElement.children] : [element];
    element.style.setProperty('--mm-reveal-index', String(Math.min(siblings.indexOf(element), 6)));
    element.classList.add('mm-reveal');
    revealObserver.observe(element);
  }
}

/* Magnetic buttons --------------------------------------------------------- */

/** @param {ParentNode} root */
function initMagnetic(root = document) {
  if (!finePointer.matches || reducedMotion.matches) return;

  for (const button of root.querySelectorAll('.mm-button, .mm-product-arrow')) {
    if (!(button instanceof HTMLElement) || button.dataset.mmMagnetic) continue;
    button.dataset.mmMagnetic = 'true';
    const strength = button.classList.contains('mm-button') ? 0.18 : 0.3;

    button.addEventListener('pointermove', (event) => {
      const rect = button.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) * strength;
      const y = (event.clientY - rect.top - rect.height / 2) * strength;
      button.style.setProperty('--mm-magnet-x', `${x.toFixed(1)}px`);
      button.style.setProperty('--mm-magnet-y', `${y.toFixed(1)}px`);
    });
    button.addEventListener('pointerleave', () => {
      button.style.removeProperty('--mm-magnet-x');
      button.style.removeProperty('--mm-magnet-y');
    });
  }
}

/* Chrome wordmark hero ----------------------------------------------------- */

class MMChromeHero extends HTMLElement {
  connectedCallback() {
    this.stage = this.querySelector('.mm-chrome-stage');
    this.light = this.querySelector('fePointLight');
    this.onScroll = () => this.requestUpdate();
    this.onPointer = (/** @type {PointerEvent} */ event) => this.moveLight(event);

    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
    if (finePointer.matches && !reducedMotion.matches) this.addEventListener('pointermove', this.onPointer);
    this.update();
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    this.removeEventListener('pointermove', this.onPointer);
  }

  requestUpdate() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  }

  update() {
    if (reducedMotion.matches) {
      this.style.setProperty('--mm-progress', '0');
      return;
    }
    const rect = this.getBoundingClientRect();
    const travel = Math.max(rect.height - window.innerHeight, 1);
    const progress = Math.min(Math.max(-rect.top / travel, 0), 1);
    this.style.setProperty('--mm-progress', progress.toFixed(4));
    this.classList.toggle('is-zooming', progress > 0 && progress < 1);
  }

  /** @param {PointerEvent} event */
  moveLight(event) {
    if (!this.light || !this.stage) return;
    const svg = this.light.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const box = svg.viewBox.baseVal;
    const x = box.x + ((event.clientX - rect.left) / rect.width) * box.width;
    const y = box.y + ((event.clientY - rect.top) / rect.height) * box.height;
    if (this.lightFrame) cancelAnimationFrame(this.lightFrame);
    this.lightFrame = requestAnimationFrame(() => {
      this.light?.setAttribute('x', x.toFixed(0));
      this.light?.setAttribute('y', (y - 120).toFixed(0));
    });
  }
}

if (!customElements.get('mm-chrome-hero')) customElements.define('mm-chrome-hero', MMChromeHero);

/* Cart drawer suggestions -------------------------------------------------- */

class MMCartUpsell extends HTMLElement {
  static observedAttributes = ['data-product-id', 'data-exclude', 'hidden'];

  /** @type {Map<string, Element | null>} */
  static cache = new Map();

  connectedCallback() {
    this.load();
  }

  attributeChangedCallback() {
    // The cart drawer re-renders by morphing, which resets this element. Restore or refetch.
    if (this.isConnected) queueMicrotask(() => this.load());
  }

  get key() {
    return `${this.dataset.productId}|${this.dataset.exclude}`;
  }

  load() {
    const productId = this.dataset.productId;
    const url = this.dataset.url;
    if (!productId || !url) return;
    if (this.renderedKey === this.key && !this.hidden && this.firstElementChild) return;

    const key = this.key;
    if (MMCartUpsell.cache.has(key)) {
      this.show(MMCartUpsell.cache.get(key) || null, key);
      return;
    }

    const query = new URLSearchParams({
      product_id: productId,
      limit: this.dataset.limit || '4',
      section_id: 'mm-cart-upsell',
      intent: 'related',
    });

    fetch(`${url}?${query}`)
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        const list = new DOMParser().parseFromString(text, 'text/html').querySelector('.mm-upsell');
        const inCart = (this.dataset.exclude || '').split(',');
        for (const item of list ? list.querySelectorAll('[data-product-id]') : []) {
          if (item instanceof HTMLElement && inCart.includes(item.dataset.productId || '')) item.remove();
        }
        const usable = list && list.querySelector('[data-product-id]') ? list : null;
        MMCartUpsell.cache.set(key, usable);
        if (key === this.key) this.show(usable, key);
      })
      .catch(() => {});
  }

  /**
   * @param {Element | null} list
   * @param {string} key
   */
  show(list, key) {
    this.renderedKey = key;
    if (!list) return;
    this.replaceChildren(list.cloneNode(true));
    if (this.hidden) this.hidden = false;
  }
}

if (!customElements.get('mm-cart-upsell')) customElements.define('mm-cart-upsell', MMCartUpsell);

/* Boot --------------------------------------------------------------------- */

function init(root = document) {
  initReveal(root);
  initMagnetic(root);
}

init();
document.addEventListener('shopify:section:load', (event) => {
  if (event.target instanceof HTMLElement) init(event.target);
});
