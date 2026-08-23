/**
 * SalonHomeV2.js — Home page redesign matching the Zenoti-style mock exactly.
 *
 * Layout:
 *   • Fixed left icon RAIL (matches existing hamburger menu items so nothing
 *     is lost) + slim right RIBBON (New Appt, Add Guest, Search, Messages,
 *     Notifications, Help).
 *   • Sticky topbar with branch chip + search box.
 *   • Greeting + Today/Yesterday/Range filter → drives EVERY metric.
 *   • KPI grid: 5 cols × 2 rows with a 2×2 Upcoming Queue block at the right.
 *     The 6 chips are: Total Sales · Avg Ticket · No-Show · Rebooking ·
 *     Customer Count (source bar chart) · Staff Check-in.
 *   • Secondary strip: Appointments · Reminders · Waitlist · Send booking link
 *     (compact, with WhatsApp send + triangle dropdown + copy button).
 *   • Marketing Performance panel (real backend data).
 *   • Row A: Marketing + Leaderboard
 *   • Row B: Targets (with barber filter) + Reviews + Payment mix
 *   • Row C: Revenue + Top Services + Busy Hours (sparklines from real data)
 *   • Right-slide drawers: Appointment (with 3 modes) + Guest.
 *
 * Existing queue action buttons (call, mark complete) preserved on each row.
 * Existing hamburger menu items preserved as rail entries.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { HOME_V2_CSS } from './home_v2/styles';
import AppointmentDrawer from './home_v2/AppointmentDrawer';
import CustomerDrawer from './home_v2/CustomerDrawer';
import GlobalSearchDropdown from './home_v2/GlobalSearchDropdown';
import NotificationsDrawer from './home_v2/NotificationsDrawer';
import OrdersDrawer from '@/components/ops/OrdersDrawer';
import MessagesDrawer from './home_v2/MessagesDrawer';
import SalonLogoControl from './home_v2/SalonLogoControl';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ---- Rail items (Home is now provided by the logo click at the top) ----
const RAIL_ITEMS = [
  { id: 'queue',           label: 'Bookings',     route: '/salon/dashboard?tab=queue' },
  { id: 'customer-master', label: 'Guests',    route: '/salon/dashboard?tab=customer-master' },
  { id: 'marketing',       label: 'Marketing', route: '/salon/dashboard?tab=marketing' },
  { id: 'inventory',       label: 'Inventory', route: '/salon/dashboard?tab=inventory' },
  { id: 'marketplace',     label: 'Shop',      route: '/salon/marketplace' },
  { id: 'staff',           label: 'Staff',     route: '/salon/dashboard?tab=staff' },
  { id: 'services',        label: 'Services',  route: '/salon/dashboard?tab=services' },
  { id: 'reports',         label: 'Reports',   route: '/salon/dashboard?tab=reports' },
  { id: 'salon',           label: 'Settings',  route: '/salon/dashboard?tab=salon' },
];

const SOURCE_COLORS = { online: '#6C4FE0', qr: '#12A594', owner: '#E8952B', direct: '#3E93E8' };
const SOURCE_LABELS = { online: 'Online', qr: 'QR', owner: 'Owner', direct: 'Direct' };
const PAY_COLORS = { cash: '#2FA96A', card: '#3E93E8', upi: '#6C4FE0', wallet: '#E8952B', unknown: '#9A9EAE' };

// Compact SVG icon set (stroke-based to match the mock exactly)
const I = {
  home: () => <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>,
  cal: () => <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  users: () => <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  chat: () => <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  chart: () => <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  gear: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  plus: () => <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  guestAdd: () => <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  cart: () => <svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  search: () => <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell: () => <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  help: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  branch: () => <svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>,
  scissors: () => <svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  rupee: () => <svg viewBox="0 0 24 24"><path d="M6 3h12M6 8h12M9 3s5 0 5 5c0 4-5 5-5 5H6l7 8"/></svg>,
  ticket: () => <svg viewBox="0 0 24 24"><path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v2a2 2 0 0 0 0 4v2a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-2a2 2 0 0 0 0-4z"/></svg>,
  ghost: () => <svg viewBox="0 0 24 24"><path d="M9 9h.01M15 9h.01M9 15c1 1 5 1 6 0"/><path d="M12 2a8 8 0 0 0-8 8v11l3-2 2 2 3-2 3 2 2-2 3 2V10a8 8 0 0 0-8-8z"/></svg>,
  rotate: () => <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  ban: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  wa: () => <svg viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2z"/></svg>,
  send: () => <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  triDown: () => <svg viewBox="0 0 10 10"><polygon points="0 2 10 2 5 8"/></svg>,
  copy: () => <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  phone: () => <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  check: () => <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  x: () => <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  refresh: () => <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>,
  target: () => <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  star: () => <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  card: () => <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  tag: () => <svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  clock: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  trophy: () => <svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  truck: () => <svg viewBox="0 0 24 24"><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>,
};

function fmtRupee(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}
function pct(n) { return `${(n || 0).toFixed(1)}%`; }
function dateLabel(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}
function greetTime() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function shortMoney(n) {
  n = Number(n || 0);
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

/** Build a polyline `points` string from a values array on a 240×60 svg. */
function sparkPoints(vals, { w = 240, h = 60, pad = 4 } = {}) {
  if (!vals.length) return '';
  const max = Math.max(...vals, 1);
  const dx = (w - 2 * pad) / Math.max(1, vals.length - 1);
  return vals.map((v, i) => {
    const x = pad + i * dx;
    const y = h - pad - (v / max) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/** Same as sparkPoints but for a filled area path. */
function sparkAreaPath(vals, { w = 240, h = 60, pad = 4 } = {}) {
  if (!vals.length) return '';
  const max = Math.max(...vals, 1);
  const dx = (w - 2 * pad) / Math.max(1, vals.length - 1);
  const parts = vals.map((v, i) => {
    const x = pad + i * dx;
    const y = h - pad - (v / max) * (h - 2 * pad);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastX = pad + (vals.length - 1) * dx;
  parts.push(`L${lastX.toFixed(1)},${h - pad} L${pad},${h - pad} Z`);
  return parts.join(' ');
}

export default function SalonHomeV2({ salon, salonId, tokens = [], barbers = [], goToTab, getAuthHeaders, handleCallToken, handleCompleteToken }) {
  const navigate = useNavigate();
  const auth = useAuth?.() || {};
  const { logout, hasModulePermission, salonUser } = auth;
  // RBAC gate: only users with staff.attendance may operate the Home
  // Staff Check-in chip. Users WITHOUT staff.view_all can only toggle
  // their own linked staff record (self check-in).
  const canToggleAttendance = typeof hasModulePermission === 'function'
    ? hasModulePermission('staff', 'attendance')
    : true;
  const canToggleOthers = typeof hasModulePermission === 'function'
    ? hasModulePermission('staff', 'view_all')
    : true;
  const ownStaffId = salonUser?.staffId || null;
  const [kpis, setKpis] = useState(null);
  const [filter, setFilter] = useState('today'); // today | yesterday | range
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [barberFilter, setBarberFilter] = useState('all');
  const [targetsBarberFilter, setTargetsBarberFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Send-booking-link chip state
  const [linkPhone, setLinkPhone] = useState('');
  const [linkType, setLinkType] = useState('book'); // book | home | menu
  const [custMenuOpen, setCustMenuOpen] = useState(false);
  const [custQuery, setCustQuery] = useState('');
  const [existingCustomers, setExistingCustomers] = useState([]);
  const [linkSending, setLinkSending] = useState(false);
  const [copyToast, setCopyToast] = useState('');
  const custMenuRef = useRef(null);

  // Drawers
  const [apptOpen, setApptOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  // Phase 1 — topbar compact-on-scroll; Phase 2 — mobile "More" sheet.
  const [topbarScrolled, setTopbarScrolled] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Allow any component (Shop, etc.) to open the orders drawer via a global event.
  useEffect(() => {
    const handler = () => setOrdersOpen(true);
    window.addEventListener('salon:open-orders-drawer', handler);
    return () => window.removeEventListener('salon:open-orders-drawer', handler);
  }, []);

  // Let any tab (e.g. Queue's "Add Booking") open the New Appointment drawer.
  useEffect(() => {
    const handler = () => setApptOpen(true);
    window.addEventListener('salon:open-new-appointment', handler);
    return () => window.removeEventListener('salon:open-new-appointment', handler);
  }, []);

  // Inject scoped stylesheet once.
  useEffect(() => {
    const id = 'shv2-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = HOME_V2_CSS;
    document.head.appendChild(el);
  }, []);

  // Close send-link customer picker on outside click
  useEffect(() => {
    const onDoc = (e) => {
      if (custMenuRef.current && !custMenuRef.current.contains(e.target)) setCustMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Load existing customers for the send-link picker (name + phone + photo + last visit)
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/customers?limit=2000`, { headers: getAuthHeaders() });
        const list = Array.isArray(res.data) ? res.data : (res.data?.customers || []);
        setExistingCustomers(list);
      } catch (_) { setExistingCustomers([]); }
    })();
  }, [salonId, getAuthHeaders]);

  // Filter customer list for the picker
  const filteredExistingCustomers = useMemo(() => {
    const q = (custQuery || '').trim().toLowerCase();
    if (!q) return existingCustomers.slice(0, 30);
    return existingCustomers.filter(c => (
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    )).slice(0, 30);
  }, [existingCustomers, custQuery]);

  // Fetch home KPIs whenever filter changes (drives EVERY metric).
  const fetchKpis = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const params = new URLSearchParams({ date_mode: filter });
      if (filter === 'range') {
        if (rangeFrom) params.set('date_from', rangeFrom);
        if (rangeTo)   params.set('date_to', rangeTo);
      }
      const res = await axios.get(`${API}/salons/${salonId}/home-kpis?${params.toString()}`, { headers });
      setKpis(res.data);
    } catch (e) {
      console.warn('home-kpis fetch failed', e);
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchKpis(); /* eslint-disable-line */ }, [filter, rangeFrom, rangeTo, salonId]);

  const P = kpis?.primary || {};
  const secondary = kpis?.secondary || {};
  const cust = kpis?.customer_count || { total: 0, by_source: { online:0, qr:0, owner:0, direct:0 } };
  const staffAtt = kpis?.staff_attendance || [];
  const mk = kpis?.marketing_perf || { sent:0, delivered_pct:0, click_pct:0, redeemed:0, revenue:0, campaigns:[], channels:{} };
  const links = kpis?.booking_links || {};
  const targets = kpis?.targets || {};
  const reviews = kpis?.reviews || { avg_rating: 0, total_reviews: 0, distribution: {} };
  const revenue7 = (kpis?.revenue_7d || []).map(r => r.total || 0);
  const busy = kpis?.busy_hours || {};
  const busyArr = Array.from({ length: 24 }, (_, h) => busy[String(h)] || 0);
  const paymentMix = kpis?.payment_mix || {};
  const topSvc = kpis?.top_services || [];
  const leaderboard = kpis?.staff_leaderboard || [];

  // Filter live queue by barber
  const activeQueue = useMemo(() => {
    const list = (tokens || []).filter(t => t.status && t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'skipped');
    return barberFilter === 'all' ? list : list.filter(t => t.barber_id === barberFilter);
  }, [tokens, barberFilter]);

  // Payment mix total & percent
  const payMixSum = Object.values(paymentMix).reduce((a, b) => a + Number(b || 0), 0);

  // Leaderboard barber filter for Targets
  const targetsBarber = useMemo(() => {
    if (targetsBarberFilter === 'all') return null;
    return leaderboard.find(l => l.barber_id === targetsBarberFilter) || null;
  }, [targetsBarberFilter, leaderboard]);

  // ---- Handlers ----
  const goRail = (item) => navigate(item.route);

  const sendBookingLink = async () => {
    const phoneOk = (linkPhone || '').replace(/\D/g, '').length >= 10;
    if (!phoneOk) { toast.error('Enter a 10-digit mobile'); return; }
    setLinkSending(true);
    try {
      const res = await axios.post(`${API}/salons/${salonId}/send-booking-link`,
        { phone: linkPhone, link_type: linkType, save_as_lead: true },
        { headers: getAuthHeaders() },
      );
      if (res.data?.delivery_status === 'sent') {
        toast.success(`Sent ${linkType === 'home' ? 'salon homepage' : linkType === 'menu' ? 'menu' : 'booking'} link`);
        setLinkPhone('');
      } else {
        toast.warning(`Sent (delivery status: ${res.data?.delivery_status || 'unknown'})`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to send link');
    } finally { setLinkSending(false); }
  };

  const copyLink = async () => {
    const url = links?.[`${linkType}_url`] || '';
    if (!url) { toast.error('Link not ready yet'); return; }
    // Modern clipboard API when available, textarea fallback for older browsers / non-HTTPS contexts.
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        ok = true;
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch { ok = false; }
    if (ok) {
      setCopyToast('✓ Copied!');
      setTimeout(() => setCopyToast(''), 1800);
    } else {
      // Ultimate fallback — show URL so user can copy manually.
      setCopyToast('Copy failed');
      try { window.prompt('Copy this link:', url); } catch (_) { /* noop */ }
      setTimeout(() => setCopyToast(''), 2200);
    }
  };

  // Staff attendance toggle
  const toggleAttendance = async (row) => {
    const action = row.status === 'in' ? 'out' : 'in';
    // Client-side RBAC — mirrors backend enforcement so the UX matches.
    if (!canToggleAttendance) {
      toast.error("You don't have permission to check in/out staff");
      return;
    }
    if (!canToggleOthers && ownStaffId && row.barber_id !== ownStaffId) {
      toast.error('You can only check in/out your own attendance');
      return;
    }
    try {
      await axios.post(`${API}/salons/${salonId}/home/staff-attendance/toggle`,
        { barber_id: row.barber_id, action },
        { headers: getAuthHeaders() },
      );
      fetchKpis();
      toast.success(`${row.name} checked ${action === 'in' ? 'in' : 'out'}`);
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Attendance update failed';
      toast.error(detail);
    }
  };

  // Trends (period-over-period)
  const trendPill = (val, ok) => (
    <div className={`trend ${ok ? 'up' : val === 0 ? 'flat' : 'down'}`}>{ok ? '▲' : '▼'} {val}%</div>
  );

  return (
    <div className="shv2">
      {/* ===== RAIL ===== */}
      <aside className="rail">
        <SalonLogoControl
          salonId={salonId}
          salon={salon}
          getAuthHeaders={getAuthHeaders}
          onLogoChanged={() => { /* parent refreshes via next tab open */ }}
          onClick={() => navigate('/salon/dashboard?tab=home')}
        />
        <nav className="rail__nav">
          {RAIL_ITEMS.map((it, idx) => (
            <button key={it.id} className="navitem" onClick={() => goRail(it)} title={it.label}>
              {it.id === 'queue' && <I.cal />}
              {it.id === 'staff' && <I.users />}
              {it.id === 'services' && <I.scissors />}
              {it.id === 'reports' && <I.chart />}
              {it.id === 'customer-master' && <I.guestAdd />}
              {it.id === 'marketplace' && <I.cart />}
              {it.id === 'inventory' && <I.tag />}
              {it.id === 'marketing' && <I.send />}
              {it.id === 'salon' && <I.gear />}
              <span>{it.label}</span>
            </button>
          ))}
          <button
            className="navitem navitem--exit"
            onClick={() => { try { logout?.(); } catch (_) { /* ignore */ } navigate('/'); }}
            title="Logout"
            data-testid="rail-exit-btn"
          >
            <I.rotate /><span>Exit</span>
          </button>
        </nav>
      </aside>

      {/* ===== RIBBON ===== */}
      <aside className="ribbon">
        <button className="ribbon__btn ribbon__cta" data-tip="New Appointment" onClick={() => setApptOpen(true)}><I.plus /></button>
        <button className="ribbon__btn" data-tip="Add Guest" onClick={() => setGuestOpen(true)}><I.guestAdd /></button>
        <button className="ribbon__btn" data-tip="Retail Sale" onClick={() => navigate('/salon/dashboard?tab=inventory')}><I.cart /></button>
        <button
          className="ribbon__btn"
          data-tip="Shop Orders"
          data-testid="ribbon-orders-btn"
          onClick={() => setOrdersOpen(true)}
        ><I.truck /></button>
        <div className="ribbon__sep" />
        <button className="ribbon__btn" data-tip="Messages" data-testid="ribbon-messages-btn" onClick={() => setMessagesOpen(true)}>
          {mk.sent > 0 && <span className="dot">{Math.min(99, mk.sent)}</span>}
          <I.chat />
        </button>
        <button
          className="ribbon__btn"
          data-tip="Notifications"
          data-testid="ribbon-notif-btn"
          onClick={() => setNotifOpen(true)}
        >
          <I.bell />
          {notifCount > 0 && (
            <span className="dot">{notifCount > 9 ? '9+' : notifCount}</span>
          )}
        </button>
        <div className="ribbon__sep" />
        <button className="ribbon__btn" data-tip="Help" data-testid="ribbon-help-btn"
                onClick={() => {
                  const msg = encodeURIComponent("Hi, I need help with SalonHub.");
                  window.open(`https://wa.me/917503070727?text=${msg}`, '_blank', 'noopener,noreferrer');
                }}>
          <I.help />
        </button>
      </aside>

      {/* ===== MAIN ===== */}
      <main className="main" onScroll={(e) => setTopbarScrolled(e.currentTarget.scrollTop > 40)}>
        <header className={`topbar ${topbarScrolled ? 'is-scrolled' : ''}`}>
          <div className="brand">
            <div className="brand__ic"><I.scissors /></div>
            <div>
              <h1>Salon Dashboard</h1>
              <p>{salon?.salon_name || 'Your Salon'}</p>
            </div>
          </div>
          <div className="topbar__spacer" />
          <div className="searchbox" style={{ maxWidth: 460, padding: 0, background: 'transparent', border: 'none' }}>
            <GlobalSearchDropdown salonId={salonId} getAuthHeaders={getAuthHeaders} />
          </div>
          <div className="branch"><I.branch /> {salon?.city || 'Main Branch'}</div>
        </header>

        <div className="content">
          {/* Greeting + filter */}
          <div className="greet">
            <div>
              <h2>{greetTime()}, <b>{salon?.salon_name || 'The Salon'}</b></h2>
              <p className="date">{dateLabel(new Date().toISOString())}</p>
            </div>
            <div className="greet__right">
              <div className="seg">
                {['today', 'yesterday', 'range'].map(m => (
                  <button key={m} className={filter === m ? 'on' : ''} onClick={() => setFilter(m)}>
                    {m === 'today' ? 'Today' : m === 'yesterday' ? 'Yesterday' : 'Range'}
                  </button>
                ))}
              </div>
              {filter === 'range' && (
                <div className="range-picker">
                  <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} />
                  <span>→</span>
                  <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} />
                </div>
              )}
              <div className="live"><span className="pulse" /> LIVE</div>
              <button className="ribbon__btn" style={{ background: '#F1EEFF', color: '#6C4FE0', width: 36, height: 36 }} onClick={fetchKpis} title="Refresh">
                <I.refresh />
              </button>
            </div>
          </div>

          {/* KPI GRID — 5 cols × 2 rows with 2×2 queue at right */}
          <div className="kgrid">
            {/* Row 1: Total Sales | Avg Ticket | No-Show | Queue (2x2) */}
            <div className="kpi click" onClick={() => goToTab?.('financials')}>
              <div className="kpi__top">
                <div className="chip amber"><I.rupee /></div>
                {P.today_sales > 0 && trendPill(0, true)}
              </div>
              <div className="kpi__val">{fmtRupee(P.today_sales)}</div>
              <div className="kpi__lbl">Total Sales</div>
            </div>
            <div className="kpi click" onClick={() => goToTab?.('analytics')}>
              <div className="kpi__top"><div className="chip teal"><I.ticket /></div></div>
              <div className="kpi__val">{fmtRupee(P.avg_ticket)}</div>
              <div className="kpi__lbl">Avg Ticket</div>
            </div>
            <div className="kpi click">
              <div className="kpi__top"><div className="chip rose"><I.ghost /></div></div>
              <div className="kpi__val">{pct(P.no_show_rate)}</div>
              <div className="kpi__lbl">No-Show Rate</div>
            </div>

            {/* Queue (spans 2 cols × 2 rows) */}
            <div className="queue">
              <div className="queue__h">
                <div className="t"><I.clock /> Upcoming Queue</div>
                <div className="queue__ctrls">
                  <select value={barberFilter} onChange={e => setBarberFilter(e.target.value)}>
                    <option value="all">All staff</option>
                    {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <a onClick={() => goToTab?.('queue')}>View all →</a>
                </div>
              </div>
              <div className="qlist">
                {activeQueue.length === 0 && (
                  <div className="q-empty">
                    <div className="ring"><I.check /></div>
                    <div>Queue is clear</div>
                  </div>
                )}
                {activeQueue.slice(0, 6).map((t, i) => (
                  <div key={t.id || i} className="q-row">
                    <div className="q-pos">{i + 1}</div>
                    <div className="q-info">
                      <b>{t.customer_name || 'Guest'}</b>
                      <span>{(t.selected_services?.length || 0)} services · {t.barber_name || 'Any'}</span>
                    </div>
                    <div className="q-wait">{t.status === 'serving' ? 'Serving' : `~${(t.estimated_wait_minutes || 5)} min`}</div>
                    <div className="q-acts">
                      <button className="q-actbtn call" title="Call" onClick={() => handleCallToken?.(t)}><I.phone /></button>
                      <button className="q-actbtn done" title="Mark complete" onClick={() => handleCompleteToken?.(t)}><I.check /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 2: Rebooking | Customer Count (bar) | Staff Check-in | (queue continues) */}
            <div className="kpi click">
              <div className="kpi__top"><div className="chip violet"><I.rotate /></div></div>
              <div className="kpi__val">{pct(P.rebooking_rate)}</div>
              <div className="kpi__lbl">Rebooking Rate</div>
            </div>

            {/* Customer Count bar chip */}
            <div className="kpi">
              <div className="kpi__top">
                <div className="chip sky"><I.users /></div>
                <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 20 }}>{cust.total}</div>
              </div>
              <div className="cbars">
                {['online', 'qr', 'owner', 'direct'].map(k => {
                  const v = cust.by_source[k] || 0;
                  const max = Math.max(1, ...Object.values(cust.by_source));
                  return (
                    <div key={k} className="cbar">
                      <div className="b" style={{ height: `${(v / max) * 100}%`, background: SOURCE_COLORS[k] }} />
                      <div className="c">{v}</div>
                    </div>
                  );
                })}
              </div>
              <div className="cleg">
                {Object.keys(SOURCE_LABELS).map(k => (
                  <span key={k}><i style={{ background: SOURCE_COLORS[k] }} /> {SOURCE_LABELS[k]}</span>
                ))}
              </div>
            </div>

            {/* Staff Check-in chip — RBAC: hide entirely for users w/o staff.attendance;
                show only own row for users w/o staff.view_all. */}
            {canToggleAttendance && (
            <div className="kpi" style={{ padding: '14px 16px' }}>
              <div className="schead">
                <div className="lab"><I.users /> Staff Check-in</div>
                <div className="sum">
                  {staffAtt.filter(a => a.status === 'in').length} in · {staffAtt.filter(a => a.status === 'late').length} late
                </div>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 92 }}>
                {(() => {
                  const rows = canToggleOthers
                    ? staffAtt.slice(0, 3)
                    : staffAtt.filter(a => a.barber_id === ownStaffId);
                  if (rows.length === 0) {
                    return <div style={{ fontSize: 11, color: '#7C8092' }}>
                      {canToggleOthers ? 'No staff yet' : 'No linked staff profile'}
                    </div>;
                  }
                  return rows.map(a => (
                    <div key={a.barber_id} className="sc-row">
                      <div className="av" style={{ background: '#6C4FE0' }}>{(a.name || 'S').slice(0, 1).toUpperCase()}</div>
                      <div className="nm">{a.name}</div>
                      <span className={`st ${a.status}`}>{a.status}</span>
                      <button
                        className={`sc-btn ${a.status === 'in' ? 'out' : ''}`}
                        onClick={() => toggleAttendance(a)}
                        data-testid={`home-attendance-toggle-${a.barber_id}`}
                      >
                        {a.status === 'in' ? 'Out' : 'In'}
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </div>
            )}
          </div>

          {/* SECONDARY STRIP */}
          <div className="strip">
            <div className="mini">
              <div className="chip amber"><I.cal /></div>
              <div><b>{secondary.appointments_count || 0}</b><span>Appointments</span></div>
            </div>
            <div className="mini">
              <div className="chip teal"><I.send /></div>
              <div><b>{mk.sent || 0}</b><span>Reminders Sent</span></div>
            </div>
            <div className="mini">
              <div className="chip rose"><I.clock /></div>
              <div><b>{secondary.waitlist_count || 0}</b><span>Waitlist</span></div>
            </div>

            {/* Send booking link — wider chip with 3 link-type tabs + customer picker */}
            <div className="wacard">
              <div className="wah">
                <div className="l">
                  <div className="wic"><I.wa /></div>
                  <span>Send booking link (WhatsApp)</span>
                </div>
                <div className="link-seg">
                  {[
                    { id: 'book', label: 'Booking' },
                    { id: 'home', label: 'Homepage' },
                    { id: 'menu', label: 'Menu' },
                  ].map(o => (
                    <button key={o.id} className={linkType === o.id ? 'on' : ''} onClick={() => setLinkType(o.id)}>{o.label}</button>
                  ))}
                </div>
              </div>
              <div className="wa-input">
                <div className="phone-wrap" ref={custMenuRef}>
                  <input
                    placeholder="Enter mobile or pick a guest"
                    value={linkPhone}
                    onChange={e => { setLinkPhone(e.target.value); }}
                    onFocus={() => { /* no auto-open — arrow controls list */ }}
                  />
                  <button className="cust-drop" onClick={() => setCustMenuOpen(v => !v)} title="Pick from existing guests">
                    <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {custMenuOpen && (
                    <div className="cust-menu">
                      <div className="cs">
                        <input autoFocus placeholder="Search name or number…" value={custQuery} onChange={e => setCustQuery(e.target.value)} />
                      </div>
                      {filteredExistingCustomers.length === 0 && <div className="empty">No matching guests</div>}
                      {filteredExistingCustomers.map((c) => {
                        const initial = ((c.name || 'G')[0] || 'G').toUpperCase();
                        const lv = c.last_visit ? new Date(c.last_visit).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
                        return (
                          <div key={(c.id || '') + c.phone} className="cust-row" onClick={() => {
                            setLinkPhone((c.phone || '').replace(/^\+?91/, ''));
                            setCustMenuOpen(false); setCustQuery('');
                          }}>
                            <div className="av" style={c.photo_url ? { backgroundImage: `url(${c.photo_url})` } : {}}>
                              {!c.photo_url && initial}
                            </div>
                            <div className="info">
                              <b>{c.name || 'Unknown'}</b>
                              <span>{c.phone || 'No phone'}</span>
                            </div>
                            <div className="lv"><small>Last visit</small>{lv}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button className="wa-send" onClick={sendBookingLink} disabled={linkSending}>
                  <I.send /> {linkSending ? '…' : 'Send'}
                </button>
                <button className={`wa-copy ${copyToast.startsWith('✓') ? 'copied' : ''}`} onClick={copyLink} title={`Copy ${linkType} link`}>
                  {copyToast.startsWith('✓')
                    ? (<svg viewBox="0 0 24 24" style={{width:14,height:14,fill:'none',stroke:'currentColor',strokeWidth:2.5,strokeLinecap:'round',strokeLinejoin:'round'}}><polyline points="20 6 9 17 4 12"/></svg>)
                    : (<I.copy />)}
                </button>
              </div>
              {copyToast && (
                <div className={`copy-flash ${copyToast.startsWith('✓') ? 'ok' : 'err'}`}>{copyToast}</div>
              )}
            </div>
          </div>

          {/* ROW A — Marketing + Leaderboard */}
          <div className="row a">
            <div className="card">
              <div className="card__h">
                <div className="t"><I.send /> Marketing Performance</div>
                <a onClick={() => navigate('/salon/dashboard?tab=marketing')}>Open marketing →</a>
              </div>
              <div className="mk-stats">
                <div className="mk-stat"><b>{mk.sent || 0}</b><span>Messages sent</span></div>
                <div className="mk-stat"><b>{pct(mk.delivered_pct)}</b><span>Delivered</span></div>
                <div className="mk-stat"><b>{pct(mk.click_pct)}</b><span>Click rate</span></div>
                <div className="mk-stat"><b>{fmtRupee(mk.revenue)}</b><span>Attributed revenue · {mk.redeemed || 0} redemptions</span></div>
              </div>
              <div className="mk-camp">
                {(mk.campaigns || []).slice(0, 4).map(c => (
                  <div key={c.id} className="mk-c">
                    <div className="ci" style={{ background: c.channel?.toLowerCase() === 'sms' ? '#E9F2FD' : c.channel?.toLowerCase() === 'email' ? '#FDF3E4' : '#E7F9EF', color: c.channel?.toLowerCase() === 'sms' ? '#3E93E8' : c.channel?.toLowerCase() === 'email' ? '#E8952B' : '#25D366' }}>
                      {c.channel?.toLowerCase() === 'sms' ? <I.chat /> : c.channel?.toLowerCase() === 'email' ? <I.send /> : <I.wa />}
                    </div>
                    <div className="cn"><b>{c.name || 'Campaign'}</b><span>{c.channel} · {c.sent} sent · {c.redeemed} redeemed</span></div>
                    <div className="cv"><b>{fmtRupee(c.revenue)}</b><span>revenue</span></div>
                  </div>
                ))}
                {(mk.campaigns || []).length === 0 && <div style={{ fontSize: 12.5, color: '#7C8092', padding: 12 }}>No campaigns yet. Send your first WhatsApp campaign from the Marketing tab.</div>}
              </div>
              {Object.keys(mk.channels || {}).length > 0 && (
                <div className="mk-chan">
                  <div className="cl">
                    <span>Channel mix</span>
                    <span>{Object.entries(mk.channels).map(([k, v]) => `${k} ${Math.round(v * 100 / (mk.sent || 1))}%`).join(' · ')}</span>
                  </div>
                  <div className="mk-chan-bar">
                    {Object.entries(mk.channels).map(([k, v]) => (
                      <i key={k} style={{
                        width: `${(v * 100 / (mk.sent || 1)).toFixed(1)}%`,
                        background: k.toLowerCase().startsWith('w') ? '#25D366' : k.toLowerCase().startsWith('s') ? '#3E93E8' : '#E8952B',
                      }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="card">
              <div className="card__h"><div className="t"><I.trophy /> Staff Leaderboard</div></div>
              <div>
                {leaderboard.length === 0 && <div style={{ fontSize: 12.5, color: '#7C8092', padding: 8 }}>No completed services yet.</div>}
                {leaderboard.slice(0, 6).map((r, i) => (
                  <div key={r.barber_id} className="lb__row">
                    <div className="rank">{i + 1}</div>
                    <div className="nm">{r.barber_name}</div>
                    <div className="amt">{fmtRupee(r.sales)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ROW B — Targets + Reviews + Payment mix */}
          <div className="row b">
            <div className="card">
              <div className="card__h">
                <div className="t"><I.target /> Targets</div>
                <select value={targetsBarberFilter} onChange={e => setTargetsBarberFilter(e.target.value)}>
                  <option value="all">Overall salon</option>
                  {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                {targetsBarber ? (
                  <>
                    <div className="tgt__row">
                      <div className="tl"><span>{targetsBarber.barber_name} · Sales</span><b>{fmtRupee(targetsBarber.sales)}</b></div>
                      <div className="bar"><i style={{ width: `${Math.min(100, (targetsBarber.sales / (targets.daily_target || 1)) * 100)}%` }} /></div>
                    </div>
                    <div className="tgt__row">
                      <div className="tl"><span>Bookings</span><b>{targetsBarber.bookings || 0}</b></div>
                      <div className="bar"><i style={{ width: `${Math.min(100, ((targetsBarber.bookings || 0) / 10) * 100)}%` }} /></div>
                    </div>
                    <div className="tgt__row">
                      <div className="tl"><span>Rebook rate</span><b>{pct(targetsBarber.rebook_pct)}</b></div>
                      <div className="bar"><i style={{ width: `${Math.min(100, targetsBarber.rebook_pct || 0)}%` }} /></div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="tgt__row">
                      <div className="tl"><span>Daily · {shortMoney(targets.daily_target)}</span><b>{shortMoney(targets.daily_actual)}</b></div>
                      <div className="bar"><i style={{ width: `${Math.min(100, (targets.daily_actual / (targets.daily_target || 1)) * 100)}%` }} /></div>
                    </div>
                    <div className="tgt__row">
                      <div className="tl"><span>Monthly · {shortMoney(targets.monthly_target)}</span><b>{shortMoney(targets.monthly_actual)}</b></div>
                      <div className="bar"><i style={{ width: `${Math.min(100, (targets.monthly_actual / (targets.monthly_target || 1)) * 100)}%` }} /></div>
                    </div>
                    <div className="tgt__row">
                      <div className="tl"><span>Memberships · {targets.membership_target || 0}</span><b>{targets.membership_actual || 0}</b></div>
                      <div className="bar"><i style={{ width: `${Math.min(100, ((targets.membership_actual || 0) / (targets.membership_target || 1)) * 100)}%` }} /></div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="card">
              <div className="card__h"><div className="t"><I.star /> Reviews</div></div>
              <div className="rev">
                <div className="rev__score">
                  <b>{Number(reviews.avg_rating || 0).toFixed(1)}</b>
                  <div className="stars">★★★★★</div>
                  <small>{reviews.total_reviews || 0} reviews</small>
                </div>
                <div className="rev__bars">
                  {[5, 4, 3, 2, 1].map(k => {
                    const n = Number((reviews.distribution || {})[String(k)] || 0);
                    const total = reviews.total_reviews || 1;
                    return (
                      <div key={k} className="rev__bar">
                        <span className="lab">{k}★</span>
                        <div className="bar"><i style={{ width: `${(n / total) * 100}%` }} /></div>
                        <span className="n">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card__h"><div className="t"><I.card /> Payment Mix</div></div>
              <div>
                {Object.keys(paymentMix).length === 0 && <div style={{ fontSize: 12.5, color: '#7C8092' }}>No payments yet.</div>}
                {Object.entries(paymentMix).map(([k, v]) => (
                  <div key={k} className="pay__row">
                    <div className="pay__dot" style={{ background: PAY_COLORS[k] || '#9A9EAE' }} />
                    <div className="pl">{k}</div>
                    <div className="pv">{fmtRupee(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ROW C — Revenue + Top Services + Busy Hours */}
          <div className="row c">
            <div className="card">
              <div className="card__h"><div className="t"><I.chart /> Revenue (last 7d)</div></div>
              <div className="stat-big">{fmtRupee(revenue7.reduce((a, b) => a + b, 0))}</div>
              <svg className="spark" viewBox="0 0 240 60" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="rgV2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#6C4FE0" stopOpacity=".28" />
                    <stop offset="1" stopColor="#6C4FE0" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={sparkAreaPath(revenue7)} fill="url(#rgV2)" />
                <polyline points={sparkPoints(revenue7)} fill="none" stroke="#6C4FE0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="foot-note">Peak {shortMoney(Math.max(0, ...revenue7))}</p>
            </div>
            <div className="card">
              <div className="card__h"><div className="t"><I.tag /> Top Services</div></div>
              <div>
                {topSvc.length === 0 && <div style={{ fontSize: 12.5, color: '#7C8092' }}>No completed services yet.</div>}
                {topSvc.map((s, i) => (
                  <div key={s.service_id || i} className="topsvc__row">
                    <div className="n">{i + 1}</div>
                    <div className="nm">{s.service_name}</div>
                    <div className="ct">{s.count}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card__h"><div className="t"><I.clock /> Busy Hours</div></div>
              <svg className="spark" viewBox="0 0 240 60" preserveAspectRatio="none">
                <line x1="0" y1="54" x2="240" y2="54" stroke="#ECECF3" strokeWidth="1.5" strokeDasharray="3 4" />
                <polyline points={sparkPoints(busyArr)} fill="none" stroke="#3E93E8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="foot-note">
                Peak around {(() => {
                  let peak = 0, hr = 12;
                  busyArr.forEach((v, h) => { if (v > peak) { peak = v; hr = h; } });
                  return `${String(hr).padStart(2, '0')}:00`;
                })()}
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ===== MOBILE BOTTOM NAV (Phase 2) — shown only ≤820px ===== */}
      <nav className="mobnav" data-testid="mobile-bottom-nav">
        <button className="mobnav__item" onClick={() => goToTab?.('home')} title="Home">
          <I.home /><span>Home</span>
        </button>
        <button className="mobnav__item" onClick={() => goRail({ route: '/salon/dashboard?tab=queue' })} title="Queue">
          <I.cal /><span>Queue</span>
        </button>
        <button className="mobnav__cta" onClick={() => setApptOpen(true)} title="New appointment" data-testid="mobnav-new-appt">
          <I.plus />
        </button>
        <button className="mobnav__item" onClick={() => goRail({ route: '/salon/dashboard?tab=customer-master' })} title="Guests">
          <I.guestAdd /><span>Guests</span>
        </button>
        <button className="mobnav__item" onClick={() => setMoreOpen(true)} title="More" data-testid="mobnav-more">
          <I.gear /><span>More</span>
        </button>
      </nav>

      {/* Mobile "More" bottom sheet */}
      {moreOpen && (
        <div className="mobsheet-back" onClick={() => setMoreOpen(false)} data-testid="mobsheet-backdrop">
          <div className="mobsheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobsheet__grip" />
            <div className="mobsheet__grid">
              {RAIL_ITEMS.filter((it) => !['queue', 'customer-master'].includes(it.id)).map((it) => (
                <button key={it.id} className="mobsheet__cell" onClick={() => { setMoreOpen(false); goRail(it); }}>
                  <span className="mobsheet__ic">
                    {it.id === 'marketing' && <I.send />}
                    {it.id === 'inventory' && <I.tag />}
                    {it.id === 'marketplace' && <I.cart />}
                    {it.id === 'staff' && <I.users />}
                    {it.id === 'services' && <I.scissors />}
                    {it.id === 'reports' && <I.chart />}
                    {it.id === 'salon' && <I.gear />}
                  </span>
                  <span>{it.label}</span>
                </button>
              ))}
              <button className="mobsheet__cell" onClick={() => { setMoreOpen(false); setGuestOpen(true); }}>
                <span className="mobsheet__ic"><I.guestAdd /></span><span>Add guest</span>
              </button>
              <button className="mobsheet__cell" onClick={() => { setMoreOpen(false); setNotifOpen(true); }}>
                <span className="mobsheet__ic"><I.bell /></span><span>Notifications</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawers */}
      <AppointmentDrawer
        open={apptOpen}
        onClose={() => setApptOpen(false)}
        onSaved={() => { setApptOpen(false); fetchKpis(); toast.success('Appointment saved'); }}
        salonId={salonId}
        getAuthHeaders={getAuthHeaders}
        defaultMode="queue"
      />
      <CustomerDrawer
        open={guestOpen}
        onClose={() => setGuestOpen(false)}
        onSaved={() => { setGuestOpen(false); fetchKpis(); toast.success('Guest saved'); }}
        salonId={salonId}
        getAuthHeaders={getAuthHeaders}
        source="owner"
      />

      {/* Notifications side-drawer — opens from ribbon Bell */}
      <NotificationsDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        salonId={salonId}
        onCountUpdate={setNotifCount}
      />

      {/* Orders side-drawer — opens from ribbon Truck icon (or the CustomEvent
          dispatched by ShopModule). Shows recent shop orders with quick actions
          and a "View all orders" button that jumps to /?tab=shop&view=orders. */}
      <OrdersDrawer
        open={ordersOpen}
        onClose={() => setOrdersOpen(false)}
        getAuthHeaders={getAuthHeaders}
      />

      <MessagesDrawer
        open={messagesOpen}
        onClose={() => setMessagesOpen(false)}
        salonId={salonId}
        getAuthHeaders={getAuthHeaders}
      />
    </div>
  );
}
