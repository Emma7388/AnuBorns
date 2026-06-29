/* Formulario de publicación de producto con imágenes y validaciones. */
import { supabase } from "../lib/supabaseClient";
import { categories as localCategories } from "../data/categories";
import { PRODUCT_IMAGE_MAX_BYTES, resizeProductImage } from "../lib/imageResize";
import { fetchUserProfile } from "../lib/userProfile";

/* Referencias DOM principales. */
let form = document.getElementById("product-form");
let feedback = document.getElementById("product-feedback");
let submitButton = document.getElementById("product-submit");
let titleInput = document.getElementById("title");
let categorySelect = document.getElementById("category");
let categoryPickerToggle = document.getElementById("category-picker-toggle");
let categoryPickerLabel = document.getElementById("category-picker-label");
let categoryPickerIcon = document.getElementById("category-picker-icon");
let categoryPickerMenu = document.getElementById("category-picker-menu");
let descriptionInput = document.getElementById("description");
let priceInput = document.getElementById("price");
let locationInput = document.getElementById("location");
let publicPhoneInput = document.getElementById("public-phone");
let publicEmailInput = document.getElementById("public-email");
let deliveryInputs = Array.from(document.querySelectorAll('input[name="delivery"]'));
let pickupAddressWrap = document.getElementById("pickup-address-wrap");
let pickupAddressInput = document.getElementById("pickup-address");
let imagesInput = document.getElementById("images");
let previewsWrap = document.getElementById("image-previews");
let progressCount = document.getElementById("product-progress-count");
let previewImage = document.getElementById("product-preview-image");
let previewCategory = document.getElementById("product-preview-category");
let previewPrice = document.getElementById("product-preview-price");
let previewTitle = document.getElementById("product-preview-title");
let previewDescription = document.getElementById("product-preview-description");
let previewLocation = document.getElementById("product-preview-location");
let previewDelivery = document.getElementById("product-preview-delivery");
let progressSteps = Array.from(document.querySelectorAll("[data-product-step]"));
let stepPanels = Array.from(document.querySelectorAll("[data-product-panel]"));
let nextButtons = Array.from(document.querySelectorAll("[data-product-next]"));
let prevButtons = Array.from(document.querySelectorAll("[data-product-prev]"));
let successPanel = document.getElementById("product-success");
let newProductButton = document.getElementById("product-new");
let categoryDocumentClickBound = false;

/* Límites y configuración de imágenes. */
const MAX_FILES = 1;
const MAX_TOTAL_BYTES = PRODUCT_IMAGE_MAX_BYTES;
const MAX_IMAGE_BYTES = PRODUCT_IMAGE_MAX_BYTES;
const IMAGE_BUCKET = "product-images";
let previewUrls = [];
let currentStep = 0;
let activeSession = null;
const CATEGORY_TONES = ["green", "blue", "orange", "mint", "violet", "teal", "amber", "rose"];
const localCategoryBySlug = new Map(localCategories.map((category) => [category.slug, category]));
const normalizeCategoryKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");

/* Feedback visual centralizado. */
const setFeedback = (message) => {
  if (feedback) feedback.textContent = message;
};

/* Completa y fija teléfono/email usando datos reales del usuario. */
const hydrateContactFields = (session) => {
  if (!publicPhoneInput || !publicEmailInput || !pickupAddressInput) return;
  const profile = session?.profile ?? {};
  const phone = String(profile.phone ?? "").trim();
  const email = String(session?.user?.email ?? "").trim();
  const address = String(profile.address ?? "").trim();

  publicPhoneInput.value = phone;
  publicEmailInput.value = email;
  pickupAddressInput.value = address;
};

/* Habilita/deshabilita todos los campos del formulario de publicación. */
const setFormDisabled = (isDisabled) => {
  if (!form) return;
  const elements = form.querySelectorAll("input, select, textarea, button");
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    if ("disabled" in element) {
      element.disabled = isDisabled;
    }
  });
};

