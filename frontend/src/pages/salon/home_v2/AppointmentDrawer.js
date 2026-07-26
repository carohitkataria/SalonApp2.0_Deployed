/**
 * New Appointment drawer — 3-column layout (redesign v3).
 *
 * LEFT   : booking modes + inline schedule, guest (search + suggestions),
 *          Services & Membership (merged, searchable, category bullets),
 *          Products (collapsible chip list).
 * MIDDLE : Barber rail — PINK staff theme, manual selection, scrollable.
 * RIGHT  : Guest details card (with pencil edit + view-full CTA) +
 *          Billing summary — per-service barber override, coupon,
 *          Discount % + flat ₹, tip, split multi-mode payment,
 *          editable final amount with Σ recalc.
 *
 * Rules:
 *   • Stylist optional for walk-in & schedule; required only for direct invoice.
 *   • Payment is single-mode by default. Tapping a second mode opens the
 *     split rows with per-mode amount + `= due` shortcut and an allocation meter.
 *   • Pencil edit lives on the Guest details CARD (not on the search box).
 *     Clicking it opens the CustomerDrawer stacked over this drawer.
 *   • "View full details" opens the guest profile as a stacked drawer.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import CustomerDrawer from './CustomerDrawer';
import GuestProfileModal from './GuestProfileModal';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/* ----------- helpers ----------- */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function currentSlot() {
  const h = new Date().getHours();
  if (h < 13) return 'Morning';
  if (h < 17) return 'Noon';
  return 'Evening';
}
function fmtDate(iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-IN', opts); } catch { return iso; }
}
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/* ----------- category palette ----------- */
const CAT_COLORS = {
  "Men's Grooming": { cc: '#3E93E8', bg: '#E9F2FD' },
  'Hair Treatments': { cc: '#6C4FE0', bg: '#EFEBFE' },
  'Facial': { cc: '#2FA96A', bg: '#E7F6ED' },
  'Massage & Spa': { cc: '#12A594', bg: '#E4F6F3' },
  'Manicure & Pedicure': { cc: '#E45C86', bg: '#FCEAF1' },
  'Waxing & Threading': { cc: '#E8952B', bg: '#FDF3E4' },
  'Nails': { cc: '#E45C86', bg: '#FCEAF1' },
  'Hair': { cc: '#6C4FE0', bg: '#EFEBFE' },
  'Skin': { cc: '#2FA96A', bg: '#E7F6ED' },
  'General': { cc: '#5D6475', bg: '#EEF0F4' },
};
const catOf = (name) => CAT_COLORS[name] || { cc: '#5D6475', bg: '#EEF0F4' };
const TIER_COLORS = {
  Diamond: { tc: '#1FA5C0', bg: '#E4F6FA' },
  Gold: { tc: '#C9992B', bg: '#FBF3DF' },
  Silver: { tc: '#6E7788', bg: '#EEF0F4' },
  Custom: { tc: '#6C4FE0', bg: '#EFEBFE' },
};
const tierOf = (t) => TIER_COLORS[t] || TIER_COLORS.Custom;

const SHIFTS = [
  { id: 'Morning', hint: '9AM–1PM' },
  { id: 'Noon', hint: '1PM–5PM' },
  { id: 'Evening', hint: '5PM–9PM' },
];
const PAY_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', wallet: 'Wallet' };
const PAY_MODES = ['cash', 'upi', 'card', 'wallet'];

/* Safe API error → string (used for save/edit toasts). */
const formatApiError = (err, fallback = 'Save failed') => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => {
      if (typeof d === 'string') return d;
      const f = Array.isArray(d?.loc) ? d.loc.filter((x) => x !== 'body').join('.') : '';
      return f ? `${f}: ${d?.msg || 'Invalid value'}` : (d?.msg || 'Invalid value');
    }).join(', ');
  }
  if (detail && typeof detail === 'object') return detail.msg || fallback;
  return err?.message || fallback;
};

