import { supabase } from "../lib/supabaseClient";

const guest = document.querySelector('[data-auth="guest"]');
const user = document.querySelector('[data-auth="user"]');
const avatarImg = document.getElementById("auth-avatar");
const logoutButton = document.getElementById("auth-logout");

const setView = (session) => {
  if (!guest || !user) return;
  if (session?.user) {
    guest.classList.add("ab-is-hidden");
    user.classList.remove("ab-is-hidden");
    const avatarUrl = session.user.user_metadata?.avatar_url;
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

logoutButton?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
});

resolveSession();
