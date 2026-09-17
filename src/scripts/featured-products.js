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

const getCurrentInternalPath = () => `${window.location.pathname}${window.location.search}`;

const withReturnPath = (destination) => {
  const currentPath = getCurrentInternalPath();
  return `${destination}${destination.includes("?") ? "&" : "?"}from=${encodeURIComponent(currentPath)}`;
};

const getProductHref = (item) => {
  const sellerUserId = String(item?.sellerUserId ?? "").trim();
  const productId = String(item?.productId ?? "").trim();
  if (productId) return withReturnPath(`/producto/${encodeURIComponent(productId)}`);
  if (sellerUserId) return withReturnPath(`/proveedor-publico/${encodeURIComponent(sellerUserId)}`);
  return "#";
};

const getProviderHref = (item) => {
  const sellerUserId = String(item?.sellerUserId ?? "").trim();
  return sellerUserId ? withReturnPath(`/proveedor-publico/${encodeURIComponent(sellerUserId)}`) : "#";
};

const serializeDelivery = (value) =>
  Array.isArray(value) ? value.map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean).join(",") : "";

const formatDate = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

const formatDelivery = (value) => {
  if (!Array.isArray(value) || value.length === 0) return "No especificada";
  const labels = value.map((item) => {
    if (item === "retiro") return "Retiro";
    if (item === "envio") return "Envío";
    return String(item ?? "").trim();
  });
  return labels.filter(Boolean).join(" + ") || "No especificada";
};


const AUTOPLAY_MS = 4_200;

const setStatusMessage = (status, message = "") => {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("ab-is-hidden", !message);
};

const getFeaturedCards = (section) =>
  Array.from(section.querySelectorAll("[data-featured-products-grid] > .ab-provider-product-card"));

const createCarouselButton = (direction) => {
  const button = document.createElement("button");
  const isPrev = direction === "prev";
  button.type = "button";
  button.className = `ab-featured-products-nav ab-featured-products-nav--${direction}`;
  button.setAttribute("aria-label", isPrev ? "Ver producto destacado anterior" : "Ver siguiente producto destacado");
  button.setAttribute(isPrev ? "data-featured-products-prev" : "data-featured-products-next", "");
  button.innerHTML = `<img src="/icons/${isPrev ? "atras2" : "adelante"}.svg" alt="" aria-hidden="true" />`;
  return button;
};

const createSellerLink = (sellerUserId) => {
  const providerLink = document.createElement("a");
  providerLink.className = "ab-featured-seller-link";
  providerLink.href = sellerUserId ? withReturnPath(`/proveedor-publico/${encodeURIComponent(sellerUserId)}`) : "#";
  providerLink.innerHTML = "<span>A la venta por <strong>Proveedor</strong></span>";
  if (!sellerUserId) providerLink.setAttribute("aria-disabled", "true");
  return providerLink;
};

const createDetailLink = (productId) => {
  const detailLink = document.createElement("a");
  detailLink.className = "ab-featured-products-detail";
  detailLink.href = productId ? withReturnPath(`/producto/${encodeURIComponent(productId)}`) : "#";
  detailLink.innerHTML = '<img src="/icons/detalle.svg" alt="" aria-hidden="true" /><span>Detalle</span>';
  if (!productId) detailLink.setAttribute("aria-disabled", "true");
  return detailLink;
};

const ensureFeaturedCarouselMarkup = (section) => {
  const grid = section.querySelector("[data-featured-products-grid]");
  if (!grid) return;
  section.classList.add("ab-featured-products-panel");
  grid.classList.add("ab-featured-products-track");

  grid.querySelectorAll(".ab-provider-product-card").forEach((card) => {
    if (card.querySelector(".ab-featured-products-actions")) return;
    const addButton = card.querySelector(":scope > .ab-provider-product-card__add");
    if (!addButton) return;
    const sellerUserId = String(card.dataset.userId ?? "").trim();
    const productId = String(card.dataset.cartId ?? "").trim();
    const actions = document.createElement("div");
    actions.className = "ab-provider-product-card__actions ab-provider-product-card__actions--split ab-featured-products-actions";
    card.insertBefore(createSellerLink(sellerUserId), addButton);
    card.insertBefore(actions, addButton);
    actions.appendChild(createDetailLink(productId));
    actions.appendChild(addButton);
  });

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
    setStatusMessage(status);
    empty.classList.remove("ab-is-hidden");
    section.dataset.featuredLoaded = "true";
    initFeaturedCarousel(section);
    document.dispatchEvent(new CustomEvent("ab-products-rendered"));
    return;
  }

  empty.classList.add("ab-is-hidden");
  setStatusMessage(status);

  items.forEach((item) => {
    const href = getProductHref(item);
    const providerHref = getProviderHref(item);
    const sellerUserId = String(item?.sellerUserId ?? "").trim();
    const productId = String(item?.productId ?? "").trim();
    const pickupAddress = String(item?.pickupAddress ?? "").trim();
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
      <a
        class="ab-featured-seller-link"
        href="${escapeHtml(providerHref)}"
        ${sellerUserId ? "" : 'aria-disabled="true"'}
      >
        <span>Vendedor: <strong>${escapeHtml(item?.sellerName ?? "Proveedor")}</strong></span>
      </a>
      <div class="ab-featured-product-body">
      <img
        class="ab-provider-product-card__image"
        src="${escapeHtml(item?.imageUrl ?? "/logo2.svg")}"
        alt="${escapeHtml(item?.title ?? "Producto")}"
        loading="lazy"
      />
      <div class="ab-category-product-heading">
        <h2>${escapeHtml(item?.title ?? "Producto")}</h2>
        <div class="ab-provider-product-card__meta">

        <p class="ab-provider-product-card__price">
          $${formatPrice(item?.price ?? 0)} <span>${escapeHtml(item?.currency ?? "ARS")}</span>
        </p>
      </div>

      </div>
      <p class="ab-provider-product-card__description"><strong>Detalle:</strong>
        ${escapeHtml(item?.description || "Sin descripción")}
      </p>
      <ul class="ab-provider-product-card__details">
        <li>Fecha: <strong>${escapeHtml(formatDate(item?.createdAt))}</strong></li>
        <li>Ubicación: <strong>${escapeHtml(item?.location || "Sin especificar")}</strong></li>
        ${pickupAddress ? `<li>Dirección: <strong>${escapeHtml(pickupAddress)}</strong></li>` : ""}
        <li>Entrega: <strong>${escapeHtml(formatDelivery(item?.deliveryMethods))}</strong></li>
      </ul>

      <div class="ab-provider-product-card__actions ab-provider-product-card__actions--split ab-featured-products-actions">
        <a
          class="ab-featured-products-detail"
          href="${escapeHtml(href)}"
          ${productId ? "" : 'aria-disabled="true"'}
        >
          <img src="/icons/detalle.svg" alt="" aria-hidden="true" />
          <span>Detalle</span>
        </a>
        <button
          type="button"
          class="ab-provider-product-card__add"
          aria-label="Enviar al carrito"
          title="Enviar al carrito"
        >
          <img src="/icons/carrito.svg" alt="" aria-hidden="true" />
          <span>Enviar al carrito</span>
        </button>
      </div>
      </div>
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
  setStatusMessage(status, "Cargando destacados...");

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
      setStatusMessage(status, "Estamos preparando productos destacados.");
      return;
    }
    renderFeaturedSection(section, Array.isArray(payload?.items) ? payload.items : []);
  } catch (error) {
    if (error?.name === "AbortError") return;
    setStatusMessage(status, "Estamos preparando productos destacados.");
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
