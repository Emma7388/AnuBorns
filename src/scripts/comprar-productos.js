/* UI de tarjetas de productos: botón de carrito con animación. */
import { supabase } from "../lib/supabaseClient";
import { addToCart } from "../lib/cart";

/* Convierte la tarjeta DOM a item de carrito. */
const addCardToCart = async (card) => {
  await addToCart({
    id: card.dataset.cartId,
    price: card.dataset.price,
  });
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
      button.setAttribute("aria-label", "Agregar al carrito");
      button.title = "Agregar al carrito";
    }, 900);
  }, 220);
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
      button.remove();
      return;
    }
    if (button.dataset.abBound) return;
    button.dataset.abBound = "true";
    button.addEventListener("click", async () => {
      if (button.dataset.abLoading === "true") return;
      button.dataset.abLoading = "true";
      try {
        await addCardToCart(card);
        animateAddButton(button);
      } finally {
        delete button.dataset.abLoading;
      }
    });
  });
};

/* Boot para distintos ciclos de navegación. */
const init = () => {
  initBuyButtons();
};

/* Enlaces para cambios de página (Astro). */
init();
document.addEventListener("astro:page-load", init);
document.addEventListener("astro:after-swap", init);
window.addEventListener("pageshow", init);
