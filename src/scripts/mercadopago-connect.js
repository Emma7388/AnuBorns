import { supabase } from "../lib/supabaseClient";

const initMercadoPagoConnect = () => {
  const button = document.querySelector("[data-mp-connect]");
  const status = document.querySelector("[data-mp-connect-status]");
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.dataset.abMpConnectBound === "true") return;
  button.dataset.abMpConnectBound = "true";

  const params = new URLSearchParams(window.location.search);
  const oauthStatus = params.get("mp_oauth");
  if (status && oauthStatus === "connected") {
    status.textContent = "Mercado Pago conectado.";
  } else if (status && oauthStatus) {
    status.textContent = "No se pudo conectar Mercado Pago. Intentá nuevamente.";
  }

  const refreshStatus = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token ?? "";
      if (!token) return;
      const response = await fetch("/api/mercadopago/oauth/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (payload?.connected) {
        button.textContent = "Mercado Pago conectado";
        button.disabled = true;
        if (status && !status.textContent) status.textContent = "Tu cuenta ya está conectada.";
      }
    } catch {
      // El estado de conexión es informativo; no bloquea el formulario.
    }
  };

  button.addEventListener("click", async () => {
    if (button.dataset.loading === "true") return;
    button.dataset.loading = "true";
    button.disabled = true;
    const previousText = button.textContent;
    button.textContent = "Conectando...";
    if (status) status.textContent = "";

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token ?? "";
      if (!token) {
        window.location.href = "/login?returnTo=/vender/productos";
        return;
      }

      const response = await fetch("/api/mercadopago/oauth/connect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.authorization_url) {
        throw new Error(String(payload?.error ?? "No se pudo iniciar Mercado Pago."));
      }
      window.location.href = payload.authorization_url;
    } catch (error) {
      if (status) {
        status.textContent = error instanceof Error ? error.message : "No se pudo iniciar Mercado Pago.";
      }
      button.disabled = false;
      button.textContent = previousText || "Conectar Mercado Pago";
      delete button.dataset.loading;
    }
  });

  refreshStatus();
};

initMercadoPagoConnect();
document.addEventListener("astro:page-load", initMercadoPagoConnect);
document.addEventListener("astro:after-swap", initMercadoPagoConnect);
