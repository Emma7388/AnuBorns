/* Interfaz de tarjetas de productos: botón de carrito con animación. */
import { supabase } from "../lib/supabaseClient";
import { addToCart } from "../lib/cart";
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

/* Efecto visual al agregar al carrito. */
const animateAddButton = (button) => {
  button.classList.remove("is-adding", "is-added");
  window.requestAnimationFrame(() => {
    button.classList.add("is-adding");
  });
  window.setTimeout(() => {
    button.classList.remove("is-adding");
    button.classList.add("is-added");
    button.setAttribute("aria-label", "Producto agregado al carrito");
    button.title = "Producto agregado";
    window.setTimeout(() => {
      button.classList.remove("is-added");
      button.setAttribute("aria-label", "Enviar al carrito");
      button.title = "Enviar al carrito";
    }, 900);
  }, 220);
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
      if (button.dataset.abLoading === "true") return;
      button.dataset.abLoading = "true";
      try {
        const accepted = await confirmAddToCart();
        if (!accepted) return;
        const added = await addCardToCart(card);
        if (!added) {
          removeUnavailableCard(card);
          return;
        }
        animateAddButton(button);
        showCartToast();
      } finally {
        delete button.dataset.abLoading;
      }
    });
  });
};

/* Arranque para distintos ciclos de navegación. */
const init = () => {
  initBuyButtons();
};

/* Enlaces para cambios de página (Astro). */
init();
document.addEventListener("astro:page-load", init);
document.addEventListener("astro:after-swap", init);
document.addEventListener("ab-products-rendered", init);
window.addEventListener("pageshow", init);
