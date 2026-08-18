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
  { id: 'Morning', ic: 'M', hint: '9AM–1PM' },
  { id: 'Noon', ic: 'N', hint: '1PM–5PM' },
  { id: 'Evening', ic: 'E', hint: '5PM–9PM' },
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
  presetGuest = null, preset = null,
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
  const [offerType, setOfferType] = useState('svc'); // svc | pkg | mem | prod
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

  /* redesign 2026 — filters, variant pricing, per-service extras */
  const [opsSettings, setOpsSettings] = useState({ multi_barber_enabled: false, per_service_discount_enabled: false, back_dated_invoice_enabled: false, stylist_required: true, show_online_prices: true, direct_invoice_default: false });
  const [classification, setClassification] = useState({ tiers: ['Basic', 'Standard', 'Premium', 'Ultra'], lengths: ['Short', 'Medium', 'Long', 'XL'] });
  const [gender, setGender] = useState('Unisex');            // Men | Women | Unisex
  const [activeTier, setActiveTier] = useState(0);
  const [activeLen, setActiveLen] = useState(0);
  const [svcVariant, setSvcVariant] = useState({});          // id -> { tier, length, price }
  const [svcDiscount, setSvcDiscount] = useState({});        // id -> pct
  const [svcAlloc, setSvcAlloc] = useState({});              // id -> [{barber_id, pct}]
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const presetRef = useRef(preset);
  const expectedTimeRef = useRef(null);
  useEffect(() => { authRef.current = getAuthHeaders; }, [getAuthHeaders]);
  useEffect(() => { salonRef.current = salonId; }, [salonId]);
  useEffect(() => { modeRef.current = defaultMode; }, [defaultMode]);
  useEffect(() => { presetGuestRef.current = presetGuest; }, [presetGuest]);
  useEffect(() => { presetRef.current = preset; }, [preset]);

  /* Reset + reload ONLY on drawer open. */
  useEffect(() => {
    if (!open) return;
    setMode(modeRef.current || 'queue');
    setCustomer(null); setCustProfile(null); setCustSearch('');
    setSelectedSvc([]); setSellMembershipId(null); setSelectedProd({});
    setStaffId(''); setSvcBarber({}); setSvcBarberManual(new Set()); setOpenPicker(null);
    setDate(todayISO()); setSlot(currentSlot());
    expectedTimeRef.current = null;
    // WS1 — calendar "click empty cell" preset: barber + session + time prefilled.
    {
      const pr = presetRef.current;
      if (pr && (pr.shift || pr.barber_id || pr.date || pr.expected_time)) {
        setMode('schedule');
        if (pr.date) setDate(pr.date);
        if (pr.shift) setSlot(pr.shift);
        if (pr.barber_id && pr.barber_id !== 'any') setStaffId(pr.barber_id);
        expectedTimeRef.current = pr.expected_time || null;
      }
    }
    setCouponCode(''); setCouponApplied(false); setDiscountPct(0); setDiscountAbs(0);
    setTip(0); setFinalOverride(null);
    setPaySel(new Set(['upi'])); setPayAmt({}); setMultiPay(false);
    setErrors({}); setCategory('all'); setOfferType('svc'); setQ(''); setProductsOpen(false);
    setShowSug(false); setSubOpen(false); setEditOpen(false); setProfileOpen(false);
    setGender('Unisex'); setActiveTier(0); setActiveLen(0);
    setSvcVariant({}); setSvcDiscount({}); setSvcAlloc({}); setSettingsOpen(false);
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
        // Feature flags + tier/length classification (best-effort).
        axios.get(`${API}/salons/${sid}/ops-settings`).then((r) => {
          if (!r.data) return;
          setOpsSettings((o) => ({ ...o, ...r.data }));
          // Default landing invoice type — Walk-in unless the salon opted into
          // Direct invoice as default (and no calendar preset forces schedule).
          const pr = presetRef.current;
          const presetForcesSchedule = pr && (pr.shift || pr.barber_id || pr.date || pr.expected_time);
          if (r.data.direct_invoice_default && !presetForcesSchedule && (modeRef.current || 'queue') === 'queue') {
            setMode('direct');
          }
        }).catch(() => {});
        axios.get(`${API}/salons/${sid}/classification`).then((r) => r.data && setClassification((c) => ({ ...c, ...r.data }))).catch(() => {});
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
  // Offering type of a service: Packages vs Services (everything else).
  const svcTypeOf = (s) => {
    const c = String(s.category || '').toLowerCase();
    return (c === 'packages' || c === 'package') ? 'pkg' : 'svc';
  };
  // Fine-grained bucket for the 2nd filter row (post taxonomy migration).
  const subCatOf = (s) => s.sub_category || s.category || 'General';

  const genderMatch = (s) => {
    const t = s.gender_tag || 'Unisex';
    return gender === 'Unisex' ? true : (t === gender || t === 'Unisex');
  };

  // Row-2 sub-category chips for the active offering type (svc / pkg).
  const subCategories = useMemo(() => {
    if (offerType !== 'svc' && offerType !== 'pkg') return [];
    const set = new Set();
    services.forEach((s) => {
      if (svcTypeOf(s) === offerType && genderMatch(s)) set.add(subCatOf(s));
    });
    return ['all', ...Array.from(set)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, offerType, gender]);

  /* Variant (tier × length) price resolver — mirrors the service editor. */
  const variantKey = (axes, tIdx, lIdx) => {
    const t = (axes || []).includes('tier');
    const l = (axes || []).includes('length');
    const tName = classification.tiers[tIdx] ?? classification.tiers[0];
    const lName = classification.lengths[lIdx] ?? classification.lengths[0];
    if (t && l) return `${tName}__${lName}`;
    if (t) return `${tName}`;
    if (l) return `${lName}`;
    return 'flat';
  };
  const priceOfVariant = (s, tIdx = activeTier, lIdx = activeLen) => {
    const axes = s.axes || [];
    if (axes.length && s.price_matrix) {
      const v = s.price_matrix[variantKey(axes, tIdx, lIdx)];
      if (v != null && v !== '') return Number(v);
    }
    return Number(s.base_price || s.price || 0);
  };
  const variantLabel = (s) => {
    const axes = s.axes || [];
    const parts = [];
    if (axes.includes('tier')) parts.push(classification.tiers[activeTier]);
    if (axes.includes('length')) parts.push(classification.lengths[activeLen]);
    return parts.join(' · ');
  };
  /* Effective (discounted) line price for a picked service. */
  const linePrice = (s) => {
    const base = svcVariant[s.id]?.price != null ? Number(svcVariant[s.id].price) : priceOfVariant(s);
    const d = Number(svcDiscount[s.id] || 0);
    return d > 0 ? Math.round(base * (1 - d / 100)) : base;
  };

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

  const svcSub = svcRows.reduce((t, s) => t + linePrice(s), 0);
  const prodSub = prodRows.reduce((t, r) => t + Number(r.p.retail_price || r.p.selling_price || 0) * r.qty, 0);
  const subtotal = svcSub + prodSub;
  const discountAmtPct = Math.round((subtotal * (Number(discountPct) || 0)) / 100);
  const totalDiscount = discountAmtPct + Number(discountAbs || 0) + Number(couponDiscount || 0);
  const membershipPrice = Number(membershipPlan?.price || membershipPlan?.amount || 0);
  const computedTotal = Math.max(0, subtotal - totalDiscount + Number(tip || 0) + membershipPrice);
  const payable = finalOverride != null ? Number(finalOverride) : computedTotal;
  const totalDurationMin = svcRows.reduce((t, s) => t + Number(s.default_duration || 30), 0);

  const filteredCatalog = useMemo(() => {
    const byGender = (s) => {
      const t = s.gender_tag || 'Unisex';
      return gender === 'Unisex' ? true : (t === gender || t === 'Unisex');
    };
    const query = q.trim().toLowerCase();
    if (query) {
      const ms = services.filter((s) => byGender(s) && (
        (s.service_name || s.name || '').toLowerCase().includes(query) ||
        (s.category || '').toLowerCase().includes(query) ||
        (s.sub_category || '').toLowerCase().includes(query)));
      const mm = memberships.filter((m) =>
        (m.name || '').toLowerCase().includes(query) ||
        (m.tier || '').toLowerCase().includes(query));
      const mp = products.filter((p) =>
        (p.product_name || p.name || '').toLowerCase().includes(query));
      return { kind: 'search', services: ms, memberships: mm, products: mp };
    }
    if (offerType === 'mem') return { kind: 'mem', memberships };
    if (offerType === 'prod') return { kind: 'prod', products };
    // svc or pkg — filter by offering type + gender + sub-category
    let list = services.filter((s) => svcTypeOf(s) === offerType && byGender(s));
    if (category && category !== 'all') list = list.filter((s) => subCatOf(s) === category);
    return { kind: 'svc', services: list };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, offerType, services, memberships, products, gender]);

  // Reset the sub-category row whenever the offering type changes.
  useEffect(() => { setCategory('all'); }, [offerType]);

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
        setSvcVariant((v) => { const n = { ...v }; delete n[id]; return n; });
        setSvcDiscount((d) => { const n = { ...d }; delete n[id]; return n; });
        setSvcAlloc((a) => { const n = { ...a }; delete n[id]; return n; });
        return prev.filter((x) => x !== id);
      }
      // Snapshot the active tier/length variant + price at add time.
      const svc = services.find((x) => x.id === id);
      if (svc) {
        const axes = svc.axes || [];
        setSvcVariant((v) => ({
          ...v,
          [id]: {
            tier: axes.includes('tier') ? classification.tiers[activeTier] : null,
            length: axes.includes('length') ? classification.lengths[activeLen] : null,
            price: priceOfVariant(svc),
          },
        }));
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

  const stylistRequired = mode === 'direct' && opsSettings.stylist_required !== false;
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
      const services_payload = selectedSvc.map((sid2) => {
        const svc = services.find((x) => x.id === sid2) || {};
        const variant = svcVariant[sid2] || {};
        const allocs = (opsSettings.multi_barber_enabled && Array.isArray(svcAlloc[sid2]) && svcAlloc[sid2].length)
          ? svcAlloc[sid2].filter((a) => a.barber_id).map((a) => ({ barber_id: a.barber_id, pct: Number(a.pct) || 0 }))
          : null;
        const disc = opsSettings.per_service_discount_enabled ? Number(svcDiscount[sid2] || 0) : 0;
        return {
          service_id: sid2,
          barber_id: (allocs && allocs[0]?.barber_id) || svcBarber[sid2] || staffId || null,
          barber_allocations: allocs,
          discount_percent: disc || null,
          tier: variant.tier || null,
          length: variant.length || null,
          price: linePrice(svc),
        };
      });

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
        final_amount_override: finalOverride != null ? Number(finalOverride) : Number(payable),
      };

      if (mode === 'direct') {
        await axios.post(`${API}/salons/${sid}/direct-invoice`, {
          customer_name: customer?.name || 'Walk-in Guest', phone: customer?.phone || '', gender: customer?.gender || 'Men',
          barber_id: staffId,
          selected_services: selectedSvc,
          services_payload,
          selected_products: products_payload,
          invoice_date: (opsSettings.back_dated_invoice_enabled && date && date !== todayISO()) ? date : null,
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
          expected_time: expectedTimeRef.current || null,
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
        <style>{`
          .newapt .apt-gender{display:inline-flex;border:1.5px solid #CBD0DE;border-radius:9px;overflow:hidden;flex:none}
          .newapt .apt-gender button{width:30px;padding:6px 0;border:0;border-right:1.5px solid #ECECF3;background:#fff;color:#7C8092;font-weight:800;font-size:12px}
          .newapt .apt-gender button:last-child{border-right:0}
          .newapt .apt-gender button.on{background:#23252F;color:#fff}
          .newapt .apt-cats-scroll{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;padding-bottom:4px;scrollbar-width:thin}
          .newapt .apt-cats-scroll button{white-space:nowrap;flex:none}
          .newapt .apt-variant{display:flex;flex-direction:column;gap:6px;margin:8px 0 4px;padding:8px;border:1.5px solid #ECECF3;border-radius:10px;background:#FBFBFE}
          .newapt .apt-variant .av-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
          .newapt .apt-variant .av-lbl{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7C8092;width:52px;flex:none}
          .newapt .apt-variant .av-row button{padding:4px 10px;border:1.5px solid #CBD0DE;background:#fff;border-radius:16px;font-weight:700;font-size:11.5px;color:#3C3F4E}
          .newapt .apt-variant .av-row button.on{background:#6C4FE0;border-color:#6C4FE0;color:#fff}
          .newapt .svc-alloc{margin-top:7px;padding-top:7px;border-top:1px dashed #ECECF3;display:flex;flex-direction:column;gap:5px}
          .newapt .svc-alloc .al-row{display:flex;align-items:center;gap:6px}
          .newapt .svc-alloc select{flex:1;min-width:0;border:1.5px solid #CBD0DE;border-radius:7px;padding:4px 6px;font-size:11.5px;font-family:inherit}
          .newapt .svc-alloc input{width:52px;text-align:right;border:1.5px solid #CBD0DE;border-radius:7px;padding:4px 6px;font-size:11.5px;font-family:inherit}
          .newapt .svc-alloc .pct{font-size:10px;color:#7C8092}
          .newapt .svc-alloc .rm{border:0;background:transparent;color:#9A9EAE;font-size:16px;line-height:1;cursor:pointer}
          .newapt .svc-alloc .rm:hover{color:#E45C86}
          .newapt .svc-alloc .al-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}
          .newapt .svc-alloc .al-add{font-size:10px;font-weight:800;color:#6C4FE0;background:transparent;border:1.5px dashed #D6CBFF;border-radius:6px;padding:3px 7px;cursor:pointer}
          .newapt .svc-alloc .al-warn{font-size:9.5px;font-weight:800;color:#E45C86;visibility:hidden}
          .newapt .svc-alloc .al-warn.show{visibility:visible}
          .newapt .svc-disc{margin-top:7px;display:flex;align-items:center;gap:8px}
          .newapt .svc-disc label{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7C8092}
          .newapt .svc-disc input{width:70px;border:1.5px solid #CBD0DE;border-radius:7px;padding:5px 7px;font-size:12px;font-family:inherit;text-align:right}
          .newapt .drawer__h .apt-modeseg{display:inline-flex;border:1.5px solid #CBD0DE;border-radius:11px;overflow:hidden;background:#fff}
          .newapt .apt-modeseg .ms{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border:0;border-right:1.5px solid #ECECF3;background:#fff;color:#7C8092;font-weight:700;font-size:12.5px}
          .newapt .apt-modeseg .ms:last-child{border-right:0}
          .newapt .apt-modeseg .ms svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2}
          .newapt .apt-modeseg .ms span{display:none}
          .newapt .apt-modeseg .ms.on{background:#6C4FE0;color:#fff}
          .newapt .apt-modeseg .ms.on span{display:inline}
          .newapt .apt-fav-chip{padding:5px 10px !important}
          .newapt .apt-fav-chip .apt-fav-star{font-size:18px;line-height:1;color:#C9992B}
          .newapt .apt-fav-chip.on{background:#C9992B !important;border-color:#C9992B !important}
          .newapt .apt-fav-chip.on .apt-fav-star{color:#fff}
          .newapt .apt-catbody.has-rail{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:start}
          .newapt .apt-catbody .catalog{min-width:0}
          .newapt .apt-vrail{display:flex;flex-direction:column;gap:5px;padding:6px 5px;border:1.5px solid #ECECF3;border-radius:11px;background:#FBFBFE;align-self:start;position:sticky;top:0}
          .newapt .apt-vrail .vr-grp{display:flex;flex-direction:column;gap:4px}
          .newapt .apt-vrail .vr-lbl{font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9A9EAE;text-align:center}
          .newapt .apt-vrail .vr-sep{height:1.5px;background:#ECECF3;margin:3px 2px}
          .newapt .apt-vrail button{width:44px;padding:6px 2px;border:1.5px solid #CBD0DE;background:#fff;border-radius:9px;font-weight:800;font-size:10px;color:#3C3F4E;cursor:pointer}
          .newapt .apt-vrail button.on{background:#6C4FE0;border-color:#6C4FE0;color:#fff}
        `}</style>
        {/* header */}
        <div className="drawer__h">
          <div className="apt-modeseg" data-testid="apt-modeseg">
            <button className={`ms ${mode === 'direct' ? 'on' : ''}`} onClick={() => setMode('direct')} data-testid="apt-mode-direct" title="Direct invoice">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><span>Direct invoice</span>
            </button>
            <button className={`ms ${mode === 'queue' ? 'on' : ''}`} onClick={() => setMode('queue')} data-testid="apt-mode-queue" title="Walk-in">
              <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><span>Walk-in</span>
            </button>
            <button className={`ms ${mode === 'schedule' ? 'on' : ''}`} onClick={() => setMode('schedule')} data-testid="apt-mode-schedule" title="Schedule">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>Schedule</span>
            </button>
          </div>
          {/* Inline date / session — shown in the same top panel (redesign 2026) */}
          {mode === 'direct' && opsSettings.back_dated_invoice_enabled && (
            <div className="apt-topfield" data-testid="apt-direct-date">
              <label>Invoice date</label>
              <input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} data-testid="apt-direct-date-input" />
            </div>
          )}
          {mode === 'schedule' && (
            <div className="apt-topfield apt-topsched" data-testid="apt-sched-top">
              <div className="tf">
                <label>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="apt-sched-date-input" />
              </div>
              <div className="tf">
                <label>Session</label>
                <div className="apt-session" data-testid="apt-session">
                  {SHIFTS.map((s) => (
                    <button key={s.id} type="button" className={slot === s.id ? 'on' : ''}
                            title={`${s.id} · ${s.hint}`} onClick={() => setSlot(s.id)}
                            data-testid={`apt-session-${s.ic}`}>{s.ic}</button>
                  ))}
                </div>
              </div>
              {errors.date && <span className="msg show">{errors.date}</span>}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <button className="apt-gear" title="Appointment settings" data-testid="apt-settings-btn"
                    onClick={() => setSettingsOpen((v) => !v)}
                    style={{ width: 34, height: 34, borderRadius: 9, border: '1.5px solid #CBD0DE', background: '#fff', color: '#3C3F4E', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.2-1.3L14 2h-4l-.3 2.4a7 7 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.3l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.2 1.3L10 22h4l.3-2.4a7 7 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12z"/></svg>
            </button>
            {settingsOpen && (
              <div className="apt-settings-pop" data-testid="apt-settings-pop"
                   style={{ position: 'absolute', top: 42, right: 0, width: 300, background: '#fff', border: '1.5px solid #CBD0DE', borderRadius: 12, boxShadow: '0 12px 44px rgba(30,32,50,.18)', zIndex: 9200, padding: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Appointment settings</div>
                {[
                  ['multi_barber_enabled', 'Multiple barbers per service', 'Split a service across barbers with %.'],
                  ['per_service_discount_enabled', 'Per-service discount %', 'Add a discount field on each line.'],
                  ['stylist_required', 'Stylist required for invoice', 'Force a barber before a direct invoice.'],
                  ['back_dated_invoice_enabled', 'Allow back-dated invoices', 'Show a past-date field on invoices.'],
                  ['direct_invoice_default', 'Direct invoice as default', 'Land on Direct invoice instead of Walk-in.'],
                ].map(([k, title, sub]) => (
                  <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid #ECECF3', cursor: 'pointer' }}>
                    <input type="checkbox" checked={opsSettings[k] !== false ? !!opsSettings[k] : false} data-testid={`apt-set-${k}`}
                           onChange={(e) => {
                             const next = { ...opsSettings, [k]: e.target.checked };
                             setOpsSettings(next);
                             axios.put(`${API}/salons/${salonRef.current}/ops-settings`, { [k]: e.target.checked }, { headers: authRef.current() }).catch(() => {});
                           }} style={{ marginTop: 2, accentColor: '#6C4FE0' }} />
                    <span><span style={{ fontWeight: 700, fontSize: 12.5 }}>{title}</span><span style={{ display: 'block', fontSize: 11, color: '#7C8092' }}>{sub}</span></span>
                  </label>
                ))}
              </div>
            )}
            <button className="drawer__close" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="book-split">
          {/* ============================= LEFT ============================= */}
          <div className="book-left">
          {/* Modes moved to header. Schedule date/session now shown in the top panel. */}

            {/* Guest search relocated to the right "Guest details" card (redesign 2026). */}

            {/* Services & membership — title + search in one row (Feb 2026) */}
            <div className="block">
              <div className="fs-title" style={{ margin: '2px 0 10px' }}>
                <span className="dot" style={{ ['--sc']: '#6C4FE0' }} />
                <span>Services &amp; membership <span className="req">*</span></span>
                <div className="cat-search" style={{ flex: 1, margin: 0, minWidth: 0 }}>
                  <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services, memberships or products" autoComplete="off" data-testid="new-appt-svc-search" />
                </div>
                {/* gender toggle — icons only, saves space (Unisex default) */}
                <div className="apt-gender" data-testid="apt-gender">
                  {[['Women', 'W'], ['Men', 'M'], ['Unisex', 'U']].map(([g, ic]) => (
                    <button key={g} type="button" className={gender === g ? 'on' : ''} title={g === 'Unisex' ? 'Both' : g}
                            onClick={() => setGender(g)} data-testid={`apt-gender-${g}`}>{ic}</button>
                  ))}
                </div>
              </div>
              {/* Row 1 — offering type tabs */}
              <div className="apt-offtabs" data-testid="apt-offer-tabs">
                {[
                  ['svc', 'Services', 'M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4'],
                  ['pkg', 'Packages', 'M12 2l9 4.9V17L12 22 3 17V6.9L12 2zM3 7l9 5 9-5M12 12v10'],
                  ['mem', 'Member', 'M3 5h18v14H3zM3 10h18'],
                  ['prod', 'Product', 'M3 7h18v13H3zM3 7l3-4h12l3 4M9 12h6'],
                ].map(([id, label, d]) => (
                  <button key={id} type="button"
                          className={`apt-offtab ${offerType === id && !q ? 'on' : ''}`}
                          onClick={() => { setOfferType(id); setQ(''); }}
                          data-testid={`apt-offer-${id}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={d} /></svg>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              {/* Row 2 — sub-category chips (Services / Packages only) */}
              {(offerType === 'svc' || offerType === 'pkg') && subCategories.length > 1 && (
                <div className="cat-bullets apt-cats-scroll" data-testid="apt-subcats">
                  {subCategories.map((c) => {
                    const col = c === 'all' ? { cc: '#6C4FE0', bg: '#EFEBFE' } : catOf(c);
                    const label = c === 'all' ? 'All' : c;
                    return (
                      <button key={c} onClick={() => { setCategory(c); setQ(''); }}
                              className={`${category === c && !q ? 'on' : ''}`}
                              data-testid={`apt-cat-${c}`}
                              style={{ ['--cc']: col.cc, ['--ccbg']: col.bg }}>
                        <span className="bd" />{label}
                      </button>
                    );
                  })}
                </div>
              )}
              {(() => {
                const list = filteredCatalog.services || [];
                const anyTier = list.some((s) => (s.axes || []).includes('tier'));
                const anyLen = list.some((s) => (s.axes || []).includes('length'));
                const rail = (anyTier || anyLen) ? (
                  <div className="apt-vrail" data-testid="apt-variant-rail">
                    {anyTier && (
                      <div className="vr-grp"><span className="vr-lbl">Tier</span>
                        {classification.tiers.map((t, i) => (
                          <button key={t} className={activeTier === i ? 'on' : ''} onClick={() => setActiveTier(i)} title={`Tier: ${t}`}>{t.slice(0, 4)}</button>
                        ))}
                      </div>
                    )}
                    {anyTier && anyLen && <div className="vr-sep" />}
                    {anyLen && (
                      <div className="vr-grp"><span className="vr-lbl">Len</span>
                        {classification.lengths.map((l, i) => (
                          <button key={l} className={activeLen === i ? 'on' : ''} onClick={() => setActiveLen(i)} title={`Length: ${l}`}>{l}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null;
                return (
                  <div className={`apt-catbody ${rail ? 'has-rail' : ''}`}>
                    {rail}
                    <div className="catalog">
                {filteredCatalog.kind === 'search' && (
                  <>
                    {filteredCatalog.services.length > 0 && (
                      <>
                        <div className="cat-lbl">Services</div>
                        <div className="svc-sub">
                          {filteredCatalog.services.map((s) => (
                            <ServiceCard key={s.id} s={s} on={selectedSvc.includes(s.id)} onClick={() => toggleSvc(s.id)} price={priceOfVariant(s)} variant={variantLabel(s)} />
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
                        <ServiceCard key={s.id} s={s} on={selectedSvc.includes(s.id)} onClick={() => toggleSvc(s.id)} price={priceOfVariant(s)} variant={variantLabel(s)} />
                      ))}
                    </div>
                  ) : <div className="cat-empty">No services here.</div>
                )}
                {filteredCatalog.kind === 'prod' && (
                  filteredCatalog.products.length ? (
                    <div className="prod-sub">
                      {filteredCatalog.products.map((p) => (
                        <ProductChip key={p.id} p={p} qty={selectedProd[p.id] || 0}
                          onDec={() => bumpProd(p.id, -1)} onInc={() => bumpProd(p.id, 1)} />
                      ))}
                    </div>
                  ) : <div className="cat-empty">No products in inventory.</div>
                )}
                    </div>
                  </div>
                );
              })()}
              {errors.svc && <span className="msg show" style={{ display: 'block', marginTop: 6 }}>{errors.svc}</span>}
            </div>

          </div>

          {/* ============================= MIDDLE (barber rail) ============================= */}
          <div className="book-mid">
            <div className="bmr__h">
              <div className="t"><span className="bd" />Barber {stylistRequired && <span className="req">*</span>}</div>
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
              {/* Guest search relocated here (redesign 2026) */}
              <div className="gd-search" style={{ position: 'relative', display: 'flex', gap: 6, marginBottom: 10 }}>
                <input
                  className={errors.customer ? 'err' : ''}
                  style={{ flex: 1, minWidth: 0, border: '1.5px solid #CBD0DE', borderRadius: 8, padding: '7px 9px', fontSize: 13, fontFamily: 'inherit' }}
                  value={custSearch}
                  onChange={(e) => onGuestInputChange(e.target.value)}
                  onFocus={() => setShowSug(true)}
                  onBlur={() => setTimeout(() => setShowSug(false), 200)}
                  placeholder="Search or enter mobile…"
                  autoComplete="off"
                  data-testid="new-appt-guest-search"
                />
                <button className="inline-add" style={{ whiteSpace: 'nowrap' }} onClick={openNewGuest} data-testid="new-appt-new-guest">+ New</button>
                {showSug && custSuggestions.length > 0 && (
                  <div className="autosug show" style={{ position: 'absolute', top: 40, left: 0, right: 0, zIndex: 30 }}>
                    {custSuggestions.map((c) => (
                      <button key={c.id || c.phone} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseCustomer(c)}>
                        <b>{c.name || 'Unknown'}</b><span>{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.customer && <span className="msg show" style={{ display: 'block', marginBottom: 6 }}>{errors.customer}</span>}
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
                        <span className="p">
                          {svcVariant[s.id]?.price != null && linePrice(s) !== svcVariant[s.id].price
                            ? <><span style={{ textDecoration: 'line-through', color: '#9A9EAE', marginRight: 4, fontWeight: 500 }}>{money(svcVariant[s.id].price)}</span>{money(linePrice(s))}</>
                            : money(linePrice(s))}
                          {variantLabel(s) && <span style={{ display: 'block', fontSize: 10, color: '#9A9EAE', fontWeight: 600 }}>{svcVariant[s.id]?.tier || ''}{svcVariant[s.id]?.tier && svcVariant[s.id]?.length ? ' · ' : ''}{svcVariant[s.id]?.length || ''}</span>}
                        </span>
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
                          {opsSettings.multi_barber_enabled && (
                            <button className="sb-opt" style={{ color: '#6C4FE0', fontWeight: 800, borderTop: '1.5px solid #E3E3EC' }}
                                    data-testid={`svc-multi-${s.id}`}
                                    onClick={() => {
                                      const cur = svcAlloc[s.id];
                                      if (cur && cur.length) { setSvcAlloc((a) => { const n = { ...a }; delete n[s.id]; return n; }); }
                                      else {
                                        const b0 = svcBarber[s.id] || staffId || barbers[0]?.id;
                                        const b1 = barbers.find((b) => b.id !== b0)?.id || b0;
                                        setSvcAlloc((a) => ({ ...a, [s.id]: [{ barber_id: b0, pct: 50 }, { barber_id: b1, pct: 50 }] }));
                                      }
                                      setOpenPicker(null);
                                    }}>
                              {svcAlloc[s.id]?.length ? 'Remove multiple barbers' : 'Select multiple barbers…'}
                            </button>
                          )}
                        </div>
                      )}
                      {/* Per-service multi-barber allocation (Settings-gated) */}
                      {opsSettings.multi_barber_enabled && Array.isArray(svcAlloc[s.id]) && svcAlloc[s.id].length > 0 && (() => {
                        const rows = svcAlloc[s.id];
                        const tot = rows.reduce((t, r) => t + (Number(r.pct) || 0), 0);
                        const upd = (fn) => setSvcAlloc((a) => ({ ...a, [s.id]: fn([...(a[s.id] || [])]) }));
                        return (
                          <div className="svc-alloc" data-testid={`svc-alloc-${s.id}`}>
                            {rows.map((r, i) => (
                              <div className="al-row" key={i}>
                                <select value={r.barber_id || ''} onChange={(e) => upd((arr) => { arr[i] = { ...arr[i], barber_id: e.target.value }; return arr; })}>
                                  {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                                <input type="number" min="0" max="100" value={r.pct} onChange={(e) => upd((arr) => { arr[i] = { ...arr[i], pct: Number(e.target.value) || 0 }; return arr; })} />
                                <span className="pct">%</span>
                                <button className="rm" onClick={() => upd((arr) => { arr.splice(i, 1); return arr; })}>×</button>
                              </div>
                            ))}
                            <div className="al-foot">
                              <button className="al-add" onClick={() => upd((arr) => { arr.push({ barber_id: barbers[0]?.id, pct: 0 }); return arr; })}>+ barber</button>
                              <span className={`al-warn ${tot !== 100 ? 'show' : ''}`}>{tot}% — must total 100%</span>
                            </div>
                          </div>
                        );
                      })()}
                      {/* Per-service discount % (Settings-gated) */}
                      {opsSettings.per_service_discount_enabled && (
                        <div className="svc-disc" data-testid={`svc-disc-${s.id}`}>
                          <label>Discount %</label>
                          <input type="number" min="0" max="100" value={svcDiscount[s.id] || 0}
                                 onChange={(e) => setSvcDiscount((d) => ({ ...d, [s.id]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))} />
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
function ServiceCard({ s, on, onClick, price, variant }) {
  const col = catOf(s.category || 'General');
  const thumb = s.thumbnail_url || s.image_url;
  const shown = price != null ? price : (s.base_price || s.price);
  const onwards = s.price_type === 'onwards';
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
          {money(shown)}{onwards ? '+' : ''} <span className="dur">· {s.default_duration || 30}m</span>
        </span>
        {variant ? <span className="svc-tag">{variant}</span> : (s.category && <span className="svc-tag">{s.category}</span>)}
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
