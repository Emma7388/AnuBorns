const sections = Array.from(document.querySelectorAll("[data-featured-products]"));

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

const renderFeaturedSection = (section, items) => {
  const status = section.querySelector("[data-featured-products-status]");
  const grid = section.querySelector("[data-featured-products-grid]");
  const empty = section.querySelector("[data-featured-products-empty]");
  if (!status || !grid || !empty) return;

  grid.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    status.textContent = "";
    empty.classList.remove("ab-is-hidden");
    return;
  }

  empty.classList.add("ab-is-hidden");
  status.textContent = "";

  items.forEach((item) => {
    const sellerUserId = String(item?.sellerUserId ?? "").trim();
    const productId = String(item?.productId ?? "").trim();
    const href = productId ? `/producto/${encodeURIComponent(productId)}` : sellerUserId ? `/proveedor-publico/${encodeURIComponent(sellerUserId)}` : "#";
    const card = document.createElement("article");
    card.className = "ab-provider-product-card";
    card.dataset.userId = sellerUserId;
    card.dataset.cartId = productId;
    card.dataset.price = String(item?.price ?? 0);
    card.innerHTML = `
      <a href="${href}" class="ab-featured-card-link" ${sellerUserId ? "" : 'aria-disabled="true"'}>
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
  document.dispatchEvent(new CustomEvent("ab-products-rendered"));
};

const loadFeaturedProducts = async () => {
  if (sections.length === 0) return;
  try {
    const response = await fetch("/api/featured-products", { method: "GET" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      sections.forEach((section) => {
        const status = section.querySelector("[data-featured-products-status]");
        if (status) status.textContent = "No se pudieron cargar los productos destacados.";
      });
      return;
    }
    const items = Array.isArray(payload?.items) ? payload.items : [];
    sections.forEach((section) => renderFeaturedSection(section, items));
  } catch {
    sections.forEach((section) => {
      const status = section.querySelector("[data-featured-products-status]");
      if (status) status.textContent = "No se pudieron cargar los productos destacados.";
    });
  }
};

loadFeaturedProducts();
