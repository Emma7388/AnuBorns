const closeProductMenus = (exceptSwitch = null) => {
  document.querySelectorAll("[data-buy-switch]").forEach((switchEl) => {
    if (switchEl === exceptSwitch) return;
    switchEl.querySelectorAll(".ab-buy-switch__item.is-open").forEach((item) => {
      item.classList.remove("is-open");
      item.querySelector("[data-buy-switch-trigger]")?.setAttribute("aria-expanded", "false");
    });
  });
};

const initBuySwitchMenus = () => {
  document.querySelectorAll("[data-buy-switch-trigger]").forEach((trigger) => {
    if (trigger.dataset.buySwitchBound === "true") return;
    const switchEl = trigger.closest("[data-buy-switch]");
    const item = trigger.closest(".ab-buy-switch__item");
    const menu = item?.querySelector("[data-buy-switch-menu]");
    if (!switchEl || !item || !menu) return;

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      const willOpen = !item.classList.contains("is-open");
      closeProductMenus(switchEl);
      item.classList.toggle("is-open", willOpen);
      trigger.setAttribute("aria-expanded", String(willOpen));
    });

    trigger.dataset.buySwitchBound = "true";
  });
};

const closeMenusFromOutside = (event) => {
  if (event.target?.closest?.("[data-buy-switch]")) return;
  closeProductMenus();
};

const closeMenusWithEscape = (event) => {
  if (event.key !== "Escape") return;
  closeProductMenus();
};

initBuySwitchMenus();

if (!window.__abBuySwitchMenusBound) {
  document.addEventListener("click", closeMenusFromOutside);
  document.addEventListener("keydown", closeMenusWithEscape);
  document.addEventListener("astro:page-load", initBuySwitchMenus);
  document.addEventListener("astro:after-swap", initBuySwitchMenus);
  window.addEventListener("pageshow", initBuySwitchMenus);
  window.__abBuySwitchMenusBound = true;
}
