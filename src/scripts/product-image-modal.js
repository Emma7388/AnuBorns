let modalRoot = null;
let modalImage = null;
let modalClose = null;
let lastTrigger = null;

const IMAGE_MODAL_SELECTOR = [
  ".ab-provider-product-card__image",
  ".ab-cart-item__image",
  ".ab-order-card__thumb img",
].join(", ");

const ensureModal = () => {
  if (modalRoot) return modalRoot;

  modalRoot = document.createElement("div");
  modalRoot.className = "ab-image-modal ab-is-hidden";
  modalRoot.setAttribute("aria-hidden", "true");
  modalRoot.inert = true;
  modalRoot.innerHTML = `
    <div class="ab-image-modal__backdrop" data-ab-image-close></div>
    <div class="ab-image-modal__dialog" role="dialog" aria-modal="true" aria-label="Vista ampliada de imagen">
      <button type="button" class="ab-image-modal__close" data-ab-image-close aria-label="Cerrar imagen">
        ×
      </button>
      <img class="ab-image-modal__image" alt="" />
    </div>
  `;

  document.body.appendChild(modalRoot);
  modalImage = modalRoot.querySelector(".ab-image-modal__image");
  modalClose = modalRoot.querySelector(".ab-image-modal__close");

  modalRoot.querySelectorAll("[data-ab-image-close]").forEach((element) => {
    element.addEventListener("click", closeImageModal);
  });

  return modalRoot;
};

const openImageModal = (image, trigger) => {
  if (!(image instanceof HTMLImageElement)) return;
  const root = ensureModal();
  if (!modalImage) return;

  lastTrigger = trigger instanceof HTMLElement ? trigger : image;
  modalImage.src = image.currentSrc || image.src;
  modalImage.alt = image.alt || "Imagen del producto";
  root.inert = false;
  root.classList.remove("ab-is-hidden");
  root.setAttribute("aria-hidden", "false");
  modalClose?.focus();
};

function closeImageModal() {
  if (!modalRoot) return;
  const focusTarget = lastTrigger instanceof HTMLElement && document.contains(lastTrigger) ? lastTrigger : null;
  const activeElement = document.activeElement;

  if (focusTarget) {
    focusTarget.focus();
  } else if (activeElement instanceof HTMLElement && modalRoot.contains(activeElement)) {
    activeElement.blur();
  }

  modalRoot.classList.add("ab-is-hidden");
  modalRoot.setAttribute("aria-hidden", "true");
  modalRoot.inert = true;
  if (modalImage) {
    modalImage.removeAttribute("src");
  }
}

const findModalImage = (target) => {
  if (!(target instanceof Element)) return null;
  const image = target.closest(IMAGE_MODAL_SELECTOR);
  return image instanceof HTMLImageElement ? image : null;
};

const prepareProductImages = () => {
  document.querySelectorAll(IMAGE_MODAL_SELECTOR).forEach((image) => {
    if (!(image instanceof HTMLImageElement)) return;
    image.tabIndex = 0;
  });
};

const bindImageModalEvents = () => {
  if (document.body.dataset.abImageModalDelegated === "true") return;
  document.body.dataset.abImageModalDelegated = "true";

  document.addEventListener("click", (event) => {
    const image = findModalImage(event.target);
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    openImageModal(image, image);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const image = findModalImage(event.target);
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    openImageModal(image, image);
  });
};

bindImageModalEvents();
prepareProductImages();
document.addEventListener("astro:page-load", prepareProductImages);
document.addEventListener("astro:after-swap", prepareProductImages);
window.addEventListener("pageshow", prepareProductImages);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!modalRoot || modalRoot.classList.contains("ab-is-hidden")) return;
  closeImageModal();
});
