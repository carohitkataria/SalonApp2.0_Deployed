import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Central query-key factory so every consumer of the same data shares ONE
// cached request (dedupes the "same call 3-4 times per screen" problem).
export const qk = {
  servicesEnabled: (salonId) => ["servicesEnabled", salonId],
  classification: (salonId) => ["classification", salonId],
  opsSettings: (salonId) => ["opsSettings", salonId],
  queue: (salonId, params) => ["queue", salonId, params || null],
  todaySales: (salonId, branchId) => ["todaySales", salonId, branchId || null],
  unreadCount: (salonId) => ["unreadCount", salonId],
  paymentHistory: (salonId, params) => ["paymentHistory", salonId, params || null],
};

const get = async (url, headers) => {
  const { data } = await axios.get(url, { headers: headers || {} });
  return data;
};

export function useServicesEnabled(salonId, { headers, enabled = true } = {}) {
  return useQuery({
    queryKey: qk.servicesEnabled(salonId),
    queryFn: () => get(`${API}/salons/${salonId}/services/enabled`, headers),
    enabled: !!salonId && enabled,
  });
}

export function useClassification(salonId, { headers, enabled = true } = {}) {
  return useQuery({
    queryKey: qk.classification(salonId),
    queryFn: () => get(`${API}/salons/${salonId}/classification`, headers),
    enabled: !!salonId && enabled,
  });
}

export function useOpsSettings(salonId, { headers, enabled = true } = {}) {
  return useQuery({
    queryKey: qk.opsSettings(salonId),
    queryFn: () => get(`${API}/salons/${salonId}/ops-settings`, headers),
    enabled: !!salonId && enabled,
  });
}

export function useTodaySales(salonId, { headers, branchId, enabled = true } = {}) {
  const q = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : "";
  return useQuery({
    queryKey: qk.todaySales(salonId, branchId),
    queryFn: () => get(`${API}/salons/${salonId}/today-sales${q}`, headers),
    enabled: !!salonId && enabled,
  });
}

export function useUnreadCount(salonId, { headers, enabled = true, refetchInterval } = {}) {
  return useQuery({
    queryKey: qk.unreadCount(salonId),
    queryFn: () => get(`${API}/salons/${salonId}/messages/unread-count`, headers),
    enabled: !!salonId && enabled,
    // Unread is time-sensitive: allow a light background poll, but still cached/deduped.
    refetchInterval: refetchInterval || false,
  });
}

// Generic invalidator so mutations can refresh only what changed.
export function useInvalidateSalonData() {
  const qc = useQueryClient();
  return (keys) => {
    (Array.isArray(keys) ? keys : [keys]).forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };
}
