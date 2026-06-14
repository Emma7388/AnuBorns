const CARD_SELECTOR = ".ab-provider-product-card";
const DETAILS_SELECTOR = ".ab-provider-product-card__details";
const DESCRIPTION_SELECTOR = ".ab-provider-product-card__description";
const ACTIONS_SELECTOR = ".ab-provider-product-card__actions";
const EXPAND_BUTTON_CLASS = "ab-provider-product-card__expand";

let refreshTimer = 0;

const getExpandableNodes = (card) => [
  card.querySelector(DESCRIPTION_SELECTOR),
  card.querySelector(DETAILS_SELECTOR),
].filter(Boolean);

const hasOverflow = (node) => node.scrollHeight > node.clientHeight + 2;

const setExpanded = (card, button, expanded) => {
  card.classList.toggle("is-expanded", expanded);
  button.textContent = expanded ? "Ver menos" : "Ver más";
  button.setAttribute("aria-expanded", String(expanded));
};

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

const refreshCard = (card) => {
  if (!(card instanceof HTMLElement)) return;
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

const refreshExpandableCards = () => {
  refreshTimer = 0;
  document.querySelectorAll(CARD_SELECTOR).forEach(refreshCard);
};

const scheduleRefresh = () => {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshExpandableCards, 80);
};

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
