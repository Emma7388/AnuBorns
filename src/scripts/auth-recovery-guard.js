import { supabase } from "../lib/supabaseClient";
import { readStorageValue, removeStorageValue, writeStorageValue } from "../lib/browserStorage.js";

const RECOVERY_PENDING_KEY = "ab_password_recovery_pending";
const RECOVERY_PATH = "/nueva-contrasena";
const LOGIN_PATH = "/login";

let isRedirecting = false;

const searchParams = () => new URLSearchParams(window.location.search);
const hashParams = () => new URLSearchParams(window.location.hash.replace(/^#/, ""));
const getUrlParam = (name) => searchParams().get(name) || hashParams().get(name);

const isRecoveryPage = () => window.location.pathname === RECOVERY_PATH;
const isAllowedRecoveryPath = () => window.location.pathname === RECOVERY_PATH;

const hasRecoveryUrlSignal = () => {
  const type = getUrlParam("type");
  if (type === "recovery") return true;

  const hasAuthCode = Boolean(getUrlParam("code"));
  const hasHashSession = Boolean(getUrlParam("access_token") && getUrlParam("refresh_token"));

  if (isRecoveryPage() && (hasAuthCode || hasHashSession)) return true;

  /*
   * Si el usuario cambia manualmente la ruta del enlace de recuperacion,
   * el code/hash puede quedar en otra pagina. En ese caso tambien encerramos
   * la sesion en el flujo de nueva contrasena.
   */
  return window.location.pathname !== "/auth/callback" && (hasAuthCode || hasHashSession);
};

const markRecoveryPending = () => {
  writeStorageValue(RECOVERY_PENDING_KEY, "1");
};

const clearRecoveryPending = () => {
  removeStorageValue(RECOVERY_PENDING_KEY);
};

const hasRecoveryPending = () => {
  if (hasRecoveryUrlSignal()) return true;
  return readStorageValue(RECOVERY_PENDING_KEY) === "1";
};

const getRecoveryRedirectUrl = () => {
  const url = new URL(RECOVERY_PATH, window.location.origin);
  url.searchParams.set("returnTo", LOGIN_PATH);

  const code = searchParams().get("code");
  const type = searchParams().get("type");
  if (code) url.searchParams.set("code", code);
  if (type) url.searchParams.set("type", type);

  return `${url.pathname}${url.search}${window.location.hash}`;
};

const enforceRecoveryGuard = async () => {
  const urlHasRecoverySignal = hasRecoveryUrlSignal();
  if (urlHasRecoverySignal) markRecoveryPending();

  if (urlHasRecoverySignal && !isAllowedRecoveryPath() && !isRedirecting) {
    isRedirecting = true;
    window.location.replace(getRecoveryRedirectUrl());
    return;
  }

  const recoveryPending = hasRecoveryPending();
  if (!recoveryPending || isRedirecting) return;

  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) {
    clearRecoveryPending();
    return;
  }

  if (isAllowedRecoveryPath()) return;

  isRedirecting = true;
  window.location.replace(getRecoveryRedirectUrl());
};

window.addEventListener("ab-password-recovery-complete", clearRecoveryPending);
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") clearRecoveryPending();
});

enforceRecoveryGuard().catch(() => {});
document.addEventListener("astro:page-load", () => enforceRecoveryGuard().catch(() => {}));
document.addEventListener("astro:after-swap", () => enforceRecoveryGuard().catch(() => {}));
window.addEventListener("pageshow", () => enforceRecoveryGuard().catch(() => {}));
