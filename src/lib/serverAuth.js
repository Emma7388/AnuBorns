/* Autenticación Bearer compartida por rutas API del servidor. */
export const getAuthenticatedUser = async (supabaseAdmin, request) => {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "No autorizado." };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, status: 401, error: "No autorizado." };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Sesión inválida." };
  }

  return { ok: true, user: data.user };
};