/* Vuelve a vincular elementos tras navegación de Astro. */
const bindFormElements = () => {
  form = document.getElementById("product-form");
  feedback = document.getElementById("product-feedback");
  submitButton = document.getElementById("product-submit");
  titleInput = document.getElementById("title");
  categorySelect = document.getElementById("category");
  categoryPickerToggle = document.getElementById("category-picker-toggle");
  categoryPickerLabel = document.getElementById("category-picker-label");
  categoryPickerIcon = document.getElementById("category-picker-icon");
  categoryPickerMenu = document.getElementById("category-picker-menu");
  descriptionInput = document.getElementById("description");
  priceInput = document.getElementById("price");
  locationInput = document.getElementById("location");
  publicPhoneInput = document.getElementById("public-phone");
  publicEmailInput = document.getElementById("public-email");
  deliveryInputs = Array.from(document.querySelectorAll('input[name="delivery"]'));
  pickupAddressWrap = document.getElementById("pickup-address-wrap");
  pickupAddressInput = document.getElementById("pickup-address");
  imagesInput = document.getElementById("images");
  previewsWrap = document.getElementById("image-previews");
  progressCount = document.getElementById("product-progress-count");
  previewImage = document.getElementById("product-preview-image");
  previewCategory = document.getElementById("product-preview-category");
  previewPrice = document.getElementById("product-preview-price");
  previewTitle = document.getElementById("product-preview-title");
  previewDescription = document.getElementById("product-preview-description");
  previewLocation = document.getElementById("product-preview-location");
  previewDelivery = document.getElementById("product-preview-delivery");
  progressSteps = Array.from(document.querySelectorAll("[data-product-step]"));
  stepPanels = Array.from(document.querySelectorAll("[data-product-panel]"));
  nextButtons = Array.from(document.querySelectorAll("[data-product-next]"));
  prevButtons = Array.from(document.querySelectorAll("[data-product-prev]"));
  successPanel = document.getElementById("product-success");
  newProductButton = document.getElementById("product-new");
};

/* Carga categorías desde Supabase. */
const loadCategories = async () => {
  if (!categorySelect) return;
  categorySelect.innerHTML = "";
  if (categoryPickerMenu) categoryPickerMenu.innerHTML = "";
  if (categoryPickerLabel) categoryPickerLabel.textContent = "Elegí una categoría";
  if (categoryPickerIcon instanceof HTMLImageElement) categoryPickerIcon.src = "/icons/destacado.svg";
  setFeedback("Cargando categorías...");
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug,icon")
      .order("name", { ascending: true });
    if (error || !data) {
      setFeedback("No se pudieron cargar las categorías.");
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Elegí una categoría";
    categorySelect.appendChild(placeholder);
    data.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      option.dataset.slug = category.slug ?? "";
      categorySelect.appendChild(option);
    });
    renderCategoryPicker(normalizeCategories(data));
    updatePublisherUi();
    setFeedback("");
  } catch {
    setFeedback("No se pudieron cargar las categorías.");
  }
};

const closeCategoryPicker = () => {
  if (!categoryPickerMenu || !categoryPickerToggle) return;
  categoryPickerMenu.classList.add("ab-is-hidden");
  categoryPickerToggle.setAttribute("aria-expanded", "false");
};

const normalizeCategories = (categories) =>
  (Array.isArray(categories) ? categories : []).map((category, index) => {
    const slug = normalizeCategoryKey(category?.slug || category?.name);
    const fallback = localCategoryBySlug.get(slug);
    return {
      ...category,
      slug,
      icon: fallback?.icon || category?.icon || "/icons/destacado.svg",
      tone: CATEGORY_TONES[index % CATEGORY_TONES.length],
    };
  });

const openCategoryPicker = () => {
  if (!categoryPickerMenu || !categoryPickerToggle) return;
  categoryPickerMenu.classList.remove("ab-is-hidden");
  categoryPickerToggle.setAttribute("aria-expanded", "true");
};