export default function AppointmentDrawer({
  open, onClose, onSaved, getAuthHeaders, salonId, defaultMode = 'queue',
  presetGuest = null,
}) {
  /* ----------- catalogs ----------- */
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [memberships, setMemberships] = useState([]);

  /* ----------- booking state ----------- */
  const [mode, setMode] = useState(defaultMode);
  const [date, setDate] = useState(todayISO());
  const [slot, setSlot] = useState(currentSlot());

  /* guest */
  const [customer, setCustomer] = useState(null);
  const [custProfile, setCustProfile] = useState(null);
  const [custSearch, setCustSearch] = useState('');
  const [showSug, setShowSug] = useState(false);

  /* catalog */
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const [selectedSvc, setSelectedSvc] = useState([]);
  const [sellMembershipId, setSellMembershipId] = useState(null);
  const [selectedProd, setSelectedProd] = useState({});
  const [productsOpen, setProductsOpen] = useState(false);

  /* barber (global) + per-service overrides */
  const [staffId, setStaffId] = useState('');
  const [svcBarber, setSvcBarber] = useState({});  // service_id -> barber_id
  const [svcBarberManual, setSvcBarberManual] = useState(new Set());
  const [openPicker, setOpenPicker] = useState(null); // service_id whose picker is expanded

  /* billing */
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);   // ₹ amount from validated coupon
  const [couponInfo, setCouponInfo] = useState(null);        // validated coupon doc
  const [couponError, setCouponError] = useState('');        // "Invalid coupon code" etc.
  const [couponChecking, setCouponChecking] = useState(false);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAbs, setDiscountAbs] = useState(0);
  const [tip, setTip] = useState(0);
  const [finalOverride, setFinalOverride] = useState(null);

  /* payment — single-select by default (default UPI); "Split payment" toggle
     enables selecting multiple modes to split the bill. */
  const [paySel, setPaySel] = useState(() => new Set(['upi']));
  const [payAmt, setPayAmt] = useState({});
  const [multiPay, setMultiPay] = useState(false);

  /* nested drawers */
  const [subOpen, setSubOpen] = useState(false);      // add-new-guest
  const [editOpen, setEditOpen] = useState(false);    // edit-existing-guest
  const [profileOpen, setProfileOpen] = useState(false); // view-full-details

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  /* Refs so parent re-renders never wipe the form. */
  const authRef = useRef(getAuthHeaders);
  const salonRef = useRef(salonId);
  const modeRef = useRef(defaultMode);
  const presetGuestRef = useRef(presetGuest);
  useEffect(() => { authRef.current = getAuthHeaders; }, [getAuthHeaders]);
  useEffect(() => { salonRef.current = salonId; }, [salonId]);
  useEffect(() => { modeRef.current = defaultMode; }, [defaultMode]);
  useEffect(() => { presetGuestRef.current = presetGuest; }, [presetGuest]);

  /* Reset + reload ONLY on drawer open. */
  useEffect(() => {
    if (!open) return;
    setMode(modeRef.current || 'queue');
    setCustomer(null); setCustProfile(null); setCustSearch('');
    setSelectedSvc([]); setSellMembershipId(null); setSelectedProd({});
    setStaffId(''); setSvcBarber({}); setSvcBarberManual(new Set()); setOpenPicker(null);
    setDate(todayISO()); setSlot(currentSlot());
    setCouponCode(''); setCouponApplied(false); setDiscountPct(0); setDiscountAbs(0);
    setTip(0); setFinalOverride(null);
    setPaySel(new Set(['upi'])); setPayAmt({}); setMultiPay(false);
    setErrors({}); setCategory('all'); setQ(''); setProductsOpen(false);
    setShowSug(false); setSubOpen(false); setEditOpen(false); setProfileOpen(false);
    (async () => {
      try {
        const headers = authRef.current();
        const sid = salonRef.current;
        const [svcRes, brbRes, custRes, prodRes, memRes] = await Promise.all([
          axios.get(`${API}/salons/${sid}/services/enabled`, { headers })
            .catch(() => axios.get(`${API}/salons/${sid}/services/all`, { headers })),
          axios.get(`${API}/salons/${sid}/barbers`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${API}/salons/${sid}/customers?limit=2000`, { headers }).catch(() => ({ data: { customers: [] } })),
          axios.get(`${API}/salons/${sid}/inventory`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${API}/salons/${sid}/membership-plans`, { headers }).catch(() => ({ data: [] })),
        ]);
        setServices(Array.isArray(svcRes.data) ? svcRes.data : (svcRes.data?.services || []));
        setBarbers((Array.isArray(brbRes.data) ? brbRes.data : (brbRes.data?.barbers || [])).filter((b) => b.is_active !== false));
        setCustomers(Array.isArray(custRes.data) ? custRes.data : (custRes.data?.customers || []));
        setProducts(Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data?.items || []));
        setMemberships(Array.isArray(memRes.data) ? memRes.data : (memRes.data?.plans || []));
        // Phase 3.5 — preselect a guest passed in from the Guest drawer's "Book".
        const pg = presetGuestRef.current;
        if (pg && (pg.phone || pg.id)) {
          const list = Array.isArray(custRes.data) ? custRes.data : (custRes.data?.customers || []);
          const key = String(pg.phone || '').replace(/\D/g, '').slice(-10);
          const match = list.find((c) => String(c.phone || '').replace(/\D/g, '').endsWith(key)) || {
            id: pg.id, name: pg.name, phone: pg.phone, gender: pg.gender,
          };
          setCustomer(match);
          setCustSearch(match.name || match.phone || '');
          setShowSug(false);
          if (match.phone) fetchProfile(match.phone);
        }
      } catch (_) { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ----------- derived: catalog + billing ----------- */
  const categories = useMemo(() => {
    const set = new Set();
    services.forEach((s) => set.add(s.category || 'General'));
    return ['all', ...Array.from(set), 'mem'];
  }, [services]);

  const svcRows = useMemo(
    () => selectedSvc.map((id) => services.find((x) => x.id === id)).filter(Boolean),
    [selectedSvc, services],
  );
  const prodRows = useMemo(
    () => Object.entries(selectedProd)
      .map(([pid, qty]) => ({ p: products.find((x) => x.id === pid), qty }))
      .filter((r) => r.p && r.qty > 0),
    [selectedProd, products],
  );
  const membershipPlan = useMemo(
    () => memberships.find((m) => m.id === sellMembershipId) || null,
    [memberships, sellMembershipId],
  );

  const svcSub = svcRows.reduce((t, s) => t + Number(s.base_price || s.price || 0), 0);
  const prodSub = prodRows.reduce((t, r) => t + Number(r.p.retail_price || r.p.selling_price || 0) * r.qty, 0);
  const subtotal = svcSub + prodSub;
  const discountAmtPct = Math.round((subtotal * (Number(discountPct) || 0)) / 100);
  const totalDiscount = discountAmtPct + Number(discountAbs || 0) + Number(couponDiscount || 0);
  const membershipPrice = Number(membershipPlan?.price || membershipPlan?.amount || 0);
  const computedTotal = Math.max(0, subtotal - totalDiscount + Number(tip || 0) + membershipPrice);
  const payable = finalOverride != null ? Number(finalOverride) : computedTotal;
  const totalDurationMin = svcRows.reduce((t, s) => t + Number(s.default_duration || 30), 0);

  const filteredCatalog = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query) {
      const ms = services.filter((s) =>
        (s.service_name || s.name || '').toLowerCase().includes(query) ||
        (s.category || '').toLowerCase().includes(query));
      const mm = memberships.filter((m) =>
        (m.name || '').toLowerCase().includes(query) ||
        (m.tier || '').toLowerCase().includes(query));
      const mp = products.filter((p) =>
        (p.product_name || p.name || '').toLowerCase().includes(query));
      return { kind: 'search', services: ms, memberships: mm, products: mp };
    }
    if (category === 'mem') return { kind: 'mem', memberships };
    const list = category === 'all' ? services : services.filter((s) => (s.category || 'General') === category);
    return { kind: 'svc', services: list };
  }, [q, category, services, memberships, products]);

  const custSuggestions = useMemo(() => {
    const query = custSearch.trim().toLowerCase();
    if (!query) return [];
    return customers.filter((c) =>
      (c.name || '').toLowerCase().includes(query) ||
      (c.phone || '').includes(query)).slice(0, 8);
  }, [customers, custSearch]);

  /* ----------- actions ----------- */
  const toggleSvc = (id) => {
    setSelectedSvc((prev) => {
      if (prev.includes(id)) {
        // Also clean up per-service barber override.
        setSvcBarber((sb) => { const n = { ...sb }; delete n[id]; return n; });
        setSvcBarberManual((sm) => { const n = new Set(sm); n.delete(id); return n; });
        return prev.filter((x) => x !== id);
      }
      // Newly picked service inherits the current global barber (if any).
      if (staffId) setSvcBarber((sb) => ({ ...sb, [id]: staffId }));
      return [...prev, id];
    });
  };
  const toggleMembership = (id) => setSellMembershipId((prev) => prev === id ? null : id);
  const setProdQty = (id, qty) => setSelectedProd((prev) => {
    const n = { ...prev };
    if (qty <= 0) delete n[id]; else n[id] = qty;
    return n;
  });
  const bumpProd = (id, delta) => setProdQty(id, Math.max(0, (selectedProd[id] || 0) + delta));

  const pickStaff = (id) => {
    setStaffId((prev) => {
      const next = prev === id ? '' : id;
      // Push new global barber down into all non-overridden service rows.
      if (next) {
        setSvcBarber((sb) => {
          const n = { ...sb };
          selectedSvc.forEach((sid) => {
            if (!svcBarberManual.has(sid)) n[sid] = next;
          });
          return n;
        });
      }
      return next;
    });
  };
  const setSvcBarberFor = (sid, bid) => {
    setSvcBarber((sb) => ({ ...sb, [sid]: bid }));
    setSvcBarberManual((sm) => new Set(sm).add(sid));
    setOpenPicker(null);
  };

  /* guest actions */
  const fetchProfile = async (phone) => {
    if (!phone) { setCustProfile(null); return; }
    try {
      const res = await axios.get(
        `${API}/salons/${salonRef.current}/customers/profile?phone=${encodeURIComponent(phone)}`,
        { headers: authRef.current() },
      );
      setCustProfile(res.data || null);
    } catch (_) { setCustProfile(null); }
  };
  const chooseCustomer = (c) => {
    setCustomer(c); setCustSearch(c.name || c.phone || ''); setShowSug(false);
    if (c.preferred_barber_id && !staffId) pickStaff(c.preferred_barber_id);
    setErrors((e) => ({ ...e, customer: null }));
    fetchProfile(c.phone);
  };
  const onGuestInputChange = (v) => {
    setCustSearch(v);
    setShowSug(true);
    setCustomer(null); setCustProfile(null);
    // Duplicate-detection: 10-digit exact match auto-picks that guest.
    const digits = (v || '').replace(/\D/g, '');
    if (digits.length >= 10) {
      const key = digits.slice(-10);
      const match = customers.find((c) => (c.phone || '').replace(/\D/g, '').endsWith(key));
      if (match) chooseCustomer(match);
    }
  };
  const openNewGuest = () => {
    const digits = (custSearch || '').replace(/\D/g, '');
    if (digits.length >= 10) {
      const key = digits.slice(-10);
      const match = customers.find((c) => (c.phone || '').replace(/\D/g, '').endsWith(key));
      if (match) { chooseCustomer(match); return; }
    }
    setSubOpen(true);
  };

  /* payment actions */
  const togglePayMode = (m) => {
    // Single-select unless the "Split payment" toggle is on.
    if (!multiPay) {
      setPaySel(new Set([m]));
      setPayAmt({});
      return;
    }
    setPaySel((prev) => {
      const n = new Set(prev);
      if (n.has(m)) {
        if (n.size <= 1) return n; // keep at least one
        n.delete(m);
        setPayAmt((pa) => { const nn = { ...pa }; delete nn[m]; return nn; });
      } else {
        n.add(m);
      }
      return n;
    });
  };
  // Toggle split mode; when turning it OFF, collapse to a single selected mode.
  const toggleMultiPay = () => {
    setMultiPay((on) => {
      const next = !on;
      if (!next) {
        setPaySel((prev) => {
          const first = PAY_MODES.find((m) => prev.has(m)) || 'upi';
          return new Set([first]);
        });
        setPayAmt({});
      }
      return next;
    });
  };
  const paySelArr = PAY_MODES.filter((m) => paySel.has(m));
  const paySplitOn = paySelArr.length > 1;
  const paySingle = paySelArr[0] || 'cash';
  const allocatedTotal = paySelArr.reduce((t, m) => t + (Number(payAmt[m]) || 0), 0);
  const remaining = payable - allocatedTotal;
  const allocState = !paySplitOn ? 'ok'
    : Math.abs(remaining) < 0.5 ? 'ok'
    : remaining > 0 ? 'under' : 'over';

  const setPayAmount = (m, val) => {
    const num = val === '' ? 0 : Number(val);
    setPayAmt((pa) => ({ ...pa, [m]: isNaN(num) ? 0 : Math.max(0, num) }));
  };
  const applyDueTo = (m) => {
    const others = paySelArr.reduce((t, x) => x === m ? t : t + (Number(payAmt[x]) || 0), 0);
    const due = Math.max(0, Math.round((payable - others) * 100) / 100);
    setPayAmt((pa) => ({ ...pa, [m]: due }));
  };

  /* coupon — validate against the salon's real coupons (no more blind 10%) */
  const applyCoupon = async () => {
    const code = (couponCode || '').trim().toUpperCase();
    if (!code) { setCouponError('Enter a coupon code'); return; }
    setCouponChecking(true);
    setCouponError('');
    try {
      const headers = authRef.current();
      const sid = salonRef.current;
      const { data } = await axios.post(
        `${API}/salons/${sid}/coupons/validate`,
        { code, bill_amount: subtotal, service_ids: selectedSvc, customer_phone: customer?.phone || null },
        { headers },
      );
      if (data?.valid) {
        setCouponApplied(true);
        setCouponInfo(data.coupon || { code });
        setCouponDiscount(Math.round(Number(data.discount_amount) || 0));
        setCouponError('');
      } else {
        setCouponApplied(false); setCouponInfo(null); setCouponDiscount(0);
        setCouponError(data?.reason || 'Invalid coupon code');
      }
    } catch (err) {
      setCouponApplied(false); setCouponInfo(null); setCouponDiscount(0);
      setCouponError(err?.response?.data?.detail || err?.response?.data?.reason || 'Invalid coupon code');
    } finally {
      setCouponChecking(false);
    }
  };

  const clearCoupon = () => {
    setCouponApplied(false); setCouponInfo(null); setCouponDiscount(0);
    setCouponError(''); setCouponCode('');
  };

  // If the cart changes after applying, invalidate the coupon so the amount can't go stale.
  useEffect(() => {
    if (couponApplied) { setCouponApplied(false); setCouponInfo(null); setCouponDiscount(0); setCouponError('Cart changed — re-apply coupon'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const stylistRequired = mode === 'direct';
  const modeLabel = mode === 'schedule' ? 'Book appointment' : mode === 'queue' ? 'Add to queue' : 'Create invoice';

  const save = async () => {
    const errs = {};
    // Customer is OPTIONAL — a walk-in guest may not share a phone number.
    // A direct invoice / booking can proceed with a blank guest.
    if (!selectedSvc.length && !Object.keys(selectedProd).length && !sellMembershipId) {
      errs.svc = 'Pick at least one service, product or membership';
    }
    if (stylistRequired && !staffId) errs.staff = 'Stylist is mandatory to create an invoice';
    if (mode === 'schedule' && (!date || !slot)) errs.date = 'Date and slot required';
    // Wallet payment still needs a known customer with a wallet.
    if (paySel.has('wallet') && !customer?.phone) {
      errs.payment = 'Wallet payment needs a guest with a mobile number';
    }
    if (paySplitOn && payable > 0 && Math.abs(allocatedTotal - payable) >= 0.5) {
      errs.payment = allocatedTotal > payable
        ? `Over-allocated by ${money(allocatedTotal - payable)}`
        : `Short by ${money(payable - allocatedTotal)}`;
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      const headers = authRef.current();
      const sid = salonRef.current;
      const products_payload = Object.entries(selectedProd).map(([pid, qty]) => {
        const p = products.find((x) => x.id === pid);
        return {
          product_id: pid, name: p?.product_name || p?.name,
          qty: Number(qty), unit_price: Number(p?.retail_price || p?.selling_price || 0),
        };
      });
      const services_payload = selectedSvc.map((sid2) => ({
        service_id: sid2,
        barber_id: svcBarber[sid2] || staffId || null,
      }));

      const paymentPayload = paySplitOn
        ? {
            payment_mode: 'split',
            cash_amount: Number(payAmt.cash || 0),
            upi_amount: Number(payAmt.upi || 0),
            wallet_amount: Number(payAmt.wallet || 0),
            card_amount: Number(payAmt.card || 0),
            payments: paySelArr.filter((m) => Number(payAmt[m]) > 0).map((m) => ({ mode: m, amount: Number(payAmt[m]) })),
          }
        : { payment_mode: paySingle };

      const billingExtras = {
        coupon_code: couponApplied ? (couponCode || null) : null,
        discount_percent: Number(discountPct) || 0,
        discount_flat: Number(discountAbs) || 0,
        tip_amount: Number(tip) || 0,
        membership_plan_id: sellMembershipId || null,
        final_amount_override: finalOverride != null ? Number(finalOverride) : null,
      };

      if (mode === 'direct') {
        await axios.post(`${API}/salons/${sid}/direct-invoice`, {
          customer_name: customer?.name || 'Walk-in Guest', phone: customer?.phone || '', gender: customer?.gender || 'Men',
          barber_id: staffId,
          selected_services: selectedSvc,
          services_payload,
          selected_products: products_payload,
          ...paymentPayload,
          ...billingExtras,
          source: 'direct',
        }, { headers });
      } else {
        await axios.post(`${API}/salons/${sid}/salon-booking`, {
          customer_name: customer?.name || 'Walk-in Guest', phone: customer?.phone || '', gender: customer?.gender || 'Men',
          barber_id: staffId || 'any',
          selected_services: selectedSvc,
          services_payload,
          selected_products: products_payload,
          shift: mode === 'schedule' ? slot : currentSlot(),
          date: mode === 'schedule' ? date : todayISO(),
          start_time: null,
          ...paymentPayload,
          ...billingExtras,
          source: mode === 'queue' ? 'qr' : 'owner',
          booking_type: mode,
        }, { headers });
      }
      onSaved?.({ mode, total: payable });
      onClose?.();
    } catch (e) {
      setErrors({ save: formatApiError(e, 'Save failed') });
    } finally { setSaving(false); }
  };

  /* Guest details snapshot for the right card */
  const gd = custProfile || {};
  const preferredBarberName = (barbers.find((b) => b.id === gd.preferred_barber_id) || {}).name;
  const membershipLine = gd.membership_active ? (gd.membership_name || 'Active') : 'No membership';

  /* ============================================================ RENDER */
  return ReactDOM.createPortal(
    <>
      <div className={`shv2-overlay ${open ? 'open' : ''}`} onClick={onClose} style={{ zIndex: 9060 }} />
      <aside className={`shv2-drawer newapt ${open ? 'open' : ''}`} style={{ zIndex: 9070 }}>
        {/* header */}
        <div className="drawer__h">
          <div className="tt">
            <div className="ic">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div><h3>New Appointment</h3></div>
          </div>
          <button className="drawer__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="book-split">
          {/* ============================= LEFT ============================= */}
          <div className="book-left">
            {/* Modes */}
            <div className="block">
              <div className="mode-pick">
                <button className={`mode ${mode === 'queue' ? 'on' : ''}`} onClick={() => setMode('queue')}>
                  <div className="mi"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
                  <div><b>Walk-in</b><span>Add to queue now</span></div>
                </button>
                <button className={`mode ${mode === 'direct' ? 'on' : ''}`} onClick={() => setMode('direct')}>
                  <div className="mi"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
                  <div><b>Direct invoice</b><span>Walk-out billing</span></div>
                </button>
                <button className={`mode ${mode === 'schedule' ? 'on' : ''}`} onClick={() => setMode('schedule')}>
                  <div className="mi"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
                  <div><b>Schedule</b><span>Future date &amp; slot</span></div>
                </button>
              </div>
              {mode === 'schedule' && (
                <div className="sched show">
                  <div className="sf">
                    <label>Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="sf grow">
                    <label>Slot</label>
                    <div className="seg-pick">
                      {SHIFTS.map((s) => (
                        <button key={s.id} type="button" className={slot === s.id ? 'on' : ''} onClick={() => setSlot(s.id)}>
                          {s.id}<small>{s.hint}</small>
                        </button>
                      ))}
                    </div>
                    {errors.date && <span className="msg show">{errors.date}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Guest */}
            <div className="block guest">
              <div className="guest-lbl">
                <span>Guest</span>
                <button className="inline-add" onClick={openNewGuest}>+ New guest</button>
              </div>
              <div className="guest-field">
                <input
                  className={errors.customer ? 'err' : ''}
                  value={custSearch}
                  onChange={(e) => onGuestInputChange(e.target.value)}
                  onFocus={() => setShowSug(true)}
                  onBlur={() => setTimeout(() => setShowSug(false), 200)}
                  placeholder="Search by name or phone"
                  autoComplete="off"
                />
              </div>
              {showSug && custSuggestions.length > 0 && (
                <div className="autosug show">
                  {custSuggestions.map((c) => (
                    <button key={c.id || c.phone} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseCustomer(c)}>
                      <b>{c.name || 'Unknown'}</b><span>{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {errors.customer && <span className="msg show" style={{ display: 'block', marginTop: 4 }}>{errors.customer}</span>}
            </div>

            {/* Services & membership */}
            <div className="block">
              <div className="fs-title">
                <span className="dot" style={{ ['--sc']: '#6C4FE0' }} />
                Services &amp; membership <span className="req">*</span>
                <span className="count">{selectedSvc.length} picked</span>
              </div>
              <div className="cat-search">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services, memberships or products" autoComplete="off" />
              </div>
              <div className="cat-bullets">
                {categories.map((c) => {
                  const col = c === 'all' ? { cc: '#6C4FE0', bg: '#EFEBFE' }
                    : c === 'mem' ? { cc: '#C9992B', bg: '#FBF3DF' }
                    : catOf(c);
                  const label = c === 'all' ? 'All services' : c === 'mem' ? 'Memberships' : c;
                  return (
                    <button key={c} onClick={() => { setCategory(c); setQ(''); }}
                            className={category === c && !q ? 'on' : ''}
                            style={{ ['--cc']: col.cc, ['--ccbg']: col.bg }}>
                      <span className="bd" />{label}
                    </button>
                  );
                })}
              </div>
              <div className="catalog">
                {filteredCatalog.kind === 'search' && (
                  <>
                    {filteredCatalog.services.length > 0 && (
                      <>
                        <div className="cat-lbl">Services</div>
                        <div className="svc-sub">
                          {filteredCatalog.services.map((s) => (
                            <ServiceCard key={s.id} s={s} on={selectedSvc.includes(s.id)} onClick={() => toggleSvc(s.id)} />
                          ))}
                        </div>
                      </>
                    )}
                    {filteredCatalog.memberships.length > 0 && (
                      <>
                        <div className="cat-lbl">Memberships</div>
                        <div className="mem-sub">
                          {filteredCatalog.memberships.map((m) => (
                            <MembershipCard key={m.id} m={m} on={sellMembershipId === m.id} onClick={() => toggleMembership(m.id)} />
                          ))}
                        </div>
                      </>
                    )}
                    {filteredCatalog.products.length > 0 && (
                      <>
                        <div className="cat-lbl">Products</div>
                        <div className="prod-sub">
                          {filteredCatalog.products.map((p) => (
                            <ProductChip key={p.id} p={p} qty={selectedProd[p.id] || 0}
                              onDec={() => bumpProd(p.id, -1)} onInc={() => bumpProd(p.id, 1)} />
                          ))}
                        </div>
                      </>
                    )}
                    {filteredCatalog.services.length + filteredCatalog.memberships.length + filteredCatalog.products.length === 0 && (
                      <div className="cat-empty">No matches for &ldquo;{q}&rdquo;.</div>
                    )}
                  </>
                )}
                {filteredCatalog.kind === 'mem' && (
                  filteredCatalog.memberships.length ? (
                    <div className="mem-sub">
                      {filteredCatalog.memberships.map((m) => (
                        <MembershipCard key={m.id} m={m} on={sellMembershipId === m.id} onClick={() => toggleMembership(m.id)} />
                      ))}
                    </div>
                  ) : <div className="cat-empty">No membership plans yet.</div>
                )}
                {filteredCatalog.kind === 'svc' && (
                  filteredCatalog.services.length ? (
                    <div className="svc-sub">
                      {filteredCatalog.services.map((s) => (
                        <ServiceCard key={s.id} s={s} on={selectedSvc.includes(s.id)} onClick={() => toggleSvc(s.id)} />
                      ))}
                    </div>
                  ) : <div className="cat-empty">No services here.</div>
                )}
              </div>
              {errors.svc && <span className="msg show" style={{ display: 'block', marginTop: 6 }}>{errors.svc}</span>}
            </div>

            {/* Products collapsible */}
            <div className="block">
              <div className={`coll ${productsOpen ? 'open' : ''}`}>
                <div className="coll__h" onClick={() => setProductsOpen((v) => !v)}>
                  <div className="lft">
                    <span className="pill">
                      <svg viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                    </span>
                    <span>Products {prodRows.length > 0 && <span style={{ color: '#9A6A3B' }}>· {prodRows.length} added</span>}</span>
                  </div>
                  <svg className="chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <div className="coll__b">
                  {products.length === 0 && <div className="cat-empty">No products in inventory.</div>}
                  {products.length > 0 && (
                    <div className="prod-sub">
                      {products.slice(0, 30).map((p) => (
                        <ProductChip key={p.id} p={p} qty={selectedProd[p.id] || 0}
                          onDec={() => bumpProd(p.id, -1)} onInc={() => bumpProd(p.id, 1)} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ============================= MIDDLE (barber rail) ============================= */}
          <div className="book-mid">
            <div className="bmr__h">
              <div className="t"><span className="bd" />Barber {stylistRequired && <span className="req">*</span>}</div>
              <div className="sub">{stylistRequired ? 'Required for invoice' : 'Pick manually'}</div>
            </div>
            <div className="bmr__list">
              {barbers.length === 0 && <div className="cat-empty">No stylists yet.</div>}
              {barbers.map((b) => {
                const on = staffId === b.id;
                const img = b.photo_url || b.profile_image;
                return (
                  <button key={b.id} className={`barber ${on ? 'on' : ''}`} onClick={() => pickStaff(b.id)}>
                    {img
                      ? <div className="barber__ph" style={{ backgroundImage: `url(${img})` }} />
                      : <div className="barber__ph">{b.name}</div>}
                    {img && <div className="barber__nm">{b.name}</div>}
                  </button>
                );
              })}
            </div>
            {errors.staff && <div className="msg show" style={{ padding: '4px 8px', textAlign: 'center' }}>{errors.staff}</div>}
          </div>

          {/* ============================= RIGHT ============================= */}
          <div className="book-right">
            {/* Guest details */}
            <div className="gd-card">
              <div className="gd-h">
                <b><span className="bd" />Guest details</b>
                {customer && (
                  <div className="gd-acts">
                    <button className="gd-edit" data-testid="gd-edit-btn" title="Edit guest details"
                            onClick={() => setEditOpen(true)}>
                      <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button className="gd-full" data-testid="gd-view-full-btn" onClick={() => setProfileOpen(true)}>View full details</button>
                  </div>
                )}
              </div>
              {!customer && <div className="gd-empty">Select a guest to see their details.</div>}
              {customer && (
                <>
                  <div className="gd-sec">
                    <div className="gd-row"><span className="k">Name</span><span className="v">{gd.name || customer.name || '—'}</span></div>
                    <div className="gd-row"><span className="k">Contact</span><span className="v">{gd.phone || customer.phone || '—'}</span></div>
                    <div className="gd-row"><span className="k">DOB</span><span className="v">{fmtDate(gd.dob)}</span></div>
                  </div>
                  <div className="gd-sec">
                    <div className="gd-row"><span className="k">Last visit</span><span className="v">{fmtDate(gd.last_visit)}</span></div>
                    <div className="gd-row"><span className="k">Last barber</span><span className="v">{gd.last_barber_name || '—'}</span></div>
                  </div>
                  <div className="gd-sec">
                    <div className="gd-row">
                      <span className="k">Membership</span>
                      <span className="v" style={{ color: gd.membership_active ? '#6C4FE0' : '#7C8092' }}>{membershipLine}</span>
                    </div>
                    <div className="gd-row">
                      <span className="k">Wallet</span>
                      <span className="v" style={{ color: '#12A594' }}>{money(gd.wallet_balance)}</span>
                    </div>
                    {preferredBarberName && (
                      <div className="gd-row"><span className="k">Preferred</span><span className="v">{preferredBarberName}</span></div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Billing summary */}
            <div className="os">
              <div className="os__h">
                <b><span className="bd" />Billing summary</b>
                <span className="who">{customer ? customer.name : '— No guest —'}</span>
              </div>

              {/* Services with per-service barber picker */}
              <div className="os-sec" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                <div className="lb">Services · {svcRows.length}</div>
                {svcRows.length === 0 && <div className="os-empty">No services picked</div>}
                {svcRows.map((s) => {
                  const open = openPicker === s.id;
                  const assignedId = svcBarber[s.id];
                  const assigned = barbers.find((b) => b.id === assignedId) || null;
                  return (
                    <div key={s.id} className="os-svc">
                      <div className="os-line">
                        <span className="n">{s.service_name || s.name}</span>
                        <span className="sb">
                          {assigned
                            ? ((assigned.photo_url || assigned.profile_image)
                              ? <span className="sb-av" style={{ backgroundImage: `url(${assigned.photo_url || assigned.profile_image})` }} />
                              : <span className="sb-av">{initials(assigned.name)}</span>)
                            : <span className="sb-none">Assign</span>}
                          <button
                            className={`sb-btn ${open ? 'act' : ''}`}
                            title="Change barber for this service"
                            onClick={() => setOpenPicker((p) => p === s.id ? null : s.id)}
                          >
                            <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          </button>
                        </span>
                        <span className="p">{money(s.base_price)}</span>
                      </div>
                      {open && (
                        <div className="sb-pick">
                          {barbers.map((b) => {
                            const on = svcBarber[s.id] === b.id;
                            const img = b.photo_url || b.profile_image;
                            return (
                              <button key={b.id} className={`sb-opt ${on ? 'on' : ''}`} onClick={() => setSvcBarberFor(s.id, b.id)}>
                                {img
                                  ? <span className="a" style={{ backgroundImage: `url(${img})` }} />
                                  : <span className="a">{initials(b.name)}</span>}
                                {b.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {prodRows.length > 0 && (
                <div className="os-sec">
                  <div className="lb">Products · {prodRows.length}</div>
                  {prodRows.map(({ p, qty }) => (
                    <div key={p.id} className="os-line plain">
                      <span className="n">{(p.product_name || p.name)} × {qty}</span>
                      <span className="p">{money(Number(p.retail_price || p.selling_price || 0) * qty)}</span>
                    </div>
                  ))}
                </div>
              )}

              {membershipPlan && (
                <div className="os-sec">
                  <div className="lb">Membership</div>
                  <div className="os-line plain">
                    <span className="n">{membershipPlan.name} membership</span>
                    <span className="p">{money(membershipPrice)}</span>
                  </div>
                </div>
              )}

              {/* Billing inputs */}
              <div className="bill-inputs">
                <div className="lb">Discounts &amp; payment</div>
                <div className="coupon-wrap">
                  <input value={couponCode} onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); if (couponError) setCouponError(''); }} placeholder="Coupon code" data-testid="apt-coupon-input" />
                  <button onClick={applyCoupon} disabled={couponChecking} data-testid="apt-coupon-apply">{couponChecking ? '…' : 'Apply'}</button>
                </div>
                {couponApplied && (
                  <div className="coupon-ok show" data-testid="apt-coupon-ok" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span>Coupon <b>{couponInfo?.code || couponCode}</b> applied · −{money(couponDiscount)}</span>
                    <button onClick={clearCoupon} data-testid="apt-coupon-remove" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Remove</button>
                  </div>
                )}
                {couponError && !couponApplied && (
                  <div className="coupon-err" data-testid="apt-coupon-error" style={{ color: '#d92d20', fontSize: 12.5, fontWeight: 600, marginTop: 6 }}>{couponError}</div>
                )}
                <div className="bi-row" style={{ marginTop: 8 }}>
                  <div className="bi-field">
                    <label>Discount %</label>
                    <input type="number" min="0" max="100" value={discountPct}
                           onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
                  </div>
                  <div className="bi-field">
                    <label>Discount ₹ (flat)</label>
                    <input type="number" min="0" value={discountAbs}
                           onChange={(e) => setDiscountAbs(Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                </div>
                <div className="bi-field" style={{ marginBottom: 10 }}>
                  <label>Tip ₹</label>
                  <input type="number" min="0" value={tip}
                         onChange={(e) => setTip(Math.max(0, Number(e.target.value) || 0))} />
                </div>
                <div className="bi-field">
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span>Payment mode</span>
                    <span
                      role="button"
                      data-testid="pay-multi-toggle"
                      onClick={toggleMultiPay}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}
                    >
                      <span style={{
                        width: 30, height: 17, borderRadius: 10, background: multiPay ? 'var(--primary)' : '#CBD0DE',
                        position: 'relative', transition: '.15s', flex: 'none',
                      }}>
                        <span style={{
                          position: 'absolute', top: 2, left: multiPay ? 15 : 2, width: 13, height: 13,
                          borderRadius: '50%', background: '#fff', transition: '.15s',
                        }} />
                      </span>
                      Split payment
                    </span>
                  </label>
                  <div className="pay-modes">
                    {PAY_MODES.map((m) => (
                      <button key={m} type="button"
                              data-testid={`pay-mode-${m}`}
                              className={`pay-m ${paySel.has(m) ? 'on' : ''}`}
                              onClick={() => togglePayMode(m)}>
                        <span className="r" />{PAY_LABEL[m]}
                      </button>
                    ))}
                  </div>
                  {paySplitOn && (
                    <div className="pay-split">
                      {paySelArr.map((m) => (
                        <div key={m} className="pay-row">
                          <span className="pr-name">{PAY_LABEL[m]}</span>
                          <span className="pr-amt">
                            <span className="cur">₹</span>
                            <input type="number" min="0" value={payAmt[m] ?? ''} placeholder="0"
                                   data-testid={`pay-amount-${m}`}
                                   onChange={(e) => setPayAmount(m, e.target.value)} />
                          </span>
                          <button type="button" className="pr-due" onClick={() => applyDueTo(m)}>= due</button>
                        </div>
                      ))}
                      <div className="pay-meta">
                        Allocated <b>{money(allocatedTotal)}</b> of {money(payable)} · <span className={`rem ${allocState === 'ok' ? 'ok' : 'bad'}`}>
                          {allocState === 'ok' && 'Fully allocated'}
                          {allocState === 'under' && `Remaining ${money(remaining)}`}
                          {allocState === 'over' && `Over by ${money(-remaining)}`}
                        </span>
                      </div>
                    </div>
                  )}
                  {errors.payment && <span className="msg show">{errors.payment}</span>}
                </div>
              </div>

              {/* Totals */}
              <div className="os-totals">
                <div className="os-t"><div className="n">Subtotal</div><div className="p">{money(subtotal)}</div></div>
                {totalDiscount > 0 && (
                  <div className="os-t">
                    <div className="n">
                      Discount
                      {(discountPct > 0 && Number(discountAbs) > 0) ? ` (${discountPct}% + ${money(discountAbs)})`
                        : discountPct > 0 ? ` (${discountPct}%)`
                        : ' (flat)'}
                    </div>
                    <div className="p" style={{ color: '#2FA96A' }}>− {money(totalDiscount)}</div>
                  </div>
                )}
                {Number(tip) > 0 && (
                  <div className="os-t"><div className="n">Tip</div><div className="p">+ {money(tip)}</div></div>
                )}
                {membershipPrice > 0 && (
                  <div className="os-t"><div className="n">Membership</div><div className="p">+ {money(membershipPrice)}</div></div>
                )}
              </div>

              {/* Editable final amount */}
              <div className="os-tot">
                <div className="lb">Final amount</div>
                <div className="final-edit">
                  <span className="cur">₹</span>
                  <input type="number" min="0" value={payable}
                         onChange={(e) => setFinalOverride(Math.max(0, Number(e.target.value) || 0))} />
                  <button title="Recalculate total from items" onClick={() => setFinalOverride(null)}>Σ</button>
                </div>
              </div>
              {finalOverride != null && finalOverride !== computedTotal && (
                <div className="os-adj show">
                  Manually set · {(finalOverride - computedTotal) >= 0 ? '+' : '−'}{money(Math.abs(finalOverride - computedTotal))} vs calculated {money(computedTotal)}
                </div>
              )}

              <div className="os-hint">
                {mode === 'queue' && <>Guest will be added to today&apos;s queue.</>}
                {mode === 'schedule' && <>Booked for <b>{date}</b> · <b>{slot}</b> slot.</>}
                {mode === 'direct' && <>Invoice will be created immediately.</>}
              </div>

              {errors.save && <div style={{ marginTop: 10, color: '#E45C86', fontSize: 12.5, fontWeight: 700 }}>{errors.save}</div>}
            </div>
          </div>
        </div>

        <div className="drawer__f">
          <span className="hint">Duration: <b>{totalDurationMin}</b> min · {selectedSvc.length} services</span>
          <div className="acts">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving} data-testid="apt-save-btn">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              {saving ? 'Saving…' : `${modeLabel} · ${money(payable)}`}
            </button>
          </div>
        </div>
      </aside>

      {/* Stacked "Add new guest" drawer */}
      <CustomerDrawer
        open={subOpen}
        stacked
        onClose={() => setSubOpen(false)}
        salonId={salonId}
        getAuthHeaders={getAuthHeaders}
        presetName={custSearch}
        source="owner"
        onSaved={(c) => {
          setCustomers((prev) => [c, ...prev]);
          chooseCustomer({ id: c.id, name: c.name, phone: c.phone, gender: c.gender, preferred_barber_id: c.preferred_barber_id });
        }}
      />

      {/* Stacked "Edit guest" drawer (pencil on details card) */}
      <CustomerDrawer
        open={editOpen}
        stacked
        onClose={() => setEditOpen(false)}
        salonId={salonId}
        getAuthHeaders={getAuthHeaders}
        source="owner"
        initial={customer ? { ...customer, ...(custProfile || {}) } : null}
        onSaved={(c) => {
          setCustomers((prev) => {
            const idx = prev.findIndex((x) => (x.phone || '') === (c.phone || ''));
            if (idx >= 0) { const n = [...prev]; n[idx] = { ...prev[idx], ...c }; return n; }
            return [c, ...prev];
          });
          chooseCustomer({ id: c.id, name: c.name, phone: c.phone, gender: c.gender, preferred_barber_id: c.preferred_barber_id });
        }}
      />

      {/* Stacked "View full details" drawer */}
      <GuestProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        phone={customer?.phone}
        salonId={salonId}
        getAuthHeaders={getAuthHeaders}
        onEdit={() => { setProfileOpen(false); setEditOpen(true); }}
      />
    </>,
    document.body,
  );
}

/* --------- small presentational components --------- */
function ServiceCard({ s, on, onClick }) {
  const col = catOf(s.category || 'General');
  const thumb = s.thumbnail_url || s.image_url;
  return (
    <button className={`svc-card ${on ? 'on' : ''}`} onClick={onClick}
            style={{ ['--cc']: col.cc, ['--ccbg']: col.bg }}>
      <span className="svc-check">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
      {thumb
        ? <div className="svc-thumb" style={{ backgroundImage: `url(${thumb})` }} />
        : <div className="svc-thumb"><svg viewBox="0 0 24 24"><path d="M6 3v18M6 8h9a3 3 0 0 1 0 6H6"/></svg></div>}
      <span className="svc-meta">
        <span className="nm">{s.service_name || s.name}</span>
        <span className="pr" style={{ color: col.cc }}>
          {money(s.base_price || s.price)} <span className="dur">· {s.default_duration || 30}m</span>
        </span>
        {s.category && <span className="svc-tag">{s.category}</span>}
      </span>
    </button>
  );
}

function MembershipCard({ m, on, onClick }) {
  const t = tierOf(m.tier || 'Custom');
  const credit = m.wallet_credit || m.credit || m.credits || 0;
  return (
    <button className={`mem-card ${on ? 'on' : ''}`} onClick={onClick}
            style={{ ['--tc']: t.tc, ['--tcbg']: t.bg }}>
      <span className="mem-radio" />
      <span className="mem-body">
        <span className="mt">
          {m.tier && <span className="badge">{m.tier}</span>}
          <span className="nm">{m.name}</span>
        </span>
        <span className="sub">
          {credit ? `${money(credit)} wallet credit` : `${money(m.price || m.amount)} plan`}
          {m.validity_months ? ` · ${m.validity_months} mo` : ''}
        </span>
      </span>
      <span className="pr">{money(m.price || m.amount)}</span>
    </button>
  );
}

function ProductChip({ p, qty, onDec, onInc }) {
  return (
    <div className={`prod-chip ${qty > 0 ? 'on' : ''}`}>
      <span className="pc-main">
        <span className="pc-name">{p.product_name || p.name}</span>{' '}
        <span className="pc-price">{money(p.retail_price || p.selling_price)}</span>
      </span>
      <span className="qty">
        <button onClick={onDec}>−</button>
        <span className="n">{qty}</span>
        <button onClick={onInc}>+</button>
      </span>
    </div>
  );
}
