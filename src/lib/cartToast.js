/* Aviso reutilizable para altas al carrito. */

let toastRoot = null;
let toastMessage = null;
let hideTimeout = 0;

const ensureToast = () => {
  if (toastRoot) return;

  toastRoot = document.createElement("div");
  toastRoot.className = "ab-cart-toast";
  toastRoot.setAttribute("role", "status");
  toastRoot.setAttribute("aria-live", "polite");
  toastRoot.setAttribute("aria-atomic", "true");
  toastRoot.innerHTML = `
    <span class="ab-cart-toast__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
    <span class="ab-cart-toast__message">Producto agregado al carrito</span>
    <a class="ab-cart-toast__link" href="/carrito">Ver carrito</a>
  `;
  document.body.appendChild(toastRoot);
  toastMessage = toastRoot.querySelector(".ab-cart-toast__message");
};

export const showCartToast = (message = "Producto agregado al carrito") => {
  ensureToast();
  if (!toastRoot) return;

  if (toastMessage) toastMessage.textContent = message;
  if (hideTimeout) window.clearTimeout(hideTimeout);

  toastRoot.classList.remove("is-visible");
  window.requestAnimationFrame(() => {
    toastRoot?.classList.add("is-visible");
  });

  hideTimeout = window.setTimeout(() => {
    toastRoot?.classList.remove("is-visible");
    hideTimeout = 0;
  }, 2600);
};
