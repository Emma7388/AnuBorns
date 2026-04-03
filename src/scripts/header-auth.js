import { supabase } from "../lib/supabaseClient";

const guest = document.querySelector('[data-auth="guest"]');
const user = document.querySelector('[data-auth="user"]');
const avatarImg = document.getElementById("auth-avatar");
const nameLabel = document.getElementById("auth-name");
const logoutButton = document.getElementById("auth-logout");
const logoutModal = document.getElementById("logout-modal");
const modalCancel = document.querySelector("[data-modal-cancel]");
const modalConfirm = document.querySelector("[data-modal-confirm]");
const modalClose = document.querySelector("[data-modal-close]");

const openModal = () => {
  if (!logoutModal) return;
  logoutModal.classList.remove("ab-is-hidden");
  logoutModal.setAttribute("aria-hidden", "false");
  modalConfirm?.focus();
};

const closeModal = () => {
  if (!logoutModal) return;
  logoutModal.classList.add("ab-is-hidden");
  logoutModal.setAttribute("aria-hidden", "true");
  logoutButton?.focus();
};

const getDisplayName = (authUser) => {
  if (!authUser) return "";
  const meta = authUser.user_metadata ?? {};
  const firstName = String(meta.first_name ?? "").trim();
  if (firstName) return firstName;
  const email = String(authUser.email ?? "").trim();
  if (!email) return "";
  return email.split("@")[0] || email;
};

const setView = (session) => {
  if (!guest || !user) return;
  if (session?.user) {
    guest.classList.add("ab-is-hidden");
    user.classList.remove("ab-is-hidden");
    const avatarUrl = session.user.user_metadata?.avatar_url;
    if (nameLabel) {
      nameLabel.textContent = getDisplayName(session.user);
    }
    if (avatarImg) {
      if (avatarUrl) {
        avatarImg.src = avatarUrl;
        avatarImg.style.display = "block";
      } else {
        avatarImg.removeAttribute("src");
        avatarImg.style.display = "none";
      }
    }
  } else {
    user.classList.add("ab-is-hidden");
    guest.classList.remove("ab-is-hidden");
    if (nameLabel) {
      nameLabel.textContent = "";
    }
  }
};

const resolveSession = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) {
    setView(sessionData.session);
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    setView({ user: userData.user });
    return;
  }

  setView(null);
};

supabase.auth.onAuthStateChange((_event, session) => {
  setView(session);
});

logoutButton?.addEventListener("click", () => {
  openModal();
});

modalCancel?.addEventListener("click", () => {
  closeModal();
});

modalClose?.addEventListener("click", () => {
  closeModal();
});

modalConfirm?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});

resolveSession();
