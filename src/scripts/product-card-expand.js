/* Limpieza defensiva: las tarjetas ahora crecen con su contenido. */
const CARD_SELECTOR = ".ab-provider-product-card";
const DETAILS_SELECTOR = ".ab-provider-product-card__details";
const EXPAND_BUTTON_CLASS = "ab-provider-product-card__expand";

let refreshTimer = 0;

const elementContainsCard = (node) => {
  if (!(node instanceof Element)) return false;
  return node.matches(CARD_SELECTOR) || Boolean(node.querySelector(CARD_SELECTOR));
};

/* Quita estados viejos de la etapa con tarjetas expandibles. */
const refreshCard = (card) => {
  if (!(card instanceof HTMLElement)) return;
  card.classList.remove("is-expanded");
  card.classList.remove("ab-card-can-expand");
  card.querySelector(`.${EXPAND_BUTTON_CLASS}`)?.remove();

  const details = card.querySelector(DETAILS_SELECTOR);
  if (!(details instanceof HTMLElement)) return;
  details.classList.remove("ab-card-details-clamped");
  if (card.classList.contains("ab-provider-product-card--detail")) return;

  window.requestAnimationFrame(() => {
    const hasOverflow = details.scrollHeight > details.clientHeight + 2;
    details.classList.toggle("ab-card-details-clamped", hasOverflow);
  });
};

/* Revisa todas las tarjetas visibles luego de cambios de layout/DOM. */
const refreshExpandableCards = () => {
  refreshTimer = 0;
  document.querySelectorAll(CARD_SELECTOR).forEach(refreshCard);
};

/* Agrupa refrescos para evitar medir layout demasiadas veces seguidas. */
const scheduleRefresh = () => {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshExpandableCards, 80);
};

/* Observa mutaciones y navegaciones Astro sin duplicar listeners. */
const bindProductCardExpand = () => {
  if (document.documentElement.dataset.abProductCardExpandBound === "true") return;
  document.documentElement.dataset.abProductCardExpandBound = "true";

  const observer = new MutationObserver((mutations) => {
    const hasCardMutation = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some(elementContainsCard) ||
      Array.from(mutation.removedNodes).some(elementContainsCard)
    );
    if (hasCardMutation) scheduleRefresh();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("resize", scheduleRefresh);
  document.addEventListener("astro:page-load", scheduleRefresh);
  document.addEventListener("astro:after-swap", scheduleRefresh);
  document.addEventListener("ab-products-rendered", scheduleRefresh);
  window.addEventListener("pageshow", scheduleRefresh);
};

bindProductCardExpand();
scheduleRefresh();
