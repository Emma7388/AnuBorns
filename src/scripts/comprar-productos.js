/* Interfaz de tarjetas de productos: botón de carrito con animación. */
import { supabase } from "../lib/supabaseClient";
import { addToCart, getCart } from "../lib/cart";
import { confirmAddToCart } from "../lib/cartConfirm";
import { showCartToast } from "../lib/cartToast";

/* Convierte la tarjeta DOM a item de carrito. */
const addCardToCart = async (card) => {
  return addToCart({
    id: card.dataset.cartId,
    price: card.dataset.price,
    title: card.dataset.title,
    image_url: card.dataset.image,
    seller_name: card.dataset.provider,
    currency: card.dataset.currency,
    delivery_methods: card.dataset.delivery,
  });
};

const removeUnavailableCard = (card) => {
  const row = card.closest(".ab-card-row");
  const sellerRow = card.closest(".ab-order-card");
  card.remove();
  if (row && row.querySelectorAll(".ab-provider-product-card").length === 0) {
    sellerRow?.remove();
  }
  document.dispatchEvent(new CustomEvent("ab-products-rendered"));
};

const setCartButtonState = (button, added) => {
  const label = added ? "Producto agregado al carrito" : "Enviar al carrito";
  button.disabled = added;
  button.classList.toggle("is-added", added);
  button.setAttribute("aria-label", label);
  button.title = label;
  const text = button.querySelector("span");
  if (text) text.textContent = label;
};

let cartStateVersion = 0;
const refreshCartButtons = async () => {
  const version = ++cartStateVersion;
  if (!document.querySelector(".ab-provider-product-card__add")) return;
  try {
    const items = await getCart();
    if (version !== cartStateVersion) return;
    const ids = new Set(items.map((item) => String(item.product_id)));
    document.querySelectorAll(".ab-provider-product-card").forEach((card) => {
      const button = card.querySelector(".ab-provider-product-card__add");
      if (button instanceof HTMLButtonElement && button.dataset.abLoading !== "true") {
        setCartButtonState(button, ids.has(String(card.dataset.cartId)));
      }
    });
  } catch (error) {
    console.error("No se pudo actualizar el estado de los botones del carrito.", error);
  }
};

const markAsOwnPublication = (card, button) => {
  button.remove();
  card.classList.add("is-own-publication");
  if (card.querySelector(".ab-provider-product-card__own-label")) return;

  const label = document.createElement("p");
  label.className = "ab-provider-product-card__own-label";
  label.textContent = "Mi publicación";
  card.appendChild(label);
};

/* Inicializa botones de compra y bloquea auto-compra del dueño. */
const initBuyButtons = async () => {
  const cards = Array.from(document.querySelectorAll(".ab-provider-product-card"));
  if (cards.length === 0) return;

  /* Identifica usuario para evitar comprar items propios. */
  let myUserId = "";
  try {
    const { data } = await supabase.auth.getSession();
    myUserId = data?.session?.user?.id ?? "";
  } catch {
    myUserId = "";
  }

  /* Asigna handler a cada botón si corresponde. */
  cards.forEach((card) => {
    const button = card.querySelector(".ab-provider-product-card__add");
    if (!(button instanceof HTMLButtonElement)) return;
    const ownerId = String(card.dataset.userId || "");
    if (myUserId && ownerId && myUserId === ownerId) {
      markAsOwnPublication(card, button);
      return;
    }
    if (button.dataset.abBound) return;
    button.dataset.abBound = "true";
    button.addEventListener("click", async () => {
      if (button.disabled || button.dataset.abLoading === "true") return;
      button.dataset.abLoading = "true";
      try {
        const accepted = await confirmAddToCart();
        if (!accepted) return;
        const added = await addCardToCart(card);
        if (!added) {
          removeUnavailableCard(card);
          return;
        }
        ++cartStateVersion;
        setCartButtonState(button, true);
        void refreshCartButtons();
        showCartToast();
      } finally {
        delete button.dataset.abLoading;
      }
    });
  });
};

/* Arranque para distintos ciclos de navegación. */
const init = () => {
  void initBuyButtons().then(refreshCartButtons);
};

/* Enlaces para cambios de página (Astro). */
init();
document.addEventListener("astro:page-load", init);
document.addEventListener("astro:after-swap", init);
document.addEventListener("ab-products-rendered", init);
window.addEventListener("pageshow", init);

window.addEventListener("ab-cart-updated", refreshCartButtons);
window.addEventListener("storage", refreshCartButtons);