const toggleCategoryPicker = (event) => {
  event?.stopPropagation();
  if (!categoryPickerMenu) return;
  if (categoryPickerMenu.classList.contains("ab-is-hidden")) {
    openCategoryPicker();
    return;
  }
  closeCategoryPicker();
};

const onDocumentClick = (event) => {
  const picker = categoryPickerToggle?.closest("[data-category-picker]");
  if (picker && event.target instanceof Node && picker.contains(event.target)) return;
  closeCategoryPicker();
};

const selectCategory = (categoryId) => {
  if (!categorySelect) return;
  categorySelect.value = String(categoryId ?? "");
  const selectedName = getCategoryName();
  if (categoryPickerLabel) categoryPickerLabel.textContent = selectedName || "Elegí una categoría";
  const selectedOption = categoryPickerMenu?.querySelector(`[data-category-option="${CSS.escape(categorySelect.value)}"]`);
  if (categoryPickerIcon instanceof HTMLImageElement) {
    categoryPickerIcon.src = selectedOption?.dataset.categoryIcon || "/icons/destacado.svg";
  }
  categoryPickerMenu?.querySelectorAll("[data-category-option]").forEach((option) => {
    option.classList.toggle("is-active", option.dataset.categoryOption === categorySelect.value);
    option.setAttribute("aria-selected", option.dataset.categoryOption === categorySelect.value ? "true" : "false");
  });
  closeCategoryPicker();
  categorySelect.dispatchEvent(new Event("change", { bubbles: true }));
  updatePublisherUi();
};

const renderCategoryPicker = (categories) => {
  if (!categoryPickerMenu) return;
  categoryPickerMenu.innerHTML = "";
  (Array.isArray(categories) ? categories : []).forEach((category) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "ab-category-picker__option";
    option.dataset.categoryOption = String(category?.id ?? "");
    option.dataset.categoryIcon = String(category?.icon ?? "/icons/destacado.svg");
    option.dataset.tone = String(category?.tone ?? "green");
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    const iconWrap = document.createElement("span");
    iconWrap.className = "ab-category-picker__option-icon";
    const icon = document.createElement("img");
    icon.src = String(category?.icon ?? "/icons/destacado.svg");
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    iconWrap.appendChild(icon);
    const label = document.createElement("span");
    label.className = "ab-category-picker__option-label";
    label.textContent = String(category?.name ?? "Categoría");
    option.appendChild(iconWrap);
    option.appendChild(label);
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      selectCategory(category?.id);
    });
    categoryPickerMenu.appendChild(option);
  });
};

/* Requiere sesión activa para publicar. */
const ensureSession = async () => {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user) {
    return {
      ...data.session,
      profile: await fetchUserProfile(data.session.user),
    };
  }
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    return {
      user: userData.user,
      profile: await fetchUserProfile(userData.user),
    };
  }
  window.location.href = "/login?returnTo=/vender/productos";
  return null;
};

/* Resuelve un nombre visible para el vendedor. */
const resolveSellerName = (session) => {
  const firstName = String(session?.profile?.first_name ?? "").trim();
  if (firstName) return firstName;
  const email = String(session?.user?.email ?? "").trim();
  if (!email) return null;
  return email.split("@")[0] || email;
};

/* Parsea el precio a número válido. */
const parsePrice = (value) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const formatPrice = (value) => {
  const price = parsePrice(value);
  if (!price) return "$0 ARS";
  return `$${price.toLocaleString("es-AR")} ARS`;
};

/* Recolecta métodos de entrega seleccionados. */
const collectDeliveryMethods = () =>
  deliveryInputs.filter((input) => input.checked).map((input) => input.value);

const getCategoryName = () => {
  const selected = categorySelect?.selectedOptions?.[0];
  return String(selected?.textContent ?? "").trim();
};

const getDeliveryLabel = () => {
  const labels = deliveryInputs
    .filter((input) => input.checked)
    .map((input) => input.closest("label")?.textContent?.trim() || input.value);
  return labels.length > 0 ? labels.join(" + ") : "Sin elegir";
};

