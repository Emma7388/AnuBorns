/* Expansión progresiva para tarjetas de producto con texto largo. */
const CARD_SELECTOR = ".ab-provider-product-card";
const DETAILS_SELECTOR = ".ab-provider-product-card__details";
const DESCRIPTION_SELECTOR = ".ab-provider-product-card__description";
const ACTIONS_SELECTOR = ".ab-provider-product-card__actions";
const EXPAND_BUTTON_CLASS = "ab-provider-product-card__expand";
const DETAIL_CARD_CLASS = "ab-provider-product-card--detail";

let refreshTimer = 0;

/* Nodos que pueden desbordar dentro de una tarjeta. */
const getExpandableNodes = (card) => [
  card.querySelector(DESCRIPTION_SELECTOR),
  card.querySelector(DETAILS_SELECTOR),
].filter(Boolean);

/* Tolerancia pequeña para evitar falsos positivos por subpíxeles. */
const hasOverflow = (node) => node.scrollHeight > node.clientHeight + 2;

/* Mantiene clase visual, texto y estado ARIA sincronizados. */
const setExpanded = (card, button, expanded) => {
  card.classList.toggle("is-expanded", expanded);
  button.textContent = expanded ? "Ver menos" : "Ver más";
  button.setAttribute("aria-expanded", String(expanded));
};

/* Crea el botón solo cuando la tarjeta realmente lo necesita. */
const ensureExpandButton = (card) => {
  let button = card.querySelector(`.${EXPAND_BUTTON_CLASS}`);
  if (button) return button;

  button = document.createElement("button");
  button.type = "button";
  button.className = `ab-provider-product-card__button ab-provider-product-card__button--ghost ${EXPAND_BUTTON_CLASS}`;
  button.setAttribute("aria-expanded", "false");
  button.textContent = "Ver más";
  button.addEventListener("click", () => {
    setExpanded(card, button, !card.classList.contains("is-expanded"));
  });

  const actions = card.querySelector(ACTIONS_SELECTOR);
  if (actions) {
    card.insertBefore(button, actions);
  } else {
    card.appendChild(button);
  }
  return button;
};

/* Recalcula una tarjeta; las tarjetas de detalle quedan siempre auto-altas. */
const refreshCard = (card) => {
  if (!(card instanceof HTMLElement)) return;
  if (card.classList.contains(DETAIL_CARD_CLASS)) {
    card.classList.remove("ab-card-can-expand", "is-expanded");
    card.querySelector(`.${EXPAND_BUTTON_CLASS}`)?.remove();
    return;
  }

  const nodes = getExpandableNodes(card);
  const details = card.querySelector(DETAILS_SELECTOR);
  if (!details || nodes.length === 0) return;

  const wasExpanded = card.classList.contains("is-expanded");
  card.classList.add("ab-card-can-expand");
  card.classList.remove("is-expanded");
  const shouldExpand = nodes.some(hasOverflow);
  const button = card.querySelector(`.${EXPAND_BUTTON_CLASS}`);

  if (!shouldExpand) {
    card.classList.remove("ab-card-can-expand", "is-expanded");
    button?.remove();
    return;
  }

  const nextButton = ensureExpandButton(card);
  setExpanded(card, nextButton, wasExpanded);
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

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("resize", scheduleRefresh);
  document.addEventListener("astro:page-load", scheduleRefresh);
  document.addEventListener("astro:after-swap", scheduleRefresh);
  window.addEventListener("pageshow", scheduleRefresh);
};

bindProductCardExpand();
scheduleRefresh();
