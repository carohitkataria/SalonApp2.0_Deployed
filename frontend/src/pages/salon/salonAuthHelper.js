// Small helper to build salon auth headers (same logic used across the dashboard).
export function getSalonAuthHeaders() {
  const salonUserAuth = localStorage.getItem('salon_user_auth');
  if (salonUserAuth) {
    try {
      const authData = JSON.parse(salonUserAuth);
      return { Authorization: `Bearer ${authData.token}` };
    } catch (e) {
      // fallthrough
    }
  }
  const legacyToken = localStorage.getItem('salon_admin_token');
  return { Authorization: `Bearer ${legacyToken}` };
}

export function getSalonId() {
  return localStorage.getItem('salon_id');
}