/* Detecta si se eligió retiro. */
const hasPickupSelected = () =>
  deliveryInputs.some((input) => input.checked && input.value === "retiro");

/* Muestra/oculta dirección de retiro según selección. */
const updatePickupAddressVisibility = () => {
  if (!pickupAddressWrap || !pickupAddressInput) return;
  pickupAddressWrap.classList.remove("ab-is-hidden");
  pickupAddressInput.required = true;
};

/* Evita listeners duplicados. */
const bindOnce = (element, key, eventName, handler) => {
  if (!element) return;
  const flag = `abBound${key}`;
  if (element.dataset[flag]) return;
  element.addEventListener(eventName, handler);
  element.dataset[flag] = "true";
};

/* Manejador de imágenes: valida y genera previews. */
const onImagesChange = () => {
  const files = collectImages();
  const error = validateImages(files);
  if (error) {
    clearPreviews();
    setFeedback(error);
    updatePublisherUi();
    return;
  }
  setFeedback("");
  renderPreviews(files);
  updatePublisherUi();
};

/* Manejador de entrega. */
const onDeliveryChange = () => {
  updatePickupAddressVisibility();
  updatePublisherUi();
};

const onFieldInput = () => {
  if (categoryPickerLabel && categorySelect) {
    categoryPickerLabel.textContent = getCategoryName() || "Elegí una categoría";
  }
  updatePublisherUi();
};

const onNextStep = () => {
  if (!validateStep(currentStep)) return;
  showStep(currentStep + 1);
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const onPreviousStep = () => {
  showStep(currentStep - 1);
};

const onNewProduct = () => {
  if (!form) return;
  form.reset();
  clearPreviews();
  deliveryInputs.forEach((input) => {
    input.checked = false;
  });
  if (activeSession) hydrateContactFields(activeSession);
  if (successPanel) successPanel.classList.add("ab-is-hidden");
  form.classList.remove("ab-is-hidden");
  if (categoryPickerLabel) categoryPickerLabel.textContent = "Elegí una categoría";
  if (categoryPickerIcon instanceof HTMLImageElement) categoryPickerIcon.src = "/icons/destacado.svg";
  categoryPickerMenu?.querySelectorAll("[data-category-option]").forEach((option) => {
    option.classList.remove("is-active");
    option.setAttribute("aria-selected", "false");
  });
  showStep(0);
  updatePickupAddressVisibility();
  updatePublisherUi();
  setFeedback("");
};

/* Manejador de envío del formulario. */
const onSubmit = (event) => {
  event.preventDefault();
  submitProduct();
};

/* Inicializa el formulario y sus listeners. */
const initProductForm = () => {
  bindFormElements();
  if (!form || !categorySelect) return;
  setFormDisabled(true);
  setFeedback("Validando sesión...");
  ensureSession().then((session) => {
    if (!session) return;
    hydrateContactFields(session);
    setFormDisabled(false);
    const hasPhone = String(publicPhoneInput?.value ?? "").trim().length > 0;
    const hasEmail = String(publicEmailInput?.value ?? "").trim().length > 0;
    const hasAddress = String(pickupAddressInput?.value ?? "").trim().length > 0;
    if (!hasPhone || !hasEmail || !hasAddress) {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = true;
      }
      setFeedback("Completá teléfono, email y dirección en Mis datos para poder publicar.");
      return;
    }
    activeSession = session;
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = false;
    }
    loadCategories();
    updatePickupAddressVisibility();
    updatePublisherUi();
    bindOnce(imagesInput, "ImagesChange", "change", onImagesChange);
    [titleInput, categorySelect, descriptionInput, priceInput, locationInput, pickupAddressInput]
      .forEach((element) => {
        bindOnce(element, "PublisherInput", "input", onFieldInput);
        bindOnce(element, "PublisherChange", "change", onFieldInput);
      });
    deliveryInputs.forEach((input) => bindOnce(input, "DeliveryChange", "change", onDeliveryChange));
    bindOnce(categoryPickerToggle, "CategoryToggle", "click", toggleCategoryPicker);
    if (!categoryDocumentClickBound) {
      document.addEventListener("click", onDocumentClick);
      categoryDocumentClickBound = true;
    }
    nextButtons.forEach((button) => bindOnce(button, "NextStep", "click", onNextStep));
    prevButtons.forEach((button) => bindOnce(button, "PreviousStep", "click", onPreviousStep));
    bindOnce(newProductButton, "NewProduct", "click", onNewProduct);
    bindOnce(form, "Submit", "submit", onSubmit);
    showStep(currentStep);
    setFeedback("");
  });
};

