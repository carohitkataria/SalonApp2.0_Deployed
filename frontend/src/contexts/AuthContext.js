import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper: turn any FastAPI error body into a safe string. FastAPI may return
// detail as a string OR a structured object (e.g. { code, message, reason }).
// Returning an object to a consumer that drops it into JSX/toast.error()
// crashes React with "Objects are not valid as a React child".
const extractErrorMessage = (error, fallback) => {
  const raw = error?.response?.data?.detail ?? error?.response?.data;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    return raw.message || raw.detail || raw.error || fallback;
  }
  return error?.message || fallback;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [salonUser, setSalonUser] = useState(null); // New: multi-user salon auth
  const [loading, setLoading] = useState(true);

  // ── Customer session rehydration (Module 8) ──────────────────────────────
  // The customer session is a long-lived (365-day) JWT stored in localStorage.
  // On boot we optimistically hydrate `user` from localStorage, then validate
  // the token against /auth/customer/me in the background. If invalid/expired,
  // we clear the session so the app falls back to the login screen.
  useEffect(() => {
    const token = localStorage.getItem('salon_customer_token');
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/auth/customer/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        const freshUser = res.data?.user;
        if (freshUser) {
          setUser(freshUser);
          localStorage.setItem('salon_user', JSON.stringify(freshUser));
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.response?.status === 401) {
          // Token invalid/expired — clear the customer session.
          localStorage.removeItem('salon_customer_token');
          localStorage.removeItem('salon_user');
          setUser(null);
          window.dispatchEvent(new Event('salon-auth-changed'));
        }
        // Network errors: keep the optimistic localStorage session.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const refreshAuth = () => {
      // User
      const storedUser = localStorage.getItem('salon_user');
      setUser(storedUser ? JSON.parse(storedUser) : null);

      // Legacy admin token
      const adminToken = localStorage.getItem('salon_admin_token');
      setAdmin(adminToken ? { token: adminToken } : null);

      // Multi-user salon auth
      const storedSalonUser = localStorage.getItem('salon_user_auth');
      setSalonUser(storedSalonUser ? JSON.parse(storedSalonUser) : null);
    };
    refreshAuth();
    setLoading(false);

    // Listen for in-app auth-change events (login/logout from any component)
    // and cross-tab `storage` events. This keeps `salonUser` / `admin` in sync
    // with localStorage, preventing stale dashboard state when an admin logs in
    // right after a staff logout (or vice versa) on the same browser.
    const handler = () => refreshAuth();
    window.addEventListener('salon-auth-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('salon-auth-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const loginUser = async (name, phone, gender = null) => {
    try {
      // Auto-append +91 if not present
      let formattedPhone = phone;
      if (!phone.startsWith('+91')) {
        formattedPhone = `+91${phone}`;
      }

      const response = await axios.post(`${API}/user/login`, {
        name,
        phone: formattedPhone,
        gender
      });

      const userData = response.data;
      setUser(userData);
      localStorage.setItem('salon_user', JSON.stringify(userData));
      return { success: true, user: userData };
    } catch (error) {
      return { success: false, error: extractErrorMessage(error, 'Login failed') };
    }
  };

  const loginAdmin = async (username, password) => {
    try {
      const response = await axios.post(`${API}/auth/admin/login`, {
        username,
        password
      });

      const token = response.data.access_token;
      setAdmin({ token });
      localStorage.setItem('salon_admin_token', token);
      return { success: true };
    } catch (error) {
      return { success: false, error: extractErrorMessage(error, 'Invalid credentials') };
    }
  };

  const loginSalonUser = async (identifier, password) => {
    try {
      const response = await axios.post(`${API}/salon/users/login`, {
        identifier,
        password
      });

      const authData = {
        token: response.data.access_token,
        salonId: response.data.salon_id,
        userId: response.data.user_id,
        role: response.data.role,
        permissions: response.data.permissions,
        assignedBranchIds: response.data.assigned_branch_ids || [],
        staffId: response.data.staff_id || null
      };
      
      setSalonUser(authData);
      localStorage.setItem('salon_user_auth', JSON.stringify(authData));
      return { success: true, data: authData };
    } catch (error) {
      return { success: false, error: extractErrorMessage(error, 'Login failed') };
    }
  };

  // ── Module 8: Customer Auth (OTP + Password + long-lived session) ─────────
  // Persist the customer session: 365-day JWT + the public user object.
  const persistCustomerSession = (token, userData) => {
    if (token) localStorage.setItem('salon_customer_token', token);
    if (userData) {
      localStorage.setItem('salon_user', JSON.stringify(userData));
      setUser(userData);
    }
    window.dispatchEvent(new Event('salon-auth-changed'));
  };

  // Tells the UI whether to show "Set password" or "Reset password".
  const customerCheckAccount = async (phone) => {
    try {
      const res = await axios.post(`${API}/auth/customer/check-account`, { phone });
      return { success: true, ...res.data };
    } catch (error) {
      return { success: false, error: extractErrorMessage(error, 'Could not check account') };
    }
  };

  // Send a WhatsApp OTP. purpose ∈ login | set_password | reset_password.
  const customerSendOtp = async (phone, purpose = 'login') => {
    try {
      const res = await axios.post(`${API}/auth/customer/send-otp`, { phone, purpose });
      if (res.data?.delivery_status === 'failed') {
        return { success: false, error: res.data?.note || 'OTP delivery failed. Please try again.' };
      }
      return { success: true, ...res.data };
    } catch (error) {
      return { success: false, error: extractErrorMessage(error, 'Failed to send OTP') };
    }
  };

  // Verify OTP. For login → issues session + returns user. For set/reset →
  // returns a short-lived password_reset_token.
  const customerVerifyOtp = async (phone, otp, purpose = 'login') => {
    try {
      const res = await axios.post(`${API}/auth/customer/verify-otp`, { phone, otp, purpose });
      if (res.data?.purpose === 'login' && res.data?.access_token) {
        persistCustomerSession(res.data.access_token, res.data.user);
      }
      return { success: true, ...res.data };
    } catch (error) {
      return { success: false, error: extractErrorMessage(error, 'Invalid OTP') };
    }
  };

  // Set/reset password (requires password_reset_token). Auto-logs in.
  const customerSetPassword = async (phone, password, passwordResetToken) => {
    try {
      const res = await axios.post(`${API}/auth/customer/set-password`, {
        phone,
        password,
        password_reset_token: passwordResetToken,
      });
      if (res.data?.access_token) {
        persistCustomerSession(res.data.access_token, res.data.user);
      }
      return { success: true, ...res.data };
    } catch (error) {
      return { success: false, error: extractErrorMessage(error, 'Could not set password') };
    }
  };

  // Phone + password login. Issues long-lived session JWT.
  const customerLoginPassword = async (phone, password) => {
    try {
      const res = await axios.post(`${API}/auth/customer/login-password`, { phone, password });
      if (res.data?.access_token) {
        persistCustomerSession(res.data.access_token, res.data.user);
      }
      return { success: true, ...res.data };
    } catch (error) {
      return { success: false, error: extractErrorMessage(error, 'Invalid phone or password') };
    }
  };

  // Save profile fields (e.g. name/gender) for the logged-in customer and keep
  // the local session user in sync. `phone` should be the normalized +91 phone.
  const updateCustomerProfile = async (phone, fields) => {
    try {
      const res = await axios.put(`${API}/users/by-phone/${encodeURIComponent(phone)}`, fields);
      const updated = res.data;
      const merged = { ...(user || {}), ...updated, ...fields };
      setUser(merged);
      localStorage.setItem('salon_user', JSON.stringify(merged));
      window.dispatchEvent(new Event('salon-auth-changed'));
      return { success: true, user: merged };
    } catch (error) {
      return { success: false, error: extractErrorMessage(error, 'Could not update profile') };
    }
  };

  const getCustomerHeaders = () => {
    const token = localStorage.getItem('salon_customer_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const logoutUser = () => {
    setUser(null);
    localStorage.removeItem('salon_user');
    localStorage.removeItem('salon_customer_token');
    window.dispatchEvent(new Event('salon-auth-changed'));
  };

  const updateUserOtpStatus = (isVerified, verifiedAt = null) => {
    if (user) {
      const updatedUser = {
        ...user,
        is_otp_verified: isVerified,
        otp_verified_at: verifiedAt
      };
      setUser(updatedUser);
      localStorage.setItem('salon_user', JSON.stringify(updatedUser));
    }
  };

  const logoutAdmin = () => {
    setAdmin(null);
    localStorage.removeItem('salon_admin_token');
  };

  const logoutSalonUser = () => {
    setSalonUser(null);
    localStorage.removeItem('salon_user_auth');
  };

  const getAdminHeaders = () => {
    if (admin?.token) {
      return { Authorization: `Bearer ${admin.token}` };
    }
    return {};
  };

  const getSalonUserHeaders = () => {
    if (salonUser?.token) {
      return { Authorization: `Bearer ${salonUser.token}` };
    }
    return {};
  };

  const isAdmin = () => {
    return salonUser?.role === 'admin';
  };

  const isStaff = () => {
    return salonUser?.role === 'staff';
  };

  const isBranchManager = () => {
    return salonUser?.role === 'branch_manager';
  };

  const getAssignedBranchIds = () => {
    return salonUser?.assignedBranchIds || [];
  };

  const hasPermission = (permission) => {
    if (salonUser?.role === 'admin') return true;
    if (salonUser?.role === 'branch_manager') return true;
    return salonUser?.permissions?.[permission] || false;
  };

  /**
   * Granular module-level permission check.
   * Example:  hasModulePermission('staff', 'attendance')
   *           hasModulePermission('financials', 'delete_transaction')
   *
   * Admin & branch_manager always pass. For staff, we consult the granular
   * `permissions.modules[module][action]` first; if unset, we fall back to
   * the legacy flat `can_access_*` keys via the LEGACY_MAP below so users
   * without the new granular config keep working exactly as before.
   */
  const MODULE_LEGACY_MAP = {
    staff: {
      view: 'can_access_staff', view_all: 'can_view_all_staff',
      create: 'can_access_staff', edit: 'can_access_staff', delete: 'can_access_staff',
      attendance: 'can_access_staff', salary_view: 'can_access_staff',
      salary_pay: 'can_access_staff', documents: 'can_access_staff',
      access_control: 'can_access_staff',
    },
    financials: {
      view_dashboard: 'can_access_financials', view_transactions: 'can_access_financials',
      create_transaction: 'can_access_financials', edit_transaction: 'can_access_financials',
      delete_transaction: 'can_access_financials',
    },
    analytics: { view: 'can_access_analytics' },
    services: {
      view: 'can_access_services', create: 'can_access_services',
      edit: 'can_access_services', delete: 'can_access_services',
      toggle: 'can_access_services', upload_csv: 'can_access_services',
      manage_categories: 'can_access_services', manage_packages: 'can_access_services',
      manage_memberships: 'can_access_services',
    },
    gallery: { view: 'can_access_gallery', upload: 'can_access_gallery', delete: 'can_access_gallery' },
    marketing: {
      view: 'can_access_marketing', create_campaign: 'can_access_marketing',
      edit_campaign: 'can_access_marketing', delete_campaign: 'can_access_marketing',
      manage_coupons: 'can_access_marketing', manage_loyalty: 'can_access_marketing',
    },
    salon_settings: {
      view: 'can_edit_salon', edit_profile: 'can_edit_salon',
      edit_hours: 'can_edit_salon', edit_notifications: 'can_edit_salon',
      edit_branches: 'can_edit_salon', manage_users: 'can_edit_salon',
      manage_subscription: 'can_edit_salon',
    },
    delete_salon: { allowed: 'can_delete_salon' },
  };

  const hasModulePermission = (moduleName, action) => {
    if (salonUser?.role === 'admin') return true;
    if (salonUser?.role === 'branch_manager') return true;
    const perms = salonUser?.permissions || {};
    const mods = perms.modules || {};
    const modPerms = mods[moduleName] || {};
    if (modPerms[action]) return true;
    const legacyKey = MODULE_LEGACY_MAP[moduleName]?.[action];
    if (legacyKey && perms[legacyKey]) return true;
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        admin,
        salonUser,
        loading,
        loginUser,
        loginAdmin,
        loginSalonUser,
        logoutUser,
        logoutAdmin,
        logoutSalonUser,
        updateUserOtpStatus,
        getAdminHeaders,
        getSalonUserHeaders,
        getCustomerHeaders,
        customerCheckAccount,
        customerSendOtp,
        customerVerifyOtp,
        customerSetPassword,
        customerLoginPassword,
        updateCustomerProfile,
        isAdmin,
        isStaff,
        isBranchManager,
        getAssignedBranchIds,
        hasPermission,
        hasModulePermission,
        isUserLoggedIn: !!user,
        isUserOtpVerified: !!user?.is_otp_verified,
        isAdminLoggedIn: !!admin,
        isSalonUserLoggedIn: !!salonUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
