import { supabase } from "../lib/supabaseClient";

const productsGrid = document.getElementById("my-products-grid");
const productsEmpty = document.getElementById("my-products-empty");

const formatPrice = (value) => {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("es-AR");
};

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
    return item;
  });
  return labels.join(" + ");
};

const renderMyProducts = (products) => {
  if (!productsGrid || !productsEmpty) return;
  productsGrid.innerHTML = "";
  if (!Array.isArray(products) || products.length === 0) {
    productsEmpty.classList.remove("ab-is-hidden");
    return;
  }
  productsEmpty.classList.add("ab-is-hidden");
  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "ab-provider-product-card";
    const shortId = (product.id || "").toString().replace(/-/g, "").slice(0, 6).toUpperCase() || "N/A";
    card.innerHTML = `
      <img
        class="ab-provider-product-card__image"
        src="${product.image_url || "/logo2.svg"}"
        alt="${product.title || "Producto"}"
        loading="lazy"
      />
      <div class="ab-provider-product-card__meta">
        <div>
          <p class="ab-provider-product-card__label">Producto</p>
          <p class="ab-provider-product-card__code">ID ${shortId}</p>
        </div>
        <p class="ab-provider-product-card__price">
          $${formatPrice(product.price)} <span>${product.currency || "ARS"}</span>
        </p>
      </div>
      <h2>${product.title || "Sin título"}</h2>
      <p class="ab-provider-product-card__description">
        ${product.description || "Sin descripción"}
      </p>
      <ul class="ab-provider-product-card__details">
        <li>Publicada el <strong>${formatDate(product.created_at)}</strong></li>
        <li>Ubicación: <strong>${product.location || "Sin especificar"}</strong></li>
        ${product.pickup_address ? `<li>Dirección: <strong>${product.pickup_address}</strong></li>` : ""}
        <li>Entrega: <strong>${formatDelivery(product.delivery_methods)}</strong></li>
      </ul>
    `;
    productsGrid.appendChild(card);
  });
};

const loadMyProducts = async () => {
  if (!productsGrid || !productsEmpty) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session?.user) {
      productsEmpty.classList.remove("ab-is-hidden");
      return;
    }
    const { data, error } = await supabase
      .from("products")
      .select("id,title,description,price,currency,image_url,location,delivery_methods,pickup_address,created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) {
      productsEmpty.classList.remove("ab-is-hidden");
      return;
    }
    renderMyProducts(data ?? []);
  } catch {
    productsEmpty.classList.remove("ab-is-hidden");
  }
};

const initMySalesProducts = () => {
  loadMyProducts();
};

initMySalesProducts();
document.addEventListener("astro:page-load", initMySalesProducts);
document.addEventListener("astro:after-swap", initMySalesProducts);
window.addEventListener("pageshow", initMySalesProducts);