/* Obtiene solo imágenes válidas del input. */
const collectImages = () => {
  const files = Array.from(imagesInput?.files ?? []);
  if (files.length === 0) return [];
  return files.filter((file) => file && file.type.startsWith("image/"));
};

/* Valida cantidad y tamaño de imágenes. */
const validateImages = (files) => {
  if (files.length > MAX_FILES) {
    return "Podés subir solo 1 foto.";
  }
  const totalSize = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
  if (totalSize > MAX_TOTAL_BYTES) {
    return "La foto supera los 20MB. Elegí una imagen más liviana.";
  }
  if (files.some((file) => (file.size ?? 0) > MAX_IMAGE_BYTES)) {
    return "La foto supera los 20MB. Elegí una imagen más liviana.";
  }
  return "";
};

/* Limpia previews previos. */
const clearPreviews = () => {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
  if (previewsWrap) previewsWrap.innerHTML = "";
};

/* Renderiza previews de imágenes. */
const renderPreviews = (files) => {
  if (!previewsWrap) return;
  clearPreviews();
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);
    const item = document.createElement("div");
    item.className = "ab-upload-preview";
    const img = document.createElement("img");
    img.src = url;
    img.alt = file.name || "Imagen";
    item.appendChild(img);
    previewsWrap.appendChild(item);
  });
  if (previewImage && previewUrls[0]) {
    previewImage.src = previewUrls[0];
  }
};

const setStepState = (key, isComplete) => {
  const step = progressSteps.find((item) => item.dataset.productStep === String(key));
  if (!step) return;
  step.classList.toggle("is-complete", isComplete);
};

const setActiveStepState = (key, isActive) => {
  const step = progressSteps.find((item) => item.dataset.productStep === String(key));
  if (!step) return;
  step.classList.toggle("is-active", isActive);
};

const showStep = (stepIndex) => {
  if (stepPanels.length === 0) return;
  currentStep = Math.max(0, Math.min(stepIndex, stepPanels.length - 1));
  stepPanels.forEach((panel) => {
    panel.classList.toggle("ab-is-hidden", panel.dataset.productPanel !== String(currentStep));
  });
  updatePublisherUi();
};

const getStepStates = () => {
  const title = String(titleInput?.value ?? "").trim();
  const description = String(descriptionInput?.value ?? "").trim();
  const price = parsePrice(priceInput?.value);
  const location = String(locationInput?.value ?? "").trim();
  const publicPhone = String(publicPhoneInput?.value ?? "").trim();
  const publicEmail = String(publicEmailInput?.value ?? "").trim();
  const pickupAddress = String(pickupAddressInput?.value ?? "").trim();
  const deliveryMethods = collectDeliveryMethods();
  const imageError = validateImages(collectImages());

  return [
    Boolean(title && String(categorySelect?.value ?? "").trim()),
    Boolean(description),
    Boolean(price && collectImages().length > 0 && !imageError),
    Boolean(location && publicPhone && publicEmail),
    Boolean(deliveryMethods.length > 0 && pickupAddress),
  ];
};

