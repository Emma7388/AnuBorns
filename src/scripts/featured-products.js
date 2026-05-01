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
        <ul class="ab-provider-product-card__details">
          <li>Vendidos (7 días): <strong>${Number(item?.soldQty ?? 0)}</strong></li>
        </ul>
      </a>
    `;
    grid.appendChild(card);
  });
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
