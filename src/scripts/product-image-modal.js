let modalRoot = null;
let modalImage = null;
let modalClose = null;
let lastTrigger = null;

const ensureModal = () => {
  if (modalRoot) return modalRoot;

  modalRoot = document.createElement("div");
  modalRoot.className = "ab-image-modal ab-is-hidden";
  modalRoot.setAttribute("aria-hidden", "true");
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
  root.classList.remove("ab-is-hidden");
  root.setAttribute("aria-hidden", "false");
  modalClose?.focus();
};

function closeImageModal() {
  if (!modalRoot) return;
  modalRoot.classList.add("ab-is-hidden");
  modalRoot.setAttribute("aria-hidden", "true");
  if (modalImage) {
    modalImage.removeAttribute("src");
  }
  if (lastTrigger instanceof HTMLElement) {
    lastTrigger.focus();
  }
}

const bindProductImages = () => {
  document.querySelectorAll(".ab-provider-product-card__image").forEach((image) => {
    if (!(image instanceof HTMLImageElement)) return;
    if (image.dataset.abImageModalBound === "true") return;
    image.dataset.abImageModalBound = "true";
    image.tabIndex = 0;
    image.addEventListener("click", () => openImageModal(image, image));
    image.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openImageModal(image, image);
    });
  });
};

bindProductImages();
document.addEventListener("astro:page-load", bindProductImages);
document.addEventListener("astro:after-swap", bindProductImages);
window.addEventListener("pageshow", bindProductImages);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!modalRoot || modalRoot.classList.contains("ab-is-hidden")) return;
  closeImageModal();
});
