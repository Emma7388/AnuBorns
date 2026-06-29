import { supabase } from "../lib/supabaseClient";

const initMercadoPagoConnect = () => {
  const button = document.querySelector("[data-mp-connect]");
  const disconnectButton = document.querySelector("[data-mp-disconnect]");
  const status = document.querySelector("[data-mp-connect-status]");
  const account = document.querySelector("[data-mp-connect-account]");
  const requiredContent = document.querySelector("[data-mp-required-content]");
  const successPanel = document.getElementById("product-success");
  if (!(button instanceof HTMLButtonElement)) return;
  if (!(disconnectButton instanceof HTMLButtonElement)) return;
  if (button.dataset.abMpConnectBound === "true" && disconnectButton.dataset.abMpDisconnectBound === "true") return;
  button.dataset.abMpConnectBound = "true";
  disconnectButton.dataset.abMpDisconnectBound = "true";

  const setConnectButtonContent = (text) => {
    button.innerHTML = `
      <img src="/icons/mercado-pago.svg" alt="" aria-hidden="true" />
      <span>${text}</span>
    `;
  };

  const setDisconnectButtonContent = (text) => {
    disconnectButton.innerHTML = `<span>${text}</span>`;
  };

  const setPublisherVisible = (visible) => {
    requiredContent?.classList.toggle("ab-is-hidden", !visible);
    if (!visible) successPanel?.classList.add("ab-is-hidden");
  };

  const setDisconnectVisible = (visible) => {
    disconnectButton.classList.toggle("ab-is-hidden", !visible);
    disconnectButton.disabled = !visible;
  };

  const launchConfetti = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const wrap = document.createElement("div");
    wrap.className = "ab-mp-confetti";
    wrap.setAttribute("aria-hidden", "true");
    const colors = ["#00b1ea", "#22c55e", "#ffe600", "#ffffff", "#2d3277"];
    for (let index = 0; index < 42; index += 1) {
      const piece = document.createElement("span");
      piece.style.setProperty("--x", `${Math.random() * 100}vw`);
      piece.style.setProperty("--r", `${Math.random() * 520 - 260}deg`);
      piece.style.setProperty("--d", `${Math.random() * 0.7}s`);
      piece.style.setProperty("--c", colors[index % colors.length]);
      wrap.appendChild(piece);
    }
    document.body.appendChild(wrap);
    window.setTimeout(() => wrap.remove(), 2200);
  };

  const renderAccount = (payload) => {
    if (!(account instanceof HTMLElement)) return;
    const label = String(payload?.account_label ?? "").trim();
    const mpUserId = String(payload?.mp_user_id ?? "").trim();
    if (!label && !mpUserId) {
      account.textContent = "";
      account.classList.add("ab-is-hidden");
      setDisconnectVisible(false);
      setPublisherVisible(false);
      return;
    }
    account.textContent = label
      ? `Cuenta conectada: ${label}${mpUserId ? ` - Usuario MP ${mpUserId}` : ""}`
      : `Cuenta conectada: Usuario MP ${mpUserId}`;
    account.classList.remove("ab-is-hidden");
    setDisconnectVisible(true);
    setPublisherVisible(true);
  };

  const params = new URLSearchParams(window.location.search);
  const oauthStatus = params.get("mp_oauth");
  const shouldCelebrateConnection = oauthStatus === "connected";
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
        setConnectButtonContent("Reconectar Mercado Pago");
        button.disabled = false;
        if (shouldCelebrateConnection) {
          launchConfetti();
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete("mp_oauth");
          window.history.replaceState({}, "", nextUrl);
        }
      } else {
        renderAccount(null);
        setConnectButtonContent("Conectar Mercado Pago");
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
    const previousText = button.textContent?.trim() || "Conectar Mercado Pago";
    setConnectButtonContent("Conectando...");
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
      setConnectButtonContent(previousText || "Conectar Mercado Pago");
      delete button.dataset.loading;
    }
  });

  disconnectButton.addEventListener("click", async () => {
    if (disconnectButton.dataset.loading === "true") return;
    disconnectButton.dataset.loading = "true";
    disconnectButton.disabled = true;
    const previousText = disconnectButton.textContent?.trim() || "Desconectar Mercado Pago";
    setDisconnectButtonContent("Desconectando...");
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
      setConnectButtonContent("Conectar Mercado Pago");
      button.disabled = false;
      if (status) status.textContent = "Mercado Pago desconectado.";
    } catch (error) {
      disconnectButton.disabled = false;
      if (status) {
        status.textContent = error instanceof Error ? error.message : "No se pudo desconectar Mercado Pago.";
      }
    } finally {
      setDisconnectButtonContent(previousText || "Desconectar Mercado Pago");
      delete disconnectButton.dataset.loading;
    }
  });

  setPublisherVisible(false);
  setConnectButtonContent(button.textContent?.trim() || "Conectar Mercado Pago");
  refreshStatus();
};

initMercadoPagoConnect();
document.addEventListener("astro:page-load", initMercadoPagoConnect);
document.addEventListener("astro:after-swap", initMercadoPagoConnect);
