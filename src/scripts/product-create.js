import { supabase } from "../lib/supabaseClient";

let form = document.getElementById("product-form");
let feedback = document.getElementById("product-feedback");
let submitButton = document.getElementById("product-submit");
let titleInput = document.getElementById("title");
let categorySelect = document.getElementById("category");
let descriptionInput = document.getElementById("description");
let priceInput = document.getElementById("price");
let locationInput = document.getElementById("location");
let deliveryInputs = Array.from(document.querySelectorAll('input[name="delivery"]'));
let pickupAddressWrap = document.getElementById("pickup-address-wrap");
let pickupAddressInput = document.getElementById("pickup-address");
let imagesInput = document.getElementById("images");
let previewsWrap = document.getElementById("image-previews");

const MAX_FILES = 1;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_BUCKET = "product-images";
const MAX_DIMENSION = 1600;
let previewUrls = [];

const setFeedback = (message) => {
  if (feedback) feedback.textContent = message;
};

const bindFormElements = () => {
  form = document.getElementById("product-form");
  feedback = document.getElementById("product-feedback");
  submitButton = document.getElementById("product-submit");
  titleInput = document.getElementById("title");
  categorySelect = document.getElementById("category");
  descriptionInput = document.getElementById("description");
  priceInput = document.getElementById("price");
  locationInput = document.getElementById("location");
  deliveryInputs = Array.from(document.querySelectorAll('input[name="delivery"]'));
  pickupAddressWrap = document.getElementById("pickup-address-wrap");
  pickupAddressInput = document.getElementById("pickup-address");
  imagesInput = document.getElementById("images");
  previewsWrap = document.getElementById("image-previews");
};

const loadCategories = async () => {
  if (!categorySelect) return;
  categorySelect.innerHTML = "";
  setFeedback("Cargando categorías...");
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug")
      .order("name", { ascending: true });
    if (error || !data) {
      setFeedback("No se pudieron cargar las categorías.");
      return;
    }

    data.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      option.dataset.slug = category.slug ?? "";
      categorySelect.appendChild(option);
    });
    setFeedback("");
  } catch {
    setFeedback("No se pudieron cargar las categorías.");
  }
};

const ensureSession = async () => {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user) return data.session;
  window.location.href = "/login?returnTo=/vender/productos";
  return null;
};

const resolveSellerName = (session) => {
  const meta = session?.user?.user_metadata ?? {};
  const firstName = String(meta.first_name ?? "").trim();
  if (firstName) return firstName;
  const email = String(session?.user?.email ?? "").trim();
  if (!email) return null;
  return email.split("@")[0] || email;
};

const parsePrice = (value) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const collectDeliveryMethods = () =>
  deliveryInputs.filter((input) => input.checked).map((input) => input.value);

const hasPickupSelected = () =>
  deliveryInputs.some((input) => input.checked && input.value === "retiro");

const updatePickupAddressVisibility = () => {
  if (!pickupAddressWrap || !pickupAddressInput) return;
  if (hasPickupSelected()) {
    pickupAddressWrap.classList.remove("ab-is-hidden");
    pickupAddressInput.required = true;
  } else {
    pickupAddressWrap.classList.add("ab-is-hidden");
    pickupAddressInput.required = false;
    pickupAddressInput.value = "";
  }
};

const bindOnce = (element, key, eventName, handler) => {
  if (!element) return;
  const flag = `abBound${key}`;
  if (element.dataset[flag]) return;
  element.addEventListener(eventName, handler);
  element.dataset[flag] = "true";
};

const onImagesChange = () => {
  const files = collectImages();
  const error = validateImages(files);
  if (error) {
    clearPreviews();
    setFeedback(error);
    return;
  }
  setFeedback("");
  renderPreviews(files);
};

const onDeliveryChange = () => {
  updatePickupAddressVisibility();
};

const onSubmit = (event) => {
  event.preventDefault();
  submitProduct();
};

const initProductForm = () => {
  bindFormElements();
  if (!form || !categorySelect) return;
  loadCategories();
  updatePickupAddressVisibility();
  bindOnce(imagesInput, "ImagesChange", "change", onImagesChange);
  deliveryInputs.forEach((input) => bindOnce(input, "DeliveryChange", "change", onDeliveryChange));
  bindOnce(form, "Submit", "submit", onSubmit);
};

const collectImages = () => {
  const files = Array.from(imagesInput?.files ?? []);
  if (files.length === 0) return [];
  return files.filter((file) => file && file.type.startsWith("image/"));
};

const validateImages = (files) => {
  if (files.length > MAX_FILES) {
    return "Podés subir solo 1 foto.";
  }
  const totalSize = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
  if (totalSize > MAX_TOTAL_BYTES) {
    return "El total de las fotos supera los 5MB. Sugerencia: descargá la foto de WhatsApp para que pese menos.";
  }
  if (files.some((file) => (file.size ?? 0) > MAX_IMAGE_BYTES)) {
    return "Alguna foto supera los 5MB. Elegí una más liviana.";
  }
  return "";
};

const clearPreviews = () => {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
  if (previewsWrap) previewsWrap.innerHTML = "";
};

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
};

const loadImageBitmap = async (file) => {
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
};

const resizeImage = async (file) => {
  const bitmap = await loadImageBitmap(file);
  if (!bitmap) return file;
  const { width, height } = bitmap;
  const maxSide = Math.max(width, height);
  if (maxSide <= MAX_DIMENSION) return file;
  const scale = MAX_DIMENSION / maxSide;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(file);
          return;
        }
        const optimized = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
          type: "image/jpeg",
        });
        resolve(optimized);
      },
      "image/jpeg",
      0.82
    );
  });
};

const optimizeImages = async (files) => {
  const optimized = [];
  for (const file of files) {
    const next = await resizeImage(file);
    optimized.push(next);
  }
  return optimized;
};

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

const submitProduct = async () => {
  if (!form || !titleInput || !categorySelect || !priceInput) return;
  const title = String(titleInput.value ?? "").trim();
  const categoryId = String(categorySelect.value ?? "").trim();
  const description = String(descriptionInput?.value ?? "").trim();
  const price = parsePrice(priceInput.value);
  const location = String(locationInput?.value ?? "").trim();
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
  if (deliveryMethods.length === 0) {
    setFeedback("Seleccioná al menos una opción de entrega.");
    return;
  }
  if (hasPickupSelected() && !pickupAddress) {
    setFeedback("Ingresá la dirección de retiro.");
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

  const session = await ensureSession();
  if (!session) return;

  if (submitButton) submitButton.disabled = true;
  setFeedback("Publicando...");

  try {
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

    form.reset();
    clearPreviews();
    deliveryInputs.forEach((input) => {
      input.checked = false;
    });
    updatePickupAddressVisibility();
    setFeedback("Producto publicado.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    setFeedback("No se pudo publicar el producto.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
};

initProductForm();

document.addEventListener("astro:page-load", initProductForm);
document.addEventListener("astro:after-swap", initProductForm);
window.addEventListener("pageshow", initProductForm);