const validateStep = (stepIndex) => {
  const title = String(titleInput?.value ?? "").trim();
  const categoryId = String(categorySelect?.value ?? "").trim();
  const description = String(descriptionInput?.value ?? "").trim();
  const price = parsePrice(priceInput?.value);
  const location = String(locationInput?.value ?? "").trim();
  const publicPhone = String(publicPhoneInput?.value ?? "").trim();
  const publicEmail = String(publicEmailInput?.value ?? "").trim();
  const pickupAddress = String(pickupAddressInput?.value ?? "").trim();
  const deliveryMethods = collectDeliveryMethods();
  const images = collectImages();
  const imageError = validateImages(images);

  if (stepIndex === 0 && !title) {
    setFeedback("El título es obligatorio.");
    return false;
  }
  if (stepIndex === 0 && !categoryId) {
    setFeedback("Seleccioná una categoría.");
    return false;
  }
  if (stepIndex === 1 && !description) {
    setFeedback("La descripción es obligatoria.");
    return false;
  }
  if (stepIndex === 2 && !price) {
    setFeedback("Ingresá un precio válido.");
    return false;
  }
  if (stepIndex === 2 && images.length === 0) {
    setFeedback("Subí una imagen del producto.");
    return false;
  }
  if (stepIndex === 2 && imageError) {
    setFeedback(imageError);
    return false;
  }
  if (stepIndex === 3 && !location) {
    setFeedback("Seleccioná una ubicación.");
    return false;
  }
  if (stepIndex === 3 && !publicPhone) {
    setFeedback("Ingresá un teléfono público.");
    return false;
  }
  if (stepIndex === 3 && !publicEmail) {
    setFeedback("Ingresá un email público.");
    return false;
  }
  if (stepIndex === 4 && deliveryMethods.length === 0) {
    setFeedback("Seleccioná al menos una opción de entrega.");
    return false;
  }
  if (stepIndex === 4 && !pickupAddress) {
    setFeedback("Ingresá la dirección.");
    return false;
  }
  setFeedback("");
  return true;
};

const updatePublisherUi = () => {
  const description = String(descriptionInput?.value ?? "").trim();
  const category = getCategoryName();
  const location = String(locationInput?.value ?? "").trim();
  const hasImage = collectImages().length > 0;
  const stepStates = getStepStates();
  const total = stepPanels.length || stepStates.length || 1;
  const visibleStep = Math.min(currentStep + 1, total);

  stepStates.forEach((isComplete, index) => {
    setStepState(index, isComplete || index < currentStep);
    setActiveStepState(index, index === currentStep);
  });
  if (progressCount) progressCount.setAttribute("aria-label", `Paso ${visibleStep} de ${total}`);

  if (previewTitle) previewTitle.textContent = String(titleInput?.value ?? "").trim() || "Título del producto";
  if (previewCategory) previewCategory.textContent = category || "Sin categoría";
  if (previewPrice) previewPrice.textContent = formatPrice(priceInput?.value);
  if (previewDescription) {
    previewDescription.textContent = description || "La descripción va apareciendo mientras cargás.";
  }
  if (previewLocation) previewLocation.textContent = location || "Sin elegir";
  if (previewDelivery) previewDelivery.textContent = getDeliveryLabel();
  if (previewImage && !hasImage) previewImage.src = "/logo2.svg";
};

const showSuccessState = () => {
  if (form) form.classList.add("ab-is-hidden");
  if (successPanel) successPanel.classList.remove("ab-is-hidden");
  progressSteps.forEach((_, index) => {
    setStepState(index, true);
    setActiveStepState(index, false);
  });
  if (progressCount) progressCount.setAttribute("aria-label", "Producto publicado");
};

/* Aplica optimización a todas las imágenes. */
const optimizeImages = async (files) => {
  const optimized = [];
  for (const file of files) {
    const next = await resizeProductImage(file);
    optimized.push(next);
  }
  return optimized;
};

