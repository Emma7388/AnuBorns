const formatPrice = (value) => {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("es-AR");
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getProductHref = (item) => {
  const sellerUserId = String(item?.sellerUserId ?? "").trim();
  const productId = String(item?.productId ?? "").trim();
  if (productId) return `/producto/${encodeURIComponent(productId)}`;
  if (sellerUserId) return `/proveedor-publico/${encodeURIComponent(sellerUserId)}`;
  return "#";
};

const serializeDelivery = (value) =>
  Array.isArray(value) ? value.map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean).join(",") : "";

const AUTOPLAY_MS = 4_200;

const getFeaturedCards = (section) =>
  Array.from(section.querySelectorAll("[data-featured-products-grid] > .ab-provider-product-card"));

const createCarouselButton = (direction) => {
  const button = document.createElement("button");
  const isPrev = direction === "prev";
  button.type = "button";
  button.className = `ab-featured-products-nav ab-featured-products-nav--${direction}`;
  button.setAttribute("aria-label", isPrev ? "Ver producto destacado anterior" : "Ver siguiente producto destacado");
  button.setAttribute(isPrev ? "data-featured-products-prev" : "data-featured-products-next", "");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="${isPrev ? "M15.5 5 8.5 12l7 7" : "m8.5 5 7 7-7 7"}"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></path>
    </svg>
  `;
  return button;
};

const ensureFeaturedCarouselMarkup = (section) => {
  const grid = section.querySelector("[data-featured-products-grid]");
  if (!grid) return;
  section.classList.add("ab-featured-products-panel");
  grid.classList.add("ab-featured-products-track");

  let carousel = section.querySelector("[data-featured-products-carousel]");
  if (!carousel) {
    carousel = document.createElement("div");
    carousel.className = "ab-featured-products-carousel";
    carousel.dataset.featuredProductsCarousel = "";
    grid.parentNode?.insertBefore(carousel, grid);
    carousel.appendChild(grid);
  }

  if (!carousel.querySelector("[data-featured-products-prev]")) {
    carousel.insertBefore(createCarouselButton("prev"), carousel.firstChild);
  }
  if (!carousel.querySelector("[data-featured-products-next]")) {
    carousel.appendChild(createCarouselButton("next"));
  }
};

const scrollFeaturedToIndex = (section, index) => {
  const grid = section.querySelector("[data-featured-products-grid]");
  const cards = getFeaturedCards(section);
  if (!grid || cards.length === 0) return;
  const safeIndex = ((index % cards.length) + cards.length) % cards.length;
  grid.scrollTo({
    left: cards[safeIndex].offsetLeft - grid.offsetLeft,
    behavior: "smooth",
  });
};

const getCurrentFeaturedIndex = (section) => {
  const grid = section.querySelector("[data-featured-products-grid]");
  const cards = getFeaturedCards(section);
  if (!grid || cards.length === 0) return 0;
  const scrollLeft = grid.scrollLeft;
  return cards.reduce((closestIndex, card, index) => {
    const currentDistance = Math.abs(cards[closestIndex].offsetLeft - grid.offsetLeft - scrollLeft);
    const nextDistance = Math.abs(card.offsetLeft - grid.offsetLeft - scrollLeft);
    return nextDistance < currentDistance ? index : closestIndex;
  }, 0);
};

const setFeaturedCarouselControls = (section) => {
  const cards = getFeaturedCards(section);
  const shouldHide = cards.length <= 1;
  section.querySelectorAll("[data-featured-products-prev], [data-featured-products-next]").forEach((button) => {
    button.classList.toggle("ab-is-hidden", shouldHide);
    button.disabled = shouldHide;
  });
};

const stopFeaturedAutoplay = (section) => {
  if (!section.__abFeaturedAutoplay) return;
  window.clearInterval(section.__abFeaturedAutoplay);
  delete section.__abFeaturedAutoplay;
};

const startFeaturedAutoplay = (section) => {
  stopFeaturedAutoplay(section);
  const cards = getFeaturedCards(section);
  if (cards.length <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  section.__abFeaturedAutoplay = window.setInterval(() => {
    if (section.matches(":hover") || section.contains(document.activeElement)) return;
    scrollFeaturedToIndex(section, getCurrentFeaturedIndex(section) + 1);
  }, AUTOPLAY_MS);
};

const initFeaturedCarousel = (section) => {
  ensureFeaturedCarouselMarkup(section);
  const grid = section.querySelector("[data-featured-products-grid]");
  const prev = section.querySelector("[data-featured-products-prev]");
  const next = section.querySelector("[data-featured-products-next]");
  if (!grid || !prev || !next) return;

  setFeaturedCarouselControls(section);

  if (section.dataset.featuredCarouselBound !== "true") {
    prev.addEventListener("click", () => {
      scrollFeaturedToIndex(section, getCurrentFeaturedIndex(section) - 1);
      startFeaturedAutoplay(section);
    });
    next.addEventListener("click", () => {
      scrollFeaturedToIndex(section, getCurrentFeaturedIndex(section) + 1);
      startFeaturedAutoplay(section);
    });
    grid.addEventListener("scroll", () => {
      window.clearTimeout(section.__abFeaturedScrollTimer);
      section.__abFeaturedScrollTimer = window.setTimeout(() => startFeaturedAutoplay(section), AUTOPLAY_MS);
    });
    section.addEventListener("pointerenter", () => stopFeaturedAutoplay(section));
    section.addEventListener("pointerleave", () => startFeaturedAutoplay(section));
    section.addEventListener("focusin", () => stopFeaturedAutoplay(section));
    section.addEventListener("focusout", () => startFeaturedAutoplay(section));
    section.dataset.featuredCarouselBound = "true";
  }

  startFeaturedAutoplay(section);
};

const renderFeaturedSection = (section, items) => {
  const status = section.querySelector("[data-featured-products-status]");
  const grid = section.querySelector("[data-featured-products-grid]");
  const empty = section.querySelector("[data-featured-products-empty]");
  if (!status || !grid || !empty) return;

  grid.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    status.textContent = "";
    empty.classList.remove("ab-is-hidden");
    section.dataset.featuredLoaded = "true";
    initFeaturedCarousel(section);
    document.dispatchEvent(new CustomEvent("ab-products-rendered"));
    return;
  }

  empty.classList.add("ab-is-hidden");
  status.textContent = "";

  items.forEach((item) => {
    const href = getProductHref(item);
    const sellerUserId = String(item?.sellerUserId ?? "").trim();
    const productId = String(item?.productId ?? "").trim();
    const card = document.createElement("article");
    card.className = "ab-provider-product-card";
    card.dataset.userId = sellerUserId;
    card.dataset.cartId = productId;
    card.dataset.price = String(item?.price ?? 0);
    card.dataset.title = String(item?.title ?? "");
    card.dataset.image = String(item?.imageUrl ?? "/logo2.svg");
    card.dataset.provider = String(item?.sellerName ?? "Proveedor");
    card.dataset.currency = String(item?.currency ?? "ARS");
    card.dataset.delivery = serializeDelivery(item?.deliveryMethods);
    card.innerHTML = `
      <a href="${href}" class="ab-featured-card-link" ${sellerUserId || productId ? "" : 'aria-disabled="true"'}>
        <img
          class="ab-provider-product-card__image"
          src="${escapeHtml(item?.imageUrl ?? "/logo2.svg")}"
          alt="${escapeHtml(item?.title ?? "Producto")}"
          loading="lazy"
        />
        <div class="ab-provider-product-card__meta">
          <div>
            <p class="ab-provider-product-card__label">Destacado</p>
            <p class="ab-provider-product-card__code">${escapeHtml(item?.sellerName ?? "Proveedor")}</p>
          </div>
          <p class="ab-provider-product-card__price">
            $${formatPrice(item?.price ?? 0)} <span>${escapeHtml(item?.currency ?? "ARS")}</span>
          </p>
        </div>
        <h2>${escapeHtml(item?.title ?? "Producto")}</h2>
        <p class="ab-provider-product-card__description">
          ${escapeHtml(item?.description || "Sin descripción")}
        </p>
      </a>
      <button
        type="button"
        class="ab-provider-product-card__add"
        aria-label="Agregar al carrito"
        title="Agregar al carrito"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6.2 6l.7 3.2h11.7a1 1 0 0 1 1 .8l-1.1 5a1 1 0 0 1-1 .8H8.2a1 1 0 0 1-1-.8L5.1 5H3a1 1 0 1 1 0-2h2.9a1 1 0 0 1 1 .8L7.1 4H20a1 1 0 1 1 0 2H6.2z"
            fill="currentColor"
          ></path>
        </svg>
      </button>
    `;
    grid.appendChild(card);
  });

  section.dataset.featuredLoaded = "true";
  initFeaturedCarousel(section);
  document.dispatchEvent(new CustomEvent("ab-products-rendered"));
};

const loadFeaturedSection = async (section) => {
  const status = section.querySelector("[data-featured-products-status]");
  const grid = section.querySelector("[data-featured-products-grid]");
  if (!status || !grid) return;

  if (section.dataset.featuredLoading === "true") return;
  if (section.dataset.featuredLoaded === "true") {
    initFeaturedCarousel(section);
    document.dispatchEvent(new CustomEvent("ab-products-rendered"));
    return;
  }

  if (grid.children.length > 0) {
    section.dataset.featuredLoaded = "true";
    initFeaturedCarousel(section);
    document.dispatchEvent(new CustomEvent("ab-products-rendered"));
    return;
  }

  section.dataset.featuredLoading = "true";
  status.textContent = "Cargando destacados...";

  const previousController = section.__abFeaturedController;
  previousController?.abort();
  const controller = new AbortController();
  section.__abFeaturedController = controller;

  try {
    const response = await fetch("/api/featured-products", {
      method: "GET",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      status.textContent = "No se pudieron cargar los productos destacados.";
      return;
    }
    renderFeaturedSection(section, Array.isArray(payload?.items) ? payload.items : []);
  } catch (error) {
    if (error?.name === "AbortError") return;
    status.textContent = "No se pudieron cargar los productos destacados.";
  } finally {
    if (section.__abFeaturedController === controller) {
      delete section.__abFeaturedController;
      delete section.dataset.featuredLoading;
    }
  }
};

const initFeaturedProducts = () => {
  document.querySelectorAll("[data-featured-products]").forEach((section) => {
    loadFeaturedSection(section);
    initFeaturedCarousel(section);
  });
};

initFeaturedProducts();
document.addEventListener("astro:page-load", initFeaturedProducts);
document.addEventListener("astro:after-swap", initFeaturedProducts);
window.addEventListener("pageshow", initFeaturedProducts);
