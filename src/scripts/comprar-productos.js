import { supabase } from "../lib/supabaseClient";
import { addToCart } from "../lib/cart";

const addCardToCart = (card) => {
  addToCart({
    id: card.dataset.cartId,
    price: card.dataset.price,
  });
};

const initBuyButtons = async () => {
  const cards = Array.from(document.querySelectorAll(".ab-provider-product-card"));
  if (cards.length === 0) return;

  let myUserId = "";
  try {
    const { data } = await supabase.auth.getSession();
    myUserId = data?.session?.user?.id ?? "";
  } catch {
    myUserId = "";
  }

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
    button.addEventListener("click", () => {
      addCardToCart(card);
    });
  });
};

const init = () => {
  initBuyButtons();
};

init();
document.addEventListener("astro:page-load", init);
document.addEventListener("astro:after-swap", init);
window.addEventListener("pageshow", init);
