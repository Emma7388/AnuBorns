import { supabase } from "../lib/supabaseClient";

const initMercadoPagoConnect = () => {
  const button = document.querySelector("[data-mp-connect]");
  const disconnectButton = document.querySelector("[data-mp-disconnect]");
  const status = document.querySelector("[data-mp-connect-status]");
  const account = document.querySelector("[data-mp-connect-account]");
  if (!(button instanceof HTMLButtonElement)) return;
  if (!(disconnectButton instanceof HTMLButtonElement)) return;
  if (button.dataset.abMpConnectBound === "true" && disconnectButton.dataset.abMpDisconnectBound === "true") return;
  button.dataset.abMpConnectBound = "true";
  disconnectButton.dataset.abMpDisconnectBound = "true";

  const setDisconnectVisible = (visible) => {
    disconnectButton.classList.toggle("ab-is-hidden", !visible);
    disconnectButton.disabled = !visible;
  };

  const renderAccount = (payload) => {
    if (!(account instanceof HTMLElement)) return;
    const label = String(payload?.account_label ?? "").trim();
    const mpUserId = String(payload?.mp_user_id ?? "").trim();
    if (!label && !mpUserId) {
      account.textContent = "";
      account.classList.add("ab-is-hidden");
      setDisconnectVisible(false);
      return;
    }
    account.textContent = label
      ? `Cuenta conectada: ${label}${mpUserId ? ` - Usuario MP ${mpUserId}` : ""}`
      : `Cuenta conectada: Usuario MP ${mpUserId}`;
    account.classList.remove("ab-is-hidden");
    setDisconnectVisible(true);
  };

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
        renderAccount(payload);
        button.textContent = "Reconectar Mercado Pago";
        button.disabled = false;
      } else {
        renderAccount(null);
        button.textContent = "Conectar Mercado Pago";
        button.disabled = false;
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
    renderAccount(null);

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

  disconnectButton.addEventListener("click", async () => {
    if (disconnectButton.dataset.loading === "true") return;
    disconnectButton.dataset.loading = "true";
    disconnectButton.disabled = true;
    const previousText = disconnectButton.textContent;
    disconnectButton.textContent = "Desconectando...";
    if (status) status.textContent = "";

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token ?? "";
      if (!token) {
        window.location.href = "/login?returnTo=/vender/productos";
        return;
      }

      const response = await fetch("/api/mercadopago/oauth/disconnect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error ?? "No se pudo desconectar Mercado Pago."));
      }

      renderAccount(null);
      button.textContent = "Conectar Mercado Pago";
      button.disabled = false;
      if (status) status.textContent = "Mercado Pago desconectado.";
    } catch (error) {
      disconnectButton.disabled = false;
      if (status) {
        status.textContent = error instanceof Error ? error.message : "No se pudo desconectar Mercado Pago.";
      }
    } finally {
      disconnectButton.textContent = previousText || "Desconectar Mercado Pago";
      delete disconnectButton.dataset.loading;
    }
  });

  refreshStatus();
};

initMercadoPagoConnect();
document.addEventListener("astro:page-load", initMercadoPagoConnect);
document.addEventListener("astro:after-swap", initMercadoPagoConnect);