/* Sube imágenes a storage y devuelve URLs públicas. */
const uploadImages = async (userId, productId, files) => {
  if (files.length === 0) return [];
  const uploads = files.map(async (file, index) => {
    const extension = file.name.split(".").pop() || "jpg";
    const path = `${userId}/${productId}/image-${index + 1}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) {
      return null;
    }
    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  });
  const results = await Promise.all(uploads);
  return results.filter(Boolean);
};

/* Crea el producto, sube imágenes y actualiza el registro. */
const submitProduct = async () => {
  if (!form || !titleInput || !categorySelect || !priceInput) return;
  const title = String(titleInput.value ?? "").trim();
  const categoryId = String(categorySelect.value ?? "").trim();
  const description = String(descriptionInput?.value ?? "").trim();
  const price = parsePrice(priceInput.value);
  const location = String(locationInput?.value ?? "").trim();
  const publicPhone = String(publicPhoneInput?.value ?? "").trim();
  const publicEmail = String(publicEmailInput?.value ?? "").trim();
  const deliveryMethods = collectDeliveryMethods();
  const pickupAddress = String(pickupAddressInput?.value ?? "").trim();
  const images = collectImages();
  const imageError = validateImages(images);

  if (!title) {
    setFeedback("El título es obligatorio.");
    return;
  }
  if (!categoryId) {
    setFeedback("Seleccioná una categoría.");
    return;
  }
  if (!description) {
    setFeedback("La descripción es obligatoria.");
    return;
  }
  if (!price) {
    setFeedback("Ingresá un precio válido.");
    return;
  }
  if (!location) {
    setFeedback("Seleccioná una ubicación.");
    return;
  }
  if (!publicPhone) {
    setFeedback("Ingresá un teléfono público.");
    return;
  }
  if (!publicEmail) {
    setFeedback("Ingresá un email público.");
    return;
  }
  if (deliveryMethods.length === 0) {
    setFeedback("Seleccioná al menos una opción de entrega.");
    return;
  }
  if (!pickupAddress) {
    setFeedback("Ingresá la dirección.");
    return;
  }
  if (images.length === 0) {
    setFeedback("Subí una imagen del producto.");
    return;
  }
  if (imageError) {
    setFeedback(imageError);
    return;
  }

  /* Requiere sesión válida. */
  const session = await ensureSession();
  if (!session) return;

  if (submitButton) submitButton.disabled = true;
  setFeedback("Publicando...");

  try {
    /* Optimiza imágenes antes de subir. */
    const optimizedImages = await optimizeImages(images);
    const { data, error } = await supabase.from("products").insert({
      user_id: session.user.id,
      category_id: categoryId,
      title,
      description: description || null,
      price,
      currency: "ARS",
      location,
      delivery_methods: deliveryMethods,
      pickup_address: pickupAddress || null,
      contact: `${publicPhone} | ${publicEmail}`,
      seller_name: resolveSellerName(session),
      image_url: null,
    }).select("id").single();

    if (error) {
      const message = String(error.message || "");
      if (message.includes("column") || message.includes("schema")) {
        setFeedback("No se pudo publicar. Ejecutá el SQL incremental en Supabase.");
      } else {
        setFeedback("No se pudo publicar el producto.");
      }
      return;
    }

    const productId = data?.id;
    const imageUrls = productId
      ? await uploadImages(session.user.id, productId, optimizedImages)
      : [];
    if (images.length > 0 && imageUrls.length === 0) {
      setFeedback("El producto se publicó, pero no se pudieron subir las imágenes.");
    }
    if (productId && imageUrls.length > 0) {
      await supabase
        .from("products")
        .update({
          image_url: imageUrls[0],
          image_urls: imageUrls,
        })
        .eq("id", productId);
    }

    /* Reinicio de interfaz luego de publicar. */
    form.reset();
    clearPreviews();
    deliveryInputs.forEach((input) => {
      input.checked = false;
    });
    updatePickupAddressVisibility();
    updatePublisherUi();
    setFeedback("");
    showSuccessState();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    setFeedback("No se pudo publicar el producto.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
};

/* Inicialización y eventos de navegación Astro. */
initProductForm();

document.addEventListener("astro:page-load", initProductForm);
document.addEventListener("astro:after-swap", initProductForm);
window.addEventListener("pageshow", initProductForm);
