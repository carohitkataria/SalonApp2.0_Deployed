/**
 * SalonBookingForm.js — Unified form for New Booking + Quick Invoice.
 *
 * Bottom action bar exposes BOTH primary CTAs:
 *   - Add to Queue     → POST /api/salons/{id}/salon-booking
 *   - Generate Invoice → POST /api/salons/{id}/direct-invoice
 *
 * Services shown as chips (grouped by category). Also lets the salon
 * add products from their inventory in the same order (chips with qty).
 * Coupon + membership upsell + wallet payment supported.
 *
 * Customer name / phone / gender are OPTIONAL. Only required when the
 * salon opts into features that need them (wallet payment, membership sale).
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  User, Phone, ArrowLeft, Scissors, Wallet, CreditCard, Banknote, Smartphone,
  Search, TicketPercent, BadgeCheck, X, Loader2, Check, Plus, Minus,
  UserPlus, ShoppingBag, FileText, Calendar,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSalonAuthHeaders, getSalonId } from './salonAuthHelper';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PAYMENT_MODES = [
  { id: 'cash', label: 'Cash', icon: Banknote, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/40' },
  { id: 'upi', label: 'UPI', icon: Smartphone, color: 'text-blue-500 bg-blue-500/10 border-blue-500/40' },
  { id: 'card', label: 'Card', icon: CreditCard, color: 'text-purple-500 bg-purple-500/10 border-purple-500/40' },
  { id: 'wallet', label: 'Wallet', icon: Wallet, color: 'text-amber-500 bg-amber-500/10 border-amber-500/40' },
];

export default function SalonBookingForm({ initialMode = 'booking' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return'); // 'queue' | 'home' | null
  const salonId = getSalonId();

  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  const [form, setForm] = useState({
    customer_name: '',
    phone: '',
    gender: 'Men',
    barber_id: '',
    selected_services: [],
    selected_products: {},              // { productId: qty }
    payment_mode: 'cash',
  });

  const [walletInfo, setWalletInfo] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponInfo, setCouponInfo] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [selectedMembershipId, setSelectedMembershipId] = useState('');
  const [tipAmount, setTipAmount] = useState(0);
  const [serviceCategory, setServiceCategory] = useState('All');
  const [productCategory, setProductCategory] = useState('All');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittingKind, setSubmittingKind] = useState(null);

  useEffect(() => {
    if (!salonId) { navigate('/salon/login'); return; }
    fetchInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInitial = async () => {
    try {
      const [bRes, sRes, pRes, mRes, cRes] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/barbers`, { headers: getSalonAuthHeaders() }),
        (async () => {
          try {
            const r = await axios.get(`${API}/salons/${salonId}/services/enabled`);
            const arr = Array.isArray(r.data) ? r.data : (r.data?.services || r.data?.enabled_services || []);
            if (arr && arr.length > 0) return { data: arr };
          } catch (e) { /* fall through */ }
          try {
            const r2 = await axios.get(`${API}/services`);
            return { data: r2.data || [] };
          } catch (e2) { return { data: [] }; }
        })(),
        axios.get(`${API}/salon/inventory?page_size=200`, { headers: getSalonAuthHeaders() })
          .catch(() => ({ data: { inventory_items: [] } })),
        axios.get(`${API}/salons/${salonId}/membership-plans`, { headers: getSalonAuthHeaders() })
          .catch(() => ({ data: { plans: [] } })),
        axios.get(`${API}/salons/${salonId}/customers`, { headers: getSalonAuthHeaders() })
          .catch(() => ({ data: { customers: [] } })),
      ]);
      const bList = bRes.data?.barbers || bRes.data || [];
      setBarbers(bList);
      // preselect first barber for convenience
      if (bList.length > 0 && !form.barber_id) {
        setForm((f) => ({ ...f, barber_id: bList[0].id }));
      }
      const svcRaw = sRes.data;
      const svcData = Array.isArray(svcRaw) ? svcRaw : (svcRaw?.services || svcRaw?.enabled_services || []);
      setServices(Array.isArray(svcData) ? svcData : []);
      setProducts(pRes.data?.inventory_items || []);
      setMembershipPlans(mRes.data?.plans || mRes.data || []);
      setCustomers(cRes.data?.customers || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load booking data');
    }
  };

  // ------- Services & products memos -------
  const serviceCategories = useMemo(() => {
    const set = new Set(services.map((s) => s.category || 'General'));
    return ['All', ...Array.from(set)];
  }, [services]);
  const visibleServices = useMemo(() => {
    if (serviceCategory === 'All') return services;
    return services.filter((s) => (s.category || 'General') === serviceCategory);
  }, [serviceCategory, services]);

  const productCategories = useMemo(() => {
    const set = new Set(products.map((p) => p.category || 'General'));
    return ['All', ...Array.from(set)];
  }, [products]);
  const visibleProducts = useMemo(() => {
    if (productCategory === 'All') return products;
    return products.filter((p) => (p.category || 'General') === productCategory);
  }, [productCategory, products]);

  const selectedServiceObjs = useMemo(
    () => services.filter((s) => form.selected_services.includes(s.id)),
    [services, form.selected_services]
  );
  const selectedProductObjs = useMemo(() => {
    return Object.entries(form.selected_products || {})
      .filter(([, qty]) => Number(qty) > 0)
      .map(([id, qty]) => {
        const p = products.find((x) => x.id === id) || {};
        return { id, qty: Number(qty), name: p.name, price: Number(p.retail_price || p.selling_price || p.price || 0), category: p.category };
      });
  }, [form.selected_products, products]);

  // ------- Money -------
  const serviceSubtotal = useMemo(
    () => selectedServiceObjs.reduce((sum, s) => sum + Number(s.base_price || 0), 0),
    [selectedServiceObjs]
  );
  const productSubtotal = useMemo(
    () => selectedProductObjs.reduce((sum, p) => sum + p.qty * p.price, 0),
    [selectedProductObjs]
  );
  const subtotal = serviceSubtotal + productSubtotal;

  const selectedMembership = useMemo(
    () => membershipPlans.find((p) => p.id === selectedMembershipId) || null,
    [membershipPlans, selectedMembershipId]
  );
  const membershipDiscountPct = Number(
    selectedMembership?.discount_percentage || selectedMembership?.service_discount_pct || 0
  );
  // Discount applies only on services (not products)
  const membershipDiscountAmt = Math.round(serviceSubtotal * membershipDiscountPct) / 100;
  const membershipSalePrice = Number(selectedMembership?.price || selectedMembership?.plan_price || 0);

  const couponDiscount = Number(couponInfo?.discount_amount || 0);
  const grandTotalBeforeMembership = Math.max(0, subtotal - membershipDiscountAmt - couponDiscount);
  const grandTotal = Math.max(0, grandTotalBeforeMembership + membershipSalePrice + Number(tipAmount || 0));

  // ------- Handlers -------
  const toggleService = (id) => {
    setForm((prev) => ({
      ...prev,
      selected_services: prev.selected_services.includes(id)
        ? prev.selected_services.filter((x) => x !== id)
        : [...prev.selected_services, id],
    }));
  };

  const setProductQty = (id, delta) => {
    setForm((prev) => {
      const q = Math.max(0, Number(prev.selected_products[id] || 0) + delta);
      const next = { ...(prev.selected_products || {}) };
      if (q === 0) delete next[id]; else next[id] = q;
      return { ...prev, selected_products: next };
    });
  };

  const handleSelectCustomer = async (c) => {
    setSelectedCustomer(c);
    setForm((prev) => ({
      ...prev,
      customer_name: c.name,
      phone: c.phone,
      gender: c.gender || 'Men',
    }));
    try {
      const phoneQ = String(c.phone || '').replace(/^\+91/, '').replace(/\D/g, '');
      if (phoneQ) {
        const res = await axios.get(`${API}/salons/${salonId}/customers/${phoneQ}/wallet`);
        setWalletInfo(res.data || null);
      } else {
        setWalletInfo(null);
      }
    } catch (e) { setWalletInfo(null); }
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setWalletInfo(null);
    setForm({ ...form, customer_name: '', phone: '', gender: 'Men' });
  };

  const handleQuickAddCustomer = async (name, phone, gender = 'Men') => {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!name || !cleanPhone || cleanPhone.length < 10) {
      toast.error('Enter name and 10-digit phone');
      return;
    }
    try {
      const withPrefix = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone : cleanPhone.slice(-10);
      await axios.post(
        `${API}/salons/${salonId}/customers`,
        { name, phone: `+91${withPrefix}`, gender, email: '', notes: '', birthday: '', anniversary: '' },
        { headers: getSalonAuthHeaders() }
      );
      toast.success(`Added ${name}`);
      setForm({ ...form, customer_name: name, phone: `+91${withPrefix}`, gender });
      setSelectedCustomer({ name, phone: `+91${withPrefix}`, gender });
      setCustomers((cs) => [{ id: `local-${Date.now()}`, name, phone: `+91${withPrefix}`, gender }, ...cs]);
      setShowAddCustomer(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add customer');
    }
  };

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    try {
      const res = await axios.post(
        `${API}/salons/${salonId}/coupons/validate`,
        {
          code: couponCode.trim().toUpperCase(),
          bill_amount: Math.max(0, subtotal - membershipDiscountAmt),
          customer_phone: form.phone || undefined,
          service_ids: form.selected_services,
        }
      );
      setCouponInfo(res.data);
      toast.success(`Coupon applied — ₹${res.data.discount_amount} off`);
    } catch (err) {
      setCouponInfo(null);
      toast.error(err.response?.data?.detail || 'Invalid coupon');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const removeCoupon = () => { setCouponInfo(null); setCouponCode(''); };

  const canSubmit = form.selected_services.length > 0 || selectedProductObjs.length > 0;

  const submit = async (kind /* 'booking' | 'invoice' */) => {
    if (!canSubmit) {
      toast.error('Add at least one service or product');
      return;
    }
    if (form.payment_mode === 'wallet' && !form.phone) {
      toast.error('Wallet payment needs customer phone');
      return;
    }
    if (selectedMembershipId && !form.phone) {
      toast.error('Enter customer phone to sell a membership');
      return;
    }
    setSubmitting(true);
    setSubmittingKind(kind);
    try {
      const endpoint = kind === 'invoice'
        ? `${API}/salons/${salonId}/direct-invoice`
        : `${API}/salons/${salonId}/salon-booking`;

      const payload = {
        customer_name: form.customer_name || 'Walk-in',
        phone: form.phone,
        gender: form.gender,
        barber_id: form.barber_id || (barbers[0]?.id ?? null),
        selected_services: form.selected_services,
        selected_products: selectedProductObjs.map((p) => ({ product_id: p.id, name: p.name, qty: p.qty, unit_price: p.price })),
        payment_mode: form.payment_mode,
        coupon_code: couponCode.trim().toUpperCase() || undefined,
        membership_plan_id: selectedMembershipId || undefined,
        tip_amount: Number(tipAmount) || 0,
        notes: notes || undefined,
      };
      const res = await axios.post(endpoint, payload, { headers: getSalonAuthHeaders() });
      toast.success(kind === 'invoice' ? 'Invoice generated' : 'Booking added to queue');
      if (kind === 'invoice') {
        navigate('/salon/dashboard');
      } else {
        // Prefer explicit return= query param, else default to queue tab.
        const target = returnTo === 'home'
          ? '/salon/dashboard'
          : '/salon/dashboard?tab=queue';
        navigate(target);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Something went wrong');
    } finally {
      setSubmitting(false);
      setSubmittingKind(null);
    }
  };

  const filteredCustomers = customerSearch.trim()
    ? customers.filter((c) => {
        const q = customerSearch.trim().toLowerCase();
        return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
      }).slice(0, 8)
    : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HEADER */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-[1180px] mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => {
              const back = returnTo === 'queue'
                ? '/salon/dashboard?tab=queue'
                : '/salon/dashboard';
              navigate(back);
            }}
            className="p-2 rounded-lg hover:bg-muted transition"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gold to-amber-500 bg-clip-text text-transparent">
              New Booking / Invoice
            </h1>
            <p className="text-xs text-muted-foreground truncate">Fill the order and choose an action at the bottom</p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold text-lg text-gold">₹{grandTotal.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="max-w-[1180px] mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 pb-40">
        {/* LEFT — customer + services + products */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer */}
          <section className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-2"><User className="w-4 h-4 text-gold" /> Customer <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></h3>
              {selectedCustomer && (
                <button onClick={handleClearCustomer} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><X className="w-3 h-3" /> Clear</button>
              )}
            </div>

            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search existing customer by name or phone…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
                {filteredCustomers.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id || c.phone}
                        onClick={() => { handleSelectCustomer(c); setCustomerSearch(''); }}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between"
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowAddCustomer(true)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gold/10 border border-gold/40 text-gold text-xs font-semibold hover:bg-gold hover:text-black transition whitespace-nowrap"
                data-testid="quick-add-customer"
              >
                <UserPlus className="w-3.5 h-3.5" /> New
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                placeholder="Customer name (optional)"
                className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Phone (optional, 10 digits)"
                className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
              <div className="flex gap-2 sm:col-span-2">
                {['Men', 'Women', 'Kids'].map((g) => (
                  <button
                    key={g}
                    onClick={() => setForm({ ...form, gender: g })}
                    className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold border transition ${
                      form.gender === g ? 'bg-gold text-black border-gold' : 'bg-background border-border hover:bg-muted'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {walletInfo?.has_membership && (
              <div className="mt-3 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 px-3 py-2 rounded-lg flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Wallet balance</span>
                <span className="font-bold">₹{Number(walletInfo.wallet_balance || 0).toFixed(0)}</span>
              </div>
            )}
          </section>

          {/* Stylist — real barbers only, no "any" */}
          <section className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Scissors className="w-4 h-4 text-gold" /> Assign Stylist</h3>
            <div className="flex flex-wrap gap-2">
              {barbers.length === 0 && (
                <p className="text-xs text-muted-foreground">No active staff. Add barbers to assign services.</p>
              )}
              {barbers.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setForm({ ...form, barber_id: b.id })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    form.barber_id === b.id ? 'bg-gold text-black border-gold' : 'bg-background border-border hover:border-gold/40'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </section>

          {/* Services — chips */}
          <section className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <Scissors className="w-4 h-4 text-gold" /> Services
                <span className="text-xs text-muted-foreground">({form.selected_services.length} selected)</span>
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {serviceCategories.map((c) => (
                <button
                  key={c}
                  onClick={() => setServiceCategory(c)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                    serviceCategory === c ? 'bg-foreground text-background border-foreground' : 'bg-background border-border hover:border-gold/40'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleServices.length === 0 && (
                <p className="text-xs text-muted-foreground">No services available</p>
              )}
              {visibleServices.map((s) => {
                const on = form.selected_services.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleService(s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition inline-flex items-center gap-1.5 ${
                      on ? 'bg-gold text-black border-gold shadow' : 'bg-background border-border hover:border-gold/40'
                    }`}
                    title={s.service_name}
                  >
                    <span>{s.service_name}</span>
                    <span className={`text-[10px] font-bold ${on ? 'text-black/70' : 'text-muted-foreground'}`}>
                      ₹{Number(s.base_price || 0)}
                    </span>
                    {on && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Products / Retail — chips with qty */}
          <section className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-pink-500" /> Products
                <span className="text-xs text-muted-foreground">({selectedProductObjs.length} in cart)</span>
              </h3>
            </div>
            {products.length === 0 ? (
              <p className="text-xs text-muted-foreground">No products in inventory yet.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {productCategories.map((c) => (
                    <button
                      key={c}
                      onClick={() => setProductCategory(c)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                        productCategory === c ? 'bg-foreground text-background border-foreground' : 'bg-background border-border hover:border-pink-500/40'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {visibleProducts.map((p) => {
                    const qty = Number(form.selected_products[p.id] || 0);
                    const price = Number(p.retail_price || p.selling_price || p.price || 0);
                    return (
                      <div
                        key={p.id}
                        className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-full text-xs font-medium border ${
                          qty > 0 ? 'bg-pink-500/10 border-pink-500/50' : 'bg-background border-border'
                        }`}
                      >
                        <span>{p.name}</span>
                        <span className="text-[10px] text-muted-foreground">₹{price}</span>
                        {qty === 0 ? (
                          <button
                            onClick={() => setProductQty(p.id, 1)}
                            className="ml-1 w-5 h-5 rounded-full bg-pink-500 text-white inline-flex items-center justify-center"
                            title="Add"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        ) : (
                          <div className="ml-1 inline-flex items-center gap-1">
                            <button onClick={() => setProductQty(p.id, -1)} className="w-5 h-5 rounded-full bg-muted inline-flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                            <span className="w-4 text-center font-bold">{qty}</span>
                            <button onClick={() => setProductQty(p.id, 1)} className="w-5 h-5 rounded-full bg-pink-500 text-white inline-flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* Notes */}
          <section className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-2">Notes (optional)</h3>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requests, styling preferences, etc."
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </section>
        </div>

        {/* RIGHT — coupon, membership, order summary, payment */}
        <div className="space-y-4">
          <section className="bg-card border border-border rounded-2xl p-4 space-y-4">
            <div>
              <label className="text-xs font-bold flex items-center gap-1 mb-2"><TicketPercent className="w-3.5 h-3.5 text-blue-500" /> Coupon Code</label>
              {couponInfo ? (
                <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/40 rounded-lg px-3 py-2">
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{couponCode.toUpperCase()}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">-₹{couponDiscount.toFixed(0)}</span>
                    <button onClick={removeCoupon} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm uppercase focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                  <button
                    onClick={validateCoupon}
                    disabled={!couponCode.trim() || validatingCoupon || subtotal === 0}
                    className="px-3 py-2 rounded-lg bg-blue-500 text-white text-xs font-semibold disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {validatingCoupon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold flex items-center gap-1 mb-2"><BadgeCheck className="w-3.5 h-3.5 text-purple-500" /> Sell Membership (with this order)</label>
              <select
                value={selectedMembershipId}
                onChange={(e) => setSelectedMembershipId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              >
                <option value="">— None —</option>
                {membershipPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · ₹{p.price || p.plan_price || 0} · {(p.discount_percentage || p.service_discount_pct || 0)}% off
                  </option>
                ))}
              </select>
              {selectedMembership && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Applies {membershipDiscountPct}% off services (₹{membershipDiscountAmt.toFixed(0)}) + adds ₹{Number(selectedMembership.credit || 0)} wallet credit.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-bold mb-2 block">Tip (optional)</label>
              <input
                type="number"
                min="0"
                value={tipAmount || ''}
                onChange={(e) => setTipAmount(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </section>

          {/* Order summary */}
          <section className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-3">Order Summary</h3>
            <div className="space-y-1.5 text-sm">
              {serviceSubtotal > 0 && <Row label="Services" value={serviceSubtotal} />}
              {productSubtotal > 0 && <Row label="Products" value={productSubtotal} />}
              {membershipDiscountAmt > 0 && (
                <Row label={`Membership (${membershipDiscountPct}% off)`} value={-membershipDiscountAmt} negative />
              )}
              {couponDiscount > 0 && (
                <Row label={`Coupon (${couponCode})`} value={-couponDiscount} negative />
              )}
              {membershipSalePrice > 0 && <Row label="Membership sale" value={membershipSalePrice} />}
              {Number(tipAmount) > 0 && <Row label="Tip" value={Number(tipAmount)} />}
              <div className="border-t border-border pt-2 mt-2 flex items-center justify-between">
                <span className="text-sm font-bold">Grand Total</span>
                <span className="text-2xl font-bold text-gold">₹{grandTotal.toFixed(0)}</span>
              </div>
            </div>
          </section>

          {/* Payment mode */}
          <section className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-3">Payment Mode</h3>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_MODES.map((pm) => {
                const on = form.payment_mode === pm.id;
                const Icon = pm.icon;
                const disabled = pm.id === 'wallet' && (!walletInfo?.has_membership || (walletInfo?.wallet_balance || 0) <= 0);
                return (
                  <button
                    key={pm.id}
                    onClick={() => !disabled && setForm({ ...form, payment_mode: pm.id })}
                    disabled={disabled}
                    className={`flex flex-col items-center gap-1 px-2 py-3 rounded-lg border-2 transition text-xs font-semibold ${
                      on ? pm.color : 'bg-background border-border hover:border-gold/40 text-foreground'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Icon className="w-5 h-5" />
                    {pm.label}
                    {pm.id === 'wallet' && walletInfo?.has_membership && (
                      <span className="text-[10px] font-normal">₹{Number(walletInfo.wallet_balance).toFixed(0)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* STICKY BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border">
        <div className="max-w-[1180px] mx-auto p-3 flex items-center gap-2 md:gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Grand Total</p>
            <p className="text-xl md:text-2xl font-bold text-gold leading-tight">₹{grandTotal.toFixed(0)}</p>
          </div>
          <button
            onClick={() => submit('booking')}
            disabled={!canSubmit || submitting}
            data-testid="submit-add-booking"
            className={`inline-flex items-center gap-2 px-3 md:px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition ${
              canSubmit && !submitting
                ? 'bg-gold hover:bg-gold/90 text-black'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            {submitting && submittingKind === 'booking' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            <span>Add to Queue</span>
          </button>
          <button
            onClick={() => submit('invoice')}
            disabled={!canSubmit || submitting}
            data-testid="submit-generate-invoice"
            className={`inline-flex items-center gap-2 px-3 md:px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition ${
              canSubmit && !submitting
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            {submitting && submittingKind === 'invoice' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            <span>Generate Invoice</span>
          </button>
        </div>
      </div>

      {/* Quick-add customer inline modal */}
      {showAddCustomer && (
        <QuickAddCustomer onClose={() => setShowAddCustomer(false)} onCreated={handleQuickAddCustomer} />
      )}
    </div>
  );
}

function Row({ label, value, negative = false, bold = false }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-bold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`${negative ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
        {negative ? '-' : ''}₹{Math.abs(value).toFixed(0)}
      </span>
    </div>
  );
}

function QuickAddCustomer({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Men');
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold flex items-center gap-2"><UserPlus className="w-4 h-4 text-gold" /> New Customer</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
            data-testid="qa-name"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (10 digits)"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
            data-testid="qa-phone"
          />
          <div className="flex gap-2">
            {['Men', 'Women', 'Kids'].map((g) => (
              <button key={g} onClick={() => setGender(g)} className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold border transition ${gender === g ? 'bg-gold text-black border-gold' : 'bg-background border-border hover:bg-muted'}`}>{g}</button>
            ))}
          </div>
          <button
            onClick={() => onCreated(name, phone, gender)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gold text-black font-bold text-sm"
            data-testid="qa-submit"
          >
            <UserPlus className="w-4 h-4" /> Add Customer
          </button>
        </div>
      </div>
    </div>
  );
}
