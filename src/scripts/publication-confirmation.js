import { supabase } from "../lib/supabaseClient";

const initPublicationConfirmation = async () => {
  const status = document.getElementById("publication-payment-status");
  if (!status || status.dataset.bound === "true") return;
  status.dataset.bound = "true";
  const paymentRecordId = new URLSearchParams(window.location.search).get("payment")?.trim() ?? "";
  if (!paymentRecordId) {
    status.textContent = "No encontramos la referencia del pago. Revisá el estado en Mis ventas.";
    return;
  }
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token ?? "";
  if (!token) {
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  try {
    const response = await fetch("/api/publication-payment-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ payment_record_id: paymentRecordId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error ?? "No se pudo confirmar el pago."));
    if (payload?.publication_status === "active") {
      const expires = payload?.expires_at ? new Date(payload.expires_at).toLocaleDateString("es-AR") : "dentro de 30 días";
      status.textContent = `Pago aprobado. La publicación está activa hasta el ${expires}.`;
    } else {
      status.textContent = "El pago todavía está pendiente. Podés volver a consultarlo desde Mis ventas.";
    }
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "No se pudo confirmar el pago.";
  }
};

initPublicationConfirmation();
document.addEventListener("astro:page-load", initPublicationConfirmation);
