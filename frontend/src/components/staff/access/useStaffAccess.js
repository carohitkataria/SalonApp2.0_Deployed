import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Turn any axios error into a renderable string (FastAPI 422/objects safe).
export function apiError(err, fallback = 'Something went wrong') {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg || 'Invalid value').join(', ');
  if (detail && typeof detail === 'object') return detail.message || detail.msg || fallback;
  return err?.message || fallback;
}

/**
 * Central data hooks for the Staff Access surfaces (roles, user accounts,
 * branches). No component owns axios calls directly.
 */
export function useStaffAccess(salonId) {
  const { getSalonUserHeaders, salonUser } = useAuth();
  const sid = salonId || salonUser?.salonId || localStorage.getItem('salon_id');
  const headers = getSalonUserHeaders?.() || {};

  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchRoles = useCallback(async () => {
    if (!sid) return [];
    const res = await axios.get(`${API}/salons/${sid}/roles`, { headers });
    const list = res.data?.roles || [];
    setRoles(list);
    return list;
  }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUsers = useCallback(async () => {
    const res = await axios.get(`${API}/salon/users`, { headers });
    const list = res.data?.users || [];
    setUsers(list);
    return list;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBranches = useCallback(async () => {
    if (!sid) return [];
    const res = await axios.get(`${API}/salons/${sid}/branches`, { headers });
    const list = Array.isArray(res.data) ? res.data : [];
    setBranches(list);
    return list;
  }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStaffMembers = useCallback(async () => {
    if (!sid) return [];
    const res = await axios.get(`${API}/salons/${sid}/barbers`);
    const list = Array.isArray(res.data) ? res.data : (res.data?.barbers || []);
    setStaffMembers(list);
    return list;
  }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps

  const createRole = (body) => axios.post(`${API}/salons/${sid}/roles`, body, { headers });
  const updateRole = (roleId, body) => axios.put(`${API}/salons/${sid}/roles/${roleId}`, body, { headers });
  const deleteRole = (roleId) => axios.delete(`${API}/salons/${sid}/roles/${roleId}`, { headers });

  const createUser = (body) => axios.post(`${API}/salon/users`, { salon_id: sid, ...body }, { headers });
  const updateUser = (userId, body) => axios.put(`${API}/salon/users/${userId}`, body, { headers });
  const setUserStatus = (userId, active) =>
    active
      ? axios.put(`${API}/salon/users/${userId}`, { status: 'active' }, { headers })
      : axios.delete(`${API}/salon/users/${userId}`, { headers });

  return {
    sid, headers,
    roles, users, branches, staffMembers, loading, setLoading,
    fetchRoles, fetchUsers, fetchBranches, fetchStaffMembers,
    createRole, updateRole, deleteRole,
    createUser, updateUser, setUserStatus,
  };
}

/** Convenience: fetch roles once on mount. */
export function useRoles(salonId) {
  const access = useStaffAccess(salonId);
  useEffect(() => { access.fetchRoles().catch(() => {}); }, [access.sid]); // eslint-disable-line react-hooks/exhaustive-deps
  return access;
}
