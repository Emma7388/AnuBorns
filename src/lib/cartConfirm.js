/* Modal reutilizable para confirmar altas al carrito. */

let modalRoot = null;
let modalTitle = null;
let modalMessage = null;
let confirmButton = null;
let cancelButton = null;
let isOpen = false;
let resolver = null;
let escHandlerBound = false;

const ensureModal = () => {
  if (modalRoot) return;

  modalRoot = document.createElement("div");
  modalRoot.id = "ab-cart-confirm-modal";
  modalRoot.className = "ab-orders-modal ab-is-hidden";
  modalRoot.setAttribute("role", "dialog");
  modalRoot.setAttribute("aria-modal", "true");
  modalRoot.setAttribute("aria-hidden", "true");
  modalRoot.setAttribute("aria-labelledby", "ab-cart-confirm-title");
  modalRoot.innerHTML = `
    <div class="ab-orders-modal__backdrop" data-ab-cart-confirm-close></div>
    <div class="ab-orders-modal__panel" role="document">
      <h2 id="ab-cart-confirm-title">Agregar al carrito</h2>
      <p id="ab-cart-confirm-message">Deseas agregar este producto al carrito?</p>
      <div class="ab-orders-modal__actions">
        <button
          type="button"
          class="ab-orders-delete-btn ab-orders-delete-btn--ghost"
          data-ab-cart-confirm-cancel
        >
          Cancelar
        </button>
        <button type="button" class="ab-orders-delete-btn" data-ab-cart-confirm-accept>
          Si, agregar
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modalRoot);

  modalTitle = modalRoot.querySelector("#ab-cart-confirm-title");
  modalMessage = modalRoot.querySelector("#ab-cart-confirm-message");
  confirmButton = modalRoot.querySelector("[data-ab-cart-confirm-accept]");
  cancelButton = modalRoot.querySelector("[data-ab-cart-confirm-cancel]");
  const backdrop = modalRoot.querySelector("[data-ab-cart-confirm-close]");

  const close = (accepted) => {
    if (!modalRoot || !isOpen) return;
    isOpen = false;
    modalRoot.classList.add("ab-is-hidden");
    modalRoot.setAttribute("aria-hidden", "true");
    const next = resolver;
    resolver = null;
    if (next) next(Boolean(accepted));
  };

  confirmButton?.addEventListener("click", () => close(true));
  cancelButton?.addEventListener("click", () => close(false));
  backdrop?.addEventListener("click", () => close(false));

  if (!escHandlerBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !isOpen) return;
      close(false);
    });
    escHandlerBound = true;
  }
};

export const confirmAddToCart = ({
  title = "Agregar al carrito",
  message = "Deseas agregar este producto al carrito?",
  confirmLabel = "Si, agregar",
  cancelLabel = "Cancelar",
} = {}) => {
  ensureModal();
  if (!modalRoot || isOpen) return Promise.resolve(false);

  if (modalTitle) modalTitle.textContent = title;
  if (modalMessage) modalMessage.textContent = message;
  if (confirmButton) confirmButton.textContent = confirmLabel;
  if (cancelButton) cancelButton.textContent = cancelLabel;

  modalRoot.classList.remove("ab-is-hidden");
  modalRoot.setAttribute("aria-hidden", "false");
  isOpen = true;

  window.setTimeout(() => {
    confirmButton?.focus();
  }, 0);

  return new Promise((resolve) => {
    resolver = resolve;
  });
};

