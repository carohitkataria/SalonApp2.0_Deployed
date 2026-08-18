/**
 * SalonSettingsV3.js — Redesigned Settings page (gold theme).
 *
 * Every sub-section is INLINED (matches the attached mock exactly instead of
 * wrapping arbitrary existing components). Data is loaded from the salon record
 * and saved back via PUT /api/salons/{salon_id} partial updates.
 *
 * RBAC: every sub-section is gated by hasModulePermission and locked
 * sub-sections are hidden from the left nav.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { SETTINGS_V3_CSS } from './SettingsV3Styles';
import EmployeeRewardPlan from '@/components/EmployeeRewardPlan';
import LeaveConfigTab from '@/components/leave/LeaveConfigTab';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// WS2 — Indian States/UTs for the mandatory salon profile State dropdown.
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

const NAV = [
  {
    k: 'business', label: 'Business profile',
    ico: <><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></>,
    subs: [
      { k: 'details', label: 'Salon details', perm: ['salon_settings', 'edit_profile'] },
      { k: 'branches', label: 'Branches', perm: ['salon_settings', 'edit_branches'] },
      { k: 'hours', label: 'Business hours', perm: ['salon_settings', 'edit_hours'] },
    ],
  },
  {
    k: 'staff', label: 'Staff & attendance',
    ico: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></>,
    subs: [
      { k: 'method', label: 'Attendance method & rules', perm: ['staff', 'attendance'] },
      { k: 'leave', label: 'Leave & holidays', perm: ['staff', 'attendance'] },
      { k: 'payroll', label: 'Payroll & incentives', perm: ['staff', 'salary_view'] },
    ],
  },
  {
    k: 'services', label: 'Services & pricing',
    ico: <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/></>,
    subs: [
      { k: 'barber', label: 'Per-barber pricing', perm: ['services', 'view'] },
    ],
  },
  {
    k: 'invoice', label: 'Invoicing',
    ico: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
    subs: [
      { k: 'tax', label: 'Tax & numbering', perm: ['salon_settings', 'edit_profile'] },
      { k: 'format', label: 'Invoice format', perm: ['salon_settings', 'edit_profile'] },
      { k: 'offers', label: 'Offers on invoice', perm: ['marketing', 'view'] },
    ],
  },
  {
    k: 'booking', label: 'Booking & queue',
    ico: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    subs: [
      { k: 'online', label: 'Online booking', perm: ['salon_settings', 'edit_profile'] },
      { k: 'queue', label: 'Walk-in queue', perm: ['salon_settings', 'edit_profile'] },
    ],
  },
  {
    k: 'payments', label: 'Payments & wallet',
    ico: <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    subs: [
      { k: 'gateway', label: 'Payment gateway', perm: ['salon_settings', 'edit_profile'] },
      { k: 'counter', label: 'Counter methods', perm: ['salon_settings', 'edit_profile'] },
      { k: 'wallet', label: 'Marketing wallet', perm: ['marketing', 'view'] },
    ],
  },
  {
    k: 'notif', label: 'Notifications',
    ico: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    subs: [
      { k: 'guest', label: 'Guest messages', perm: ['salon_settings', 'edit_notifications'] },
      { k: 'staffn', label: 'Staff & owner alerts', perm: ['salon_settings', 'edit_notifications'] },
    ],
  },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ------- Small reusable UI atoms scoped to `.setv3` -------
function SubscriptionBadge({ salon }) {
  if (!salon) return null;
  const plan = salon.subscription_plan || salon.plan || 'free';
  const expiryRaw =
    salon.subscription_expiry ||
    salon.plan_expiry ||
    salon.subscription?.expiry ||
    salon.subscription?.expires_at ||
    salon.subscription?.end_date ||
    null;
  const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
  const days = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  const isPaid = String(plan).toLowerCase() !== 'free' && String(plan).toLowerCase() !== 'trial';
  const tone = !isPaid ? 'sub-free' : days == null ? 'sub-active' : days < 0 ? 'sub-expired' : days <= 15 ? 'sub-warn' : 'sub-active';

  let human;
  if (!isPaid) human = 'Free plan';
  else if (!expiryDate) human = `${plan.toUpperCase()} · Active`;
  else if (days < 0) human = `${plan.toUpperCase()} · Expired ${Math.abs(days)}d ago`;
  else human = `${plan.toUpperCase()} · Renews in ${days}d`;

  const expiryLabel = expiryDate
    ? expiryDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className={`sub-badge ${tone}`} data-testid="settings-sub-badge">
      <div className="sub-badge-ic">
        <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </div>
      <div>
        <div className="sub-badge-t">{human}</div>
        {expiryLabel && <div className="sub-badge-s">Expires · {expiryLabel}</div>}
      </div>
    </div>
  );
}
function OptRow({ label, hint, on, onChange, testid }) {
  return (
    <div className="opt-row">
      <div className="on-l"><b>{label}</b>{hint && <span>{hint}</span>}</div>
      <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={onChange} data-testid={testid} aria-pressed={on} />
    </div>
  );
}

// Phase 3.8 — per-event row with two independent channel toggles (In-App + WhatsApp)
function NotifChannelRow({ label, hint, inApp, wa, onToggleInApp, onToggleWa, testid }) {
  return (
    <div className="opt-row notif-ch">
      <div className="on-l"><b>{label}</b>{hint && <span>{hint}</span>}</div>
      <div className="notif-ch__ctrls">
        <div className="notif-ch__c">
          <span className="notif-ch__lb">In-App</span>
          <button type="button" className={`toggle ${inApp ? 'on' : ''}`} onClick={onToggleInApp} data-testid={testid ? `${testid}-inapp` : undefined} aria-pressed={inApp} />
        </div>
        <div className="notif-ch__c">
          <span className="notif-ch__lb">WhatsApp</span>
          <button type="button" className={`toggle ${wa ? 'on' : ''}`} onClick={onToggleWa} data-testid={testid ? `${testid}-wa` : undefined} aria-pressed={wa} />
        </div>
      </div>
    </div>
  );
}

function SaveRow({ onClick, disabled, testid, label = 'Save' }) {
  return (
    <div className="save-row">
      <button className="btn-primary" onClick={onClick} disabled={disabled} data-testid={testid}>
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>{label}
      </button>
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return <div className="bhead"><h3>{title}</h3>{sub && <p>{sub}</p>}</div>;
}

// ============================================================================

export default function SalonSettingsV3({ salonId, salon, setSalon, getAuthHeaders }) {
  const { hasModulePermission, salonUser } = useAuth();
  const isAdmin = salonUser?.role === 'admin' || salonUser?.role === 'branch_manager';
  const permAllowed = (perm) => {
    if (!perm) return true;
    if (isAdmin) return true;
    return !!hasModulePermission?.(perm[0], perm[1]);
  };

  const [sec, setSec] = useState('business');
  const [sub, setSub] = useState('details');
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();

  // ------ Editable state (backed by salon record) ------
  const [form, setForm] = useState({});
  const [initial, setInitial] = useState({});
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState([]);
  // Invoice preview drawer
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  // Offers mirror (coupons flagged for the invoice)
  const [coupons, setCoupons] = useState([]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  // Inject scoped CSS once
  useEffect(() => {
    const id = 'settings-v3-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = SETTINGS_V3_CSS;
    document.head.appendChild(el);
  }, []);

  // First allowed section
  useEffect(() => {
    const firstAllowed = NAV.find((g) => g.subs.some((s) => permAllowed(s.perm)));
    if (!firstAllowed) return;
    const firstSub = firstAllowed.subs.find((s) => permAllowed(s.perm));
    setSec(firstAllowed.k);
    setSub(firstSub?.k || firstAllowed.subs[0].k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonUser?.userId]);

  // Load initial state from salon record
  useEffect(() => {
    if (!salon) return;
    const hoursDef = DAYS.reduce((a, d) => { a[d.toLowerCase()] = { open: true, start: '10:00', end: '20:00' }; return a; }, {});
    const next = {
      // Salon details
      name: salon.name || salon.salon_name || '',
      phone: salon.phone || '',
      email: salon.email || '',
      address: salon.address || '',
      city: salon.city || '',
      state: salon.state || '',
      pincode: salon.pincode || '',
      owner_name: salon.owner_name || '',
      description: salon.description || '',
      logo_url: salon.logo_url || '',
      // Hours
      business_hours: salon.business_hours || hoursDef,
      // Attendance
      attendance_method: salon.attendance_mode || salon.attendance_method || 'checkinout',
      shift_start: salon.shift_start || '10:00',
      shift_end: salon.shift_end || '20:00',
      grace_period_min: salon.grace_period_min ?? 15,
      half_day_max_hours: salon.half_day_max_hours ?? 4,
      min_hours_full_day: salon.min_hours_full_day ?? 8,
      overtime_after_hours: salon.overtime_after_hours ?? 9,
      auto_checkout: salon.auto_checkout ?? true,
      auto_checkout_time: salon.auto_checkout_time || '21:00',
      allow_self_checkin: salon.allow_self_checkin ?? true,
      geofence_required: salon.geofence_required ?? false,
      photo_on_checkin: salon.photo_on_checkin ?? false,
      admin_edit_past_attendance: salon.admin_edit_past_attendance ?? true,
      // Leave
      weekly_off: salon.weekly_off || 'Sunday',
      paid_leaves_per_year: salon.paid_leaves_per_year ?? 12,
      carry_forward_leaves: salon.carry_forward_leaves ?? false,
      holiday_calendar: salon.holiday_calendar || 'India',
      // Payroll
      salary_cycle: salon.salary_cycle || 'monthly_1',
      absent_deduction: salon.absent_deduction || 'pro_rata',
      incentive_rule: salon.incentive_rule || 'percent_over_target',
      incentive_percent: salon.incentive_percent ?? 10,
      monthly_target_per_stylist: salon.monthly_target_per_stylist ?? 120000,
      include_retail_in_incentive: salon.include_retail_in_incentive ?? true,
      // Login identity
      otp_login: salon.otp_login ?? true,
      require_pin_billing: salon.require_pin_billing ?? false,
      auto_logout_after_shift: salon.auto_logout_after_shift ?? true,
      // Services
      allow_barber_price_override: salon.allow_barber_price_override ?? true,
      show_barber_price_on_booking: salon.show_barber_price_on_booking ?? true,
      category_based_pricing: salon.category_based_pricing ?? false,
      // Tax
      is_gst_registered: salon.is_gst_registered ?? !!(salon.gstin && salon.gstin.trim()),
      gstin: salon.gstin || '',
      gst_rate: salon.gst_rate ?? 18,
      invoice_prefix: salon.invoice_prefix || 'INV-',
      next_invoice_no: salon.next_invoice_no ?? 1000,
      invoice_footer: salon.invoice_footer || '',
      prices_include_tax: salon.prices_include_tax ?? true,
      round_off_invoice: salon.round_off_invoice ?? true,
      // Invoice format & branding (new)
      signature_url: salon.signature_url || '',
      print_signature: salon.print_signature ?? true,
      signatory_label: salon.signatory_label || 'Authorised Signatory',
      title_mode: salon.title_mode || 'auto',
      show_place_of_supply: salon.show_place_of_supply ?? true,
      show_sac_column: salon.show_sac_column ?? true,
      sac_code: salon.sac_code || '999721',
      show_amount_in_words: salon.show_amount_in_words ?? true,
      show_discount_line: salon.show_discount_line ?? true,
      show_tip: salon.show_tip ?? true,
      show_payment_mode: salon.show_payment_mode ?? true,
      show_points: salon.show_points ?? true,
      show_wallet_balance: salon.show_wallet_balance ?? true,
      show_offers: salon.show_offers ?? true,
      offers_heading: salon.offers_heading || 'Just for you',
      max_offers: salon.max_offers ?? 4,
      show_qr: salon.show_qr ?? true,
      qr_type: salon.qr_type || 'link',
      qr_caption_title: salon.qr_caption_title || 'Scan for your digital copy',
      qr_caption_body: salon.qr_caption_body || 'Opens this invoice online — share, download or reprint anytime.',
      thank_you: salon.thank_you || `Thank you for visiting ${salon.salon_name || salon.name || 'us'} ✨`,
      footer_note: salon.footer_note || 'Payment received in full. Goods/services once rendered are non-refundable.',
      disclaimer: salon.disclaimer || 'This is a computer-generated invoice and does not require a physical signature.',
      // Lunch (backend already accepts these)
      lunch_start: salon.lunch_start || '',
      lunch_end: salon.lunch_end || '',
      // Booking
      online_booking_enabled: salon.online_booking_enabled ?? true,
      online_booking_paused: salon.online_booking_paused ?? false,
      online_paused_message: salon.online_paused_message || 'Salon is open — walk-ins welcome. Online booking is paused.',
      allow_guest_choose_barber: salon.allow_guest_choose_barber ?? true,
      require_advance_payment: salon.require_advance_payment ?? false,
      slot_duration_min: salon.slot_duration_min ?? 30,
      buffer_between_appts: salon.buffer_between_appts ?? 5,
      advance_booking_days: salon.advance_booking_days ?? 30,
      cancellation_window_hours: salon.cancellation_window_hours ?? 2,
      // Queue
      walkin_queue_enabled: salon.walkin_queue_enabled ?? true,
      show_live_wait_time: salon.show_live_wait_time ?? true,
      auto_assign_next_barber: salon.auto_assign_next_barber ?? false,
      average_service_time_min: salon.average_service_time_min ?? 30,
      max_queue_size: salon.max_queue_size ?? 15,
      // Payments
      gateway_test_mode: salon.gateway_test_mode ?? false,
      counter_cash: salon.counter_cash ?? true,
      counter_upi: salon.counter_upi ?? true,
      counter_card: salon.counter_card ?? true,
      counter_wallet: salon.counter_wallet ?? true,
      counter_pay_later: salon.counter_pay_later ?? false,
      // Notifications
      notif_appointment_reminders: salon.notif_appointment_reminders ?? true,
      notif_booking_confirmations: salon.notif_booking_confirmations ?? true,
      notif_review_requests: salon.notif_review_requests ?? true,
      notif_birthday_wishes: salon.notif_birthday_wishes ?? true,
      marketing_optin_required: salon.marketing_optin_required ?? true,
      notif_daily_summary_owner: salon.notif_daily_summary_owner ?? false,
      notif_late_checkin_alert: salon.notif_late_checkin_alert ?? true,
      notif_low_stock_alert: salon.notif_low_stock_alert ?? true,
      notif_new_booking_alert: salon.notif_new_booking_alert ?? true,
      // Per-channel notification flags (Phase 3.8): In-App + WhatsApp.
      // In-App ON by default for all events. WhatsApp OFF by default except
      // critical events (Booking confirmation, Invoice generation) which are ON.
      notif_appointment_reminders_inapp: salon.notif_appointment_reminders_inapp ?? true,
      notif_appointment_reminders_wa: salon.notif_appointment_reminders_wa ?? false,
      notif_booking_confirmations_inapp: salon.notif_booking_confirmations_inapp ?? true,
      notif_booking_confirmations_wa: salon.notif_booking_confirmations_wa ?? true,
      notif_invoice_generation_inapp: salon.notif_invoice_generation_inapp ?? true,
      notif_invoice_generation_wa: salon.notif_invoice_generation_wa ?? true,
      notif_review_requests_inapp: salon.notif_review_requests_inapp ?? true,
      notif_review_requests_wa: salon.notif_review_requests_wa ?? false,
      notif_birthday_wishes_inapp: salon.notif_birthday_wishes_inapp ?? true,
      notif_birthday_wishes_wa: salon.notif_birthday_wishes_wa ?? false,
      notif_daily_summary_owner_inapp: salon.notif_daily_summary_owner_inapp ?? true,
      notif_daily_summary_owner_wa: salon.notif_daily_summary_owner_wa ?? false,
      notif_late_checkin_alert_inapp: salon.notif_late_checkin_alert_inapp ?? true,
      notif_late_checkin_alert_wa: salon.notif_late_checkin_alert_wa ?? false,
      notif_low_stock_alert_inapp: salon.notif_low_stock_alert_inapp ?? true,
      notif_low_stock_alert_wa: salon.notif_low_stock_alert_wa ?? false,
      notif_new_booking_alert_inapp: salon.notif_new_booking_alert_inapp ?? true,
      notif_new_booking_alert_wa: salon.notif_new_booking_alert_wa ?? false,
    };
    setForm(next);
    setInitial(next);
  }, [salon]);

  // Load branches once
  useEffect(() => {
    (async () => {
      if (!salonId) return;
      try {
        const res = await axios.get(`${API}/salons/${salonId}/branches`, { headers: getAuthHeaders?.() || {} });
        setBranches(res.data?.branches || res.data || []);
      } catch (_) {}
    })();
  }, [salonId, getAuthHeaders]);

  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [newBranch, setNewBranch] = useState({ branch_name: '', branch_code: '', address: '', city: '', phone: '', email: '' });
  const [creatingBranch, setCreatingBranch] = useState(false);

  const createBranch = async () => {
    const name = (newBranch.branch_name || '').trim();
    if (!name) return toast.error('Branch name is required');
    setCreatingBranch(true);
    try {
      const res = await axios.post(
        `${API}/salons/${salonId}/branches`,
        {
          branch_name: name,
          branch_code: (newBranch.branch_code || '').trim() || null,
          address: newBranch.address || null,
          city: newBranch.city || null,
          phone: newBranch.phone || null,
          email: newBranch.email || null,
        },
        { headers: getAuthHeaders?.() || {} },
      );
      const b = res.data || {};
      setBranches((prev) => [...(prev || []), b]);
      setNewBranch({ branch_name: '', branch_code: '', address: '', city: '', phone: '', email: '' });
      setAddBranchOpen(false);
      toast.success('Branch created');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not create branch');
    } finally {
      setCreatingBranch(false);
    }
  };

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const toggle = (k) => set({ [k]: !form[k] });

  const save = useCallback(async (subset = null) => {
    if (!salonId) return;
    setSaving(true);
    try {
      const payload = subset ? Object.fromEntries(subset.map((k) => [k, form[k]])) : { ...form };
      // Backend uses `salon_name`, our form key is `name`
      if ('name' in payload) {
        payload.salon_name = payload.name;
        delete payload.name;
      }
      // Backend uses `attendance_mode`, our form key is `attendance_method`
      if ('attendance_method' in payload) {
        payload.attendance_mode = payload.attendance_method;
        delete payload.attendance_method;
      }
      const res = await axios.put(`${API}/salons/${salonId}`, payload, { headers: getAuthHeaders?.() || {} });
      const updated = res.data || {};
      setSalon?.(updated);
      setInitial((prev) => ({ ...prev, ...(subset ? Object.fromEntries(subset.map((k) => [k, form[k]])) : form) }));
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [salonId, form, getAuthHeaders, setSalon]);

  // ----- Invoice settings keys (persisted on the salon doc) -----
  const INVOICE_KEYS = [
    'is_gst_registered', 'gstin', 'gst_rate', 'invoice_prefix', 'next_invoice_no',
    'prices_include_tax', 'round_off_invoice', 'signature_url', 'print_signature',
    'signatory_label', 'title_mode', 'show_place_of_supply', 'show_sac_column', 'sac_code',
    'show_amount_in_words', 'show_discount_line', 'show_tip', 'show_payment_mode', 'show_points',
    'show_wallet_balance', 'show_offers', 'offers_heading', 'max_offers', 'show_qr', 'qr_type',
    'qr_caption_title', 'qr_caption_body', 'thank_you', 'footer_note', 'disclaimer',
  ];

  const openPreview = useCallback(async () => {
    if (!salonId) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const payload = Object.fromEntries(INVOICE_KEYS.map((k) => [k, form[k]]));
      const res = await axios.post(`${API}/salons/${salonId}/invoice-preview`, payload, {
        headers: getAuthHeaders?.() || {},
        responseType: 'text',
      });
      setPreviewHtml(res.data);
    } catch (err) {
      toast.error('Could not load preview');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, form, getAuthHeaders]);

  const loadCoupons = useCallback(async () => {
    if (!salonId) return;
    try {
      const res = await axios.get(`${API}/salons/${salonId}/coupons`, { headers: getAuthHeaders?.() || {} });
      setCoupons(Array.isArray(res.data?.coupons) ? res.data.coupons : []);
    } catch (_) { /* best-effort */ }
  }, [salonId, getAuthHeaders]);

  useEffect(() => {
    if (sec === 'invoice' && sub === 'offers') loadCoupons();
  }, [sec, sub, loadCoupons]);

  const toggleCouponInvoice = async (c) => {
    const next = !c.show_on_invoice;
    setCoupons((arr) => arr.map((x) => (x.id === c.id ? { ...x, show_on_invoice: next } : x)));
    try {
      await axios.put(`${API}/salons/${salonId}/coupons/${c.id}`, { ...c, show_on_invoice: next }, { headers: getAuthHeaders?.() || {} });
    } catch (err) {
      setCoupons((arr) => arr.map((x) => (x.id === c.id ? { ...x, show_on_invoice: !next } : x)));
      toast.error('Could not update');
    }
  };

  const currentGroup = useMemo(() => NAV.find((g) => g.k === sec) || NAV[0], [sec]);
  const currentSubConfig = useMemo(() => currentGroup.subs.find((s) => s.k === sub), [currentGroup, sub]);
  const currentAllowed = permAllowed(currentSubConfig?.perm);

  const go = (kSec, kSub) => {
    const grp = NAV.find((g) => g.k === kSec);
    if (!grp) return;
    const subCfg = grp.subs.find((s) => s.k === kSub);
    if (!permAllowed(subCfg?.perm)) return;
    setSec(kSec); setSub(kSub);
  };

  const RbacLock = () => (
    <div className="rbac-lock">
      <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      You don't have permission to view this section.
    </div>
  );

  // ---------- Sub-section renderers ----------
  const RENDERERS = {
    'business.details': () => (
      <>
        <SectionHeader title="Salon details" sub="Appears on invoices, booking links and WhatsApp messages." />
        <div className="block">
          <div className="logo-up">
            <div className="logo">
              {form.logo_url ? (
                <img src={form.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
              ) : (
                <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              )}
            </div>
            <div>
              <b style={{ fontSize: 14 }}>Salon logo</b>
              <p className="hint">PNG or JPG, up to 5 MB</p>
              <label className="btn-ghost" style={{ marginTop: 8, display: 'inline-flex' }}>
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {form.logo_url ? 'Change logo' : 'Upload'}
                <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={async (e) => {
                  const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
                  if (f.size > 5 * 1024 * 1024) return toast.error('Max 5 MB');
                  const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
                  set({ logo_url: dataUrl });
                }} data-testid="settings-logo-upload" />
              </label>
            </div>
          </div>
          <div className="grid2">
            <div className="field full"><label>Salon name <span className="req">*</span></label>
              <input value={form.name || ''} onChange={(e) => set({ name: e.target.value })} data-testid="setg-salon-name" /></div>
            <div className="field"><label>Phone</label>
              <input value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} /></div>
            <div className="field"><label>Email</label>
              <input value={form.email || ''} onChange={(e) => set({ email: e.target.value })} /></div>
            <div className="field full"><label>Address</label>
              <input value={form.address || ''} onChange={(e) => set({ address: e.target.value })} /></div>
            <div className="field"><label>City</label>
              <input value={form.city || ''} onChange={(e) => set({ city: e.target.value })} /></div>
            <div className="field"><label>State <span className="req">*</span></label>
              <select value={form.state || ''} onChange={(e) => set({ state: e.target.value })} data-testid="setg-salon-state">
                <option value="">Select State/UT…</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div className="field"><label>PIN code <span className="req">*</span></label>
              <input value={form.pincode || ''} maxLength={6} inputMode="numeric"
                onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                placeholder="6-digit PIN" data-testid="setg-salon-pincode" /></div>
            <div className="field"><label>Owner</label>
              <input value={form.owner_name || ''} onChange={(e) => set({ owner_name: e.target.value })} /></div>
            {(!form.state || !/^\d{6}$/.test(String(form.pincode || ''))) && (
              <div className="field full">
                <div style={{ background: '#FDF0DC', color: '#B45309', border: '1px solid #F6DFB8', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, fontWeight: 600 }}>
                  State and a valid 6-digit PIN code are required before you can place a Shop (Buy Inventory) order.
                </div>
              </div>
            )}
            <div className="field full"><label>About (booking page)</label>
              <textarea value={form.description || ''} onChange={(e) => set({ description: e.target.value })} /></div>
          </div>
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-details-save" />
        <div className="block" style={{ marginTop: 18, borderColor: '#F3C9C9', background: '#FEF6F6' }} data-testid="settings-delete-account">
          <h4 style={{ color: '#B42318' }}>Delete account</h4>
          <p className="bs">Permanently removes your account, business profile, staff, customer records and connected WhatsApp configuration held by SalonHub. This cannot be undone.</p>
          <p className="bs">See our <a href="/data-deletion" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--p, #6C4FE0)', fontWeight: 700 }}>Data Deletion policy</a>. Requests are actioned within 30 days.</p>
          <div style={{ marginTop: 10 }}>
            <button
              className="btn-ghost"
              data-testid="setg-delete-account-btn"
              style={{ color: '#B42318', borderColor: '#F3C9C9' }}
              onClick={() => {
                if (!window.confirm('Request permanent deletion of this salon account and all its data? Our team will verify and action this within 30 days.')) return;
                const sname = encodeURIComponent(form.name || 'my salon');
                const body = encodeURIComponent(`I request permanent deletion of my SalonHub account and all associated data.\n\nSalon: ${form.name || ''}\nSalon ID: ${salonId}\nRegistered phone: ${form.phone || ''}\nRegistered email: ${form.email || ''}`);
                window.location.href = `mailto:rohit@salonhub.in?subject=Data%20deletion%20request%20-%20${sname}&body=${body}`;
                toast.success('Opening your email to send the deletion request…');
              }}
            >
              <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              Delete account
            </button>
          </div>
        </div>
      </>
    ),

    'business.branches': () => (
      <>
        <SectionHeader title="Branches" sub="Staff, stock and reports are tracked per branch." />
        <div className="block">
          <h4 className="row-btn">Locations
            <button className="btn-primary" onClick={() => setAddBranchOpen((v) => !v)} data-testid="setg-add-branch-btn">
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {addBranchOpen ? 'Close' : 'Add branch'}
            </button>
          </h4>
          <p className="bs">Manage all salon locations.</p>

          {addBranchOpen && (
            <div className="block" style={{ marginTop: 10, background: '#FDFAFC' }}>
              <h4>Create new branch</h4>
              <div className="grid2">
                <div className="field"><label>Branch name <span className="req">*</span></label>
                  <input
                    value={newBranch.branch_name}
                    placeholder="e.g. Trimmy's — Whitefield"
                    onChange={(e) => setNewBranch({ ...newBranch, branch_name: e.target.value })}
                    data-testid="setg-new-branch-name"
                  />
                </div>
                <div className="field"><label>Branch code</label>
                  <input
                    value={newBranch.branch_code}
                    placeholder="e.g. BLR-02"
                    onChange={(e) => setNewBranch({ ...newBranch, branch_code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="field full"><label>Address</label>
                  <input value={newBranch.address} onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })} />
                </div>
                <div className="field"><label>City</label>
                  <input value={newBranch.city} onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })} />
                </div>
                <div className="field"><label>Phone</label>
                  <input value={newBranch.phone} onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })} />
                </div>
                <div className="field"><label>Email</label>
                  <input value={newBranch.email} type="email" onChange={(e) => setNewBranch({ ...newBranch, email: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button className="btn-ghost" onClick={() => setAddBranchOpen(false)} disabled={creatingBranch}>Cancel</button>
                <button className="btn-primary" onClick={createBranch} disabled={creatingBranch} data-testid="setg-create-branch-save">
                  {creatingBranch ? 'Creating…' : 'Create branch'}
                </button>
              </div>
            </div>
          )}

          {branches.length === 0 && (
            <div className="list-row">
              <div className="li"><svg viewBox="0 0 24 24"><path d="M9 22V12h6v10"/><path d="M2 10.6L12 2l10 8.6"/></svg></div>
              <div className="ld"><b>{form.name || 'Main Branch'}</b><span>{form.address || form.city || 'Primary location'}</span></div>
              <span className="status-pill ok">Active</span>
            </div>
          )}
          {branches.map((b) => (
            <div className="list-row" key={b.id || b.branch_id || b.name || b.branch_name}>
              <div className="li"><svg viewBox="0 0 24 24"><path d="M9 22V12h6v10"/><path d="M2 10.6L12 2l10 8.6"/></svg></div>
              <div className="ld"><b>{b.branch_name || b.name || 'Branch'}</b><span>{b.address || b.city || ''}{b.staff_count != null ? ` · ${b.staff_count} staff` : ''}{b.branch_code ? ` · ${b.branch_code}` : ''}</span></div>
              <span className={`status-pill ${b.status === 'inactive' || b.is_active === false ? '' : 'ok'}`}>{b.status === 'inactive' || b.is_active === false ? 'Inactive' : 'Active'}</span>
            </div>
          ))}
        </div>
      </>
    ),

    'business.hours': () => (
      <>
        <SectionHeader title="Business hours" sub="Drives online booking slots and the queue." />
        <div className="block">
          {DAYS.map((d) => {
            const key = d.toLowerCase();
            const rec = form.business_hours?.[key] || { open: true, start: '10:00', end: '20:00' };
            const upd = (patch) => set({ business_hours: { ...(form.business_hours || {}), [key]: { ...rec, ...patch } } });
            return (
              <div className="hour-row" key={d}>
                <div className="dow">{d.slice(0, 3)}</div>
                <button type="button" className={`toggle ${rec.open ? 'on' : ''}`} onClick={() => upd({ open: !rec.open })} data-testid={`setg-hours-toggle-${key}`} />
                <div className="times">
                  {rec.open ? (
                    <>
                      <input type="time" value={rec.start} onChange={(e) => upd({ start: e.target.value })} />
                      <span className="to">to</span>
                      <input type="time" value={rec.end} onChange={(e) => upd({ end: e.target.value })} />
                    </>
                  ) : <span className="closed">Closed</span>}
                </div>
              </div>
            );
          })}
        </div>
        <SaveRow onClick={() => save(['business_hours'])} disabled={saving || !dirty} testid="setg-hours-save" />
      </>
    ),

    'staff.method': () => {
      const ci = form.attendance_method === 'checkinout';
      const disabledStyle = !ci ? { opacity: 0.55, pointerEvents: 'none' } : {};
      return (
      <>
        <SectionHeader title="Attendance method & rules" sub="The single source that drives how the Staff page marks attendance." />
        <div className="block">
          <h4>How is attendance recorded?</h4>
          <p className="bs">The Staff page attendance drawer changes to match this choice.</p>
          <div className="method-pick">
            {[
              { m: 'checkinout', title: 'Check-in / Check-out', desc: 'Staff clock in and out. Drawer shows time fields per date + A / P / H / Holiday / Leave.',
                ico: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> },
              { m: 'service_completion', title: 'Service completion', desc: 'Attendance from services completed. Drawer shows A / P / H / Holiday / Leave only.',
                ico: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></> },
            ].map((o) => (
              <button key={o.m} type="button" className={`method ${form.attendance_method === o.m ? 'on' : ''}`}
                onClick={() => set({ attendance_method: o.m })} data-testid={`setg-att-method-${o.m}`}>
                <span className="rd" />
                <div className="mtop"><div className="mi"><svg viewBox="0 0 24 24">{o.ico}</svg></div><b>{o.title}</b></div>
                <p>{o.desc}</p>
              </button>
            ))}
          </div>
          <div className="note-box">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            {ci
              ? 'Check-in / check-out rules below are active. Changes save on the button at the bottom.'
              : 'Rules below are disabled because Service completion is selected. Pick Check-in / Check-out to edit them.'}
          </div>
        </div>

        <div className="block" style={disabledStyle}>
          <h4>Shift &amp; timing</h4><p className="bs">Used to auto-flag late arrivals, half-days and overtime.</p>
          <div className="grid3">
            <div className="field"><label>Shift start</label><input type="time" value={form.shift_start || ''} disabled={!ci} onChange={(e) => set({ shift_start: e.target.value })} /></div>
            <div className="field"><label>Shift end</label><input type="time" value={form.shift_end || ''} disabled={!ci} onChange={(e) => set({ shift_end: e.target.value })} /></div>
            <div className="field"><label>Grace period (min)</label><input type="number" value={form.grace_period_min ?? 0} disabled={!ci} onChange={(e) => set({ grace_period_min: Number(e.target.value) || 0 })} /><span className="hint">Late after this</span></div>
            <div className="field"><label>Half-day if under (hrs)</label><input type="number" value={form.half_day_max_hours ?? 0} disabled={!ci} onChange={(e) => set({ half_day_max_hours: Number(e.target.value) || 0 })} /></div>
            <div className="field"><label>Full day minimum (hrs)</label><input type="number" value={form.min_hours_full_day ?? 0} disabled={!ci} onChange={(e) => set({ min_hours_full_day: Number(e.target.value) || 0 })} /></div>
            <div className="field"><label>Overtime after (hrs)</label><input type="number" value={form.overtime_after_hours ?? 0} disabled={!ci} onChange={(e) => set({ overtime_after_hours: Number(e.target.value) || 0 })} /></div>
          </div>
          <h4 style={{ marginTop: 20 }}>Lunch break</h4>
          <p className="bs">Deducted from worked hours when computing full-day / half-day.</p>
          <div className="grid3">
            <div className="field"><label>Lunch start</label>
              <input type="time" value={form.lunch_start || ''} onChange={(e) => set({ lunch_start: e.target.value })} data-testid="setg-lunch-start" /></div>
            <div className="field"><label>Lunch end</label>
              <input type="time" value={form.lunch_end || ''} onChange={(e) => set({ lunch_end: e.target.value })} data-testid="setg-lunch-end" /></div>
            <div className="field"><label>Duration</label>
              <input value={(() => {
                if (!form.lunch_start || !form.lunch_end) return '—';
                const [a, b] = [form.lunch_start, form.lunch_end].map((t) => {
                  const [h, m] = t.split(':').map(Number); return h * 60 + m;
                });
                const mins = b - a;
                if (mins <= 0) return '—';
                return `${mins} min`;
              })()} disabled /></div>
          </div>
        </div>
        <div className="block" style={disabledStyle}>
          <h4>Automation &amp; control</h4><p className="bs">How check-ins are captured.</p>
          <OptRow label="Auto check-out" hint="Close open sessions at a fixed time" on={!!form.auto_checkout} onChange={() => ci && toggle('auto_checkout')} testid="setg-auto-checkout" />
          {form.auto_checkout && (
            <div className="grid3" style={{ margin: '12px 0' }}>
              <div className="field"><label>Auto check-out time</label><input type="time" value={form.auto_checkout_time || ''} disabled={!ci} onChange={(e) => set({ auto_checkout_time: e.target.value })} /></div>
            </div>
          )}
          <OptRow label="Allow staff self check-in" hint="Staff can clock in from their own login" on={!!form.allow_self_checkin} onChange={() => ci && toggle('allow_self_checkin')} />
          <OptRow label="Require geo-fence" hint="Only allow check-in at the salon location" on={!!form.geofence_required} onChange={() => ci && toggle('geofence_required')} />
          <OptRow label="Photo on check-in" hint="Capture a selfie when clocking in" on={!!form.photo_on_checkin} onChange={() => ci && toggle('photo_on_checkin')} />
          <OptRow label="Admin can edit past attendance" hint="Owner/manager can backdate records" on={!!form.admin_edit_past_attendance} onChange={() => toggle('admin_edit_past_attendance')} />
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-method-save" />
      </>
      );
    },    'staff.leave': () => (
      <>
        <SectionHeader title="Leave & holidays" sub="Weekly offs, holiday calendar and leave policy." />
        <div className="block">
          <h4>Weekly off &amp; holidays</h4><p className="bs">Auto-marked on the attendance drawer.</p>
          <div className="grid2">
            <div className="field"><label>Weekly off</label>
              <select value={form.weekly_off || 'Sunday'} onChange={(e) => set({ weekly_off: e.target.value })}>
                <option>Sunday</option><option>Monday</option><option>Rotational</option><option>None</option>
              </select></div>
            <div className="field"><label>Paid leaves / year</label>
              <input type="number" value={form.paid_leaves_per_year ?? 0} onChange={(e) => set({ paid_leaves_per_year: Number(e.target.value) || 0 })} /></div>
            <div className="field"><label>Carry forward unused leaves</label>
              <select value={form.carry_forward_leaves ? 'Yes' : 'No'} onChange={(e) => set({ carry_forward_leaves: e.target.value === 'Yes' })}>
                <option>No</option><option>Yes</option>
              </select></div>
            <div className="field"><label>Holiday calendar</label>
              <select value={form.holiday_calendar || 'India'} onChange={(e) => set({ holiday_calendar: e.target.value })}>
                <option value="India">India — national holidays</option>
                <option value="Custom">Custom</option>
              </select></div>
          </div>
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-leave-save" />

        <div className="block" style={{ marginTop: 18 }}>
          <h4>Leave types</h4>
          <p className="bs">Add, edit or disable custom leave types (Casual, Sick, etc.) with accrual and year-end rules. These types show up on the staff attendance drawer.</p>
          <div style={{ marginTop: 12 }}>
            <LeaveConfigTab salonId={salonId} authHeaders={getAuthHeaders} />
          </div>
        </div>
      </>
    ),

    'staff.payroll': () => (
      <>
        <SectionHeader title="Payroll & incentives" sub="Cycle and deductions, plus the Employee Reward Plan used when marking salary paid." />
        <div className="block">
          <h4>Salary</h4><p className="bs">Cycle and deductions.</p>
          <div className="grid2">
            <div className="field"><label>Salary cycle</label>
              <select value={form.salary_cycle || 'monthly_1'} onChange={(e) => set({ salary_cycle: e.target.value })}>
                <option value="monthly_1">Monthly (paid on 1st)</option>
                <option value="monthly_7">Monthly (paid on 7th)</option>
                <option value="weekly">Weekly</option>
              </select></div>
            <div className="field"><label>Absent deduction</label>
              <select value={form.absent_deduction || 'pro_rata'} onChange={(e) => set({ absent_deduction: e.target.value })}>
                <option value="pro_rata">Pro-rata per day</option>
                <option value="none">None</option>
              </select></div>
          </div>
          <div className="save-row" style={{ marginTop: 12 }}>
            <button className="btn-primary" onClick={() => save(['salary_cycle', 'absent_deduction'])} disabled={saving} data-testid="setg-payroll-cycle-save">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Save salary rules
            </button>
          </div>
        </div>
        <div className="block reward-plan-host">
          <EmployeeRewardPlan salonId={salonId} getAuthHeaders={getAuthHeaders} isAdmin={isAdmin} />
        </div>
      </>
    ),

    'services.barber': () => (
      <>
        <SectionHeader title="Per-barber pricing" sub="Each barber can have their own price for a service." />
        <div className="block">
          <h4>How it works</h4>
          <p className="bs">Set on the Staff page → select barber → Services &amp; pricing.</p>
          <div className="note-box">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <span>Tick the services a barber performs and optionally override the salon price (e.g. a Master charges ₹400 for a haircut vs the ₹300 base). Only ticked services are bookable with that barber.</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <OptRow label="Allow per-barber price override" hint="Barbers can have custom prices" on={!!form.allow_barber_price_override} onChange={() => toggle('allow_barber_price_override')} />
            <OptRow label="Show barber price on booking page" hint="Guests see the barber-specific price" on={!!form.show_barber_price_on_booking} onChange={() => toggle('show_barber_price_on_booking')} />
            <OptRow label="Category-based default pricing" hint="Auto-set price by Junior / Star / Master" on={!!form.category_based_pricing} onChange={() => toggle('category_based_pricing')} />
          </div>
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-barber-price-save" />
      </>
    ),

    'invoice.tax': () => (
      <>
        <div className="bhead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div><h3>Tax &amp; numbering</h3><p>GST-ready invoices for India. Preview reflects unsaved changes.</p></div>
          <button className="btn-ghost" onClick={openPreview} data-testid="invoice-preview-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flex: 'none' }}>
            <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Preview invoice
          </button>
        </div>
        <div className="block">
          <OptRow
            label="Salon is GST registered"
            hint='Off → title becomes "Invoice", GST rows + SAC hidden, "Taxable value" → "Value".'
            on={!!form.is_gst_registered}
            onChange={() => toggle('is_gst_registered')}
            testid="setg-gst-registered"
          />
          {form.is_gst_registered && (
            <div className="grid2" style={{ marginTop: 12 }}>
              <div className="field"><label>GSTIN <span className="req">*</span></label>
                <input
                  value={form.gstin || ''}
                  placeholder="15-digit GSTIN"
                  onChange={(e) => set({ gstin: e.target.value.toUpperCase() })}
                  data-testid="setg-gstin"
                />
                {form.is_gst_registered && !((form.gstin || '').trim()) && (
                  <span className="idnote" style={{ color: 'var(--red)' }}>
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                    GSTIN is required when the salon is GST-registered
                  </span>
                )}
              </div>
              <div className="field"><label>Default GST rate</label>
                <select value={form.gst_rate ?? 18} onChange={(e) => set({ gst_rate: Number(e.target.value) })}>
                  <option value={28}>28%</option>
                  <option value={18}>18%</option>
                  <option value={12}>12%</option>
                  <option value={5}>5%</option>
                  <option value={0}>0%</option>
                </select></div>
            </div>
          )}
          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="field"><label>Invoice prefix</label><input value={form.invoice_prefix || ''} onChange={(e) => set({ invoice_prefix: e.target.value })} data-testid="setg-invoice-prefix" /></div>
            <div className="field"><label>Next invoice no.</label><input type="number" value={form.next_invoice_no ?? 1000} onChange={(e) => set({ next_invoice_no: Number(e.target.value) || 0 })} data-testid="setg-next-invoice-no" /></div>
          </div>
          <div style={{ marginTop: 8 }}>
            {form.is_gst_registered && (
              <OptRow label="Prices include tax" hint="Back-calculate base from gross" on={!!form.prices_include_tax} onChange={() => toggle('prices_include_tax')} testid="setg-prices-incl-tax" />
            )}
            <OptRow label="Round off invoice total" hint="Round to nearest rupee" on={!!form.round_off_invoice} onChange={() => toggle('round_off_invoice')} testid="setg-round-off" />
          </div>
        </div>
        <SaveRow
          onClick={() => {
            if (form.is_gst_registered && !((form.gstin || '').trim())) {
              toast.error('GSTIN is required when GST-registered');
              return;
            }
            save();
          }}
          disabled={saving || !dirty}
          testid="setg-tax-save"
        />
      </>
    ),

    'invoice.format': () => (
      <>
        <div className="bhead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div><h3>Invoice format &amp; branding</h3><p>Everything printed on a customer invoice — logo is shared from Business profile.</p></div>
          <button className="btn-ghost" onClick={openPreview} data-testid="invoice-preview-btn-2"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flex: 'none' }}>
            <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Preview invoice
          </button>
        </div>
        <div className="block">
          {/* Logo reference (read-only) */}
          <div className="logo-up" style={{ marginBottom: 6 }}>
            <div className="logo">
              {form.logo_url ? (
                <img src={form.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 14 }} />
              ) : (
                <svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/></svg>
              )}
            </div>
            <div>
              <b style={{ fontSize: 14 }}>Salon logo</b>
              <p className="hint">Using the logo uploaded in Business profile. One upload, one source.</p>
              <button className="btn-ghost" style={{ marginTop: 8, display: 'inline-flex' }} onClick={() => go('business', 'details')} data-testid="invoice-logo-link">
                Change in Business profile →
              </button>
            </div>
          </div>
          <div className="grid2" style={{ marginTop: 8 }}>
            <div className="field"><label>Invoice title</label>
              <select value={form.title_mode || 'auto'} onChange={(e) => set({ title_mode: e.target.value })} data-testid="setg-title-mode">
                <option value="auto">Auto — Tax Invoice / Invoice</option>
                <option value="invoice">Always "Invoice"</option>
                <option value="tax">Always "Tax Invoice"</option>
              </select></div>
            <div className="field"><label>Signatory label</label>
              <input value={form.signatory_label || ''} onChange={(e) => set({ signatory_label: e.target.value })} data-testid="setg-signatory-label" /></div>
          </div>
          {/* Signature upload */}
          <div className="field full" style={{ marginTop: 12 }}>
            <label>Authorised signature</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 120, height: 54, border: '1px dashed var(--line, #e0dbe8)', borderRadius: 10, display: 'grid', placeItems: 'center', background: '#fff', overflow: 'hidden' }}>
                {form.signature_url ? <img src={form.signature_url} alt="signature" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 11, color: '#9a93b5' }}>No signature</span>}
              </div>
              <div>
                <label className="btn-ghost" style={{ display: 'inline-flex' }}>
                  Upload signature
                  <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={async (e) => {
                    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
                    if (f.size > 1024 * 1024) return toast.error('Max 1 MB');
                    const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
                    set({ signature_url: dataUrl });
                  }} data-testid="setg-signature-upload" />
                </label>
                <p className="hint" style={{ marginTop: 4 }}>PNG on transparent/white · prints above the label</p>
                {form.signature_url && <button className="btn-ghost" style={{ marginTop: 6 }} onClick={() => set({ signature_url: '' })} data-testid="setg-signature-remove">Remove</button>}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 6 }}>
            <OptRow label="Print signature" hint="Off → blank signature line" on={!!form.print_signature} onChange={() => toggle('print_signature')} testid="setg-print-signature" />
            {form.is_gst_registered && <OptRow label="Show SAC column" on={!!form.show_sac_column} onChange={() => toggle('show_sac_column')} testid="setg-show-sac" />}
            {form.is_gst_registered && <OptRow label="Show place of supply" hint="GST invoices only" on={!!form.show_place_of_supply} onChange={() => toggle('show_place_of_supply')} testid="setg-show-pos" />}
            <OptRow label="Amount in words" on={!!form.show_amount_in_words} onChange={() => toggle('show_amount_in_words')} testid="setg-show-words" />
            <OptRow label="Show tip" on={!!form.show_tip} onChange={() => toggle('show_tip')} testid="setg-show-tip" />
            <OptRow label="Show loyalty points & wallet" on={!!form.show_points} onChange={() => set({ show_points: !form.show_points, show_wallet_balance: !form.show_points })} testid="setg-show-loyalty" />
          </div>
        </div>
        {form.is_gst_registered && (
          <div className="field" style={{ marginTop: 4 }}>
            <label>Default SAC / HSN code</label>
            <input value={form.sac_code || ''} onChange={(e) => set({ sac_code: e.target.value })} data-testid="setg-sac-code" style={{ maxWidth: 220 }} />
          </div>
        )}
        {/* QR */}
        <div className="block" style={{ marginTop: 14 }}>
          <div className="bh" style={{ fontWeight: 800, marginBottom: 8 }}>QR code</div>
          <OptRow label="Show QR code" on={!!form.show_qr} onChange={() => toggle('show_qr')} testid="setg-show-qr" />
          {form.show_qr && (
            <div className="grid2" style={{ marginTop: 10 }}>
              <div className="field"><label>QR encodes</label>
                <select value={form.qr_type || 'link'} onChange={(e) => set({ qr_type: e.target.value })} data-testid="setg-qr-type">
                  <option value="link">Digital invoice link</option>
                  <option value="upi">UPI pay link</option>
                </select></div>
              <div className="field"><label>Caption title</label>
                <input value={form.qr_caption_title || ''} onChange={(e) => set({ qr_caption_title: e.target.value })} data-testid="setg-qr-title" /></div>
            </div>
          )}
        </div>
        {/* Footer & legal text */}
        <div className="block" style={{ marginTop: 14 }}>
          <div className="bh" style={{ fontWeight: 800, marginBottom: 8 }}>Footer &amp; legal text</div>
          <div className="grid2">
            <div className="field full"><label>Thank-you message</label><input value={form.thank_you || ''} onChange={(e) => set({ thank_you: e.target.value })} data-testid="setg-thank-you" /></div>
            <div className="field full"><label>Footer note</label><textarea value={form.footer_note || ''} maxLength={300} onChange={(e) => set({ footer_note: e.target.value })} data-testid="setg-footer-note" /></div>
            <div className="field full"><label>Disclaimer</label><textarea value={form.disclaimer || ''} maxLength={300} onChange={(e) => set({ disclaimer: e.target.value })} data-testid="setg-disclaimer" /></div>
          </div>
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-format-save" />
      </>
    ),

    'invoice.offers': () => (
      <>
        <div className="bhead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div><h3>Offers on invoice</h3><p>Chosen in Marketing — flagged offers appear at the invoice foot.</p></div>
          <button className="btn-ghost" onClick={openPreview} data-testid="invoice-preview-btn-3"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flex: 'none' }}>
            <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Preview invoice
          </button>
        </div>
        <div className="block">
          <div className="mk-note" style={{ display: 'flex', gap: 10, background: '#f7f6fc', border: '1px solid #eeecf7', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#6b6489', marginBottom: 12 }}>
            <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, flex: 'none', fill: 'none', stroke: '#6C4FE0', strokeWidth: 2 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <div>Tick <b>"Show on invoice"</b> on any coupon/offer below (or in Marketing → Offers &amp; Perks). Flagged offers appear at the invoice foot, capped at <b>{form.max_offers ?? 4}</b>.</div>
          </div>
          <OptRow label="Show offers block on invoice" on={!!form.show_offers} onChange={() => toggle('show_offers')} testid="setg-show-offers" />
          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="field"><label>Offers heading</label><input value={form.offers_heading || ''} onChange={(e) => set({ offers_heading: e.target.value })} data-testid="setg-offers-heading" /></div>
            <div className="field"><label>Max offers (1–6)</label><input type="number" min={1} max={6} value={form.max_offers ?? 4} onChange={(e) => set({ max_offers: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })} data-testid="setg-max-offers" /></div>
          </div>
          <div style={{ marginTop: 14 }} data-testid="invoice-offers-mirror">
            {coupons.length === 0 ? (
              <div className="hint" style={{ padding: '8px 0' }}>No coupons yet. Create them in Marketing → Offers &amp; Perks.</div>
            ) : coupons.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid #eeecf7', borderRadius: 10, marginBottom: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 12, background: '#ece7fb', color: '#5b3fd1', padding: '4px 8px', borderRadius: 6, fontFamily: 'ui-monospace,monospace' }}>{c.code}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{c.title}</div>
                  {c.description && <div className="hint" style={{ fontSize: 11.5 }}>{c.description}</div>}
                </div>
                <OptRow label="Show on invoice" on={!!c.show_on_invoice} onChange={() => toggleCouponInvoice(c)} testid={`coupon-invoice-toggle-${c.id}`} />
              </div>
            ))}
          </div>
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-offers-save" />
      </>
    ),

    'booking.online': () => (
      <>
        <SectionHeader title="Online booking" sub="Booking link, QR and slot rules." />
        <div className="block">
          <OptRow label="Online booking" hint="Guests can book via link / QR" on={!!form.online_booking_enabled} onChange={() => toggle('online_booking_enabled')} testid="setg-online-booking" />
          <OptRow
            label="Pause online booking (walk-in only)"
            hint="Salon stays visible online but online booking is stopped and guests see a walk-in message"
            on={!!form.online_booking_paused}
            onChange={() => toggle('online_booking_paused')}
            testid="setg-online-paused"
          />
          {form.online_booking_paused && (
            <div className="field" style={{ marginTop: 10 }}>
              <label>Message shown to guests while paused</label>
              <input
                value={form.online_paused_message || ''}
                placeholder="Salon is open — walk-ins welcome…"
                onChange={(e) => set({ online_paused_message: e.target.value })}
                data-testid="setg-online-paused-msg"
              />
            </div>
          )}
          <OptRow label="Allow guest to choose barber" hint="Show barber selection on booking" on={!!form.allow_guest_choose_barber} onChange={() => toggle('allow_guest_choose_barber')} />
          <OptRow label="Require advance payment" hint="Collect payment at booking" on={!!form.require_advance_payment} onChange={() => toggle('require_advance_payment')} />
          <div className="grid2" style={{ marginTop: 14 }}>
            <div className="field"><label>Default slot duration</label>
              <select value={form.slot_duration_min ?? 30} onChange={(e) => set({ slot_duration_min: Number(e.target.value) })}>
                <option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option>
              </select></div>
            <div className="field"><label>Buffer between appointments</label>
              <select value={form.buffer_between_appts ?? 0} onChange={(e) => set({ buffer_between_appts: Number(e.target.value) })}>
                <option value={0}>0 min</option><option value={5}>5 min</option><option value={10}>10 min</option>
              </select></div>
            <div className="field"><label>Advance booking window</label>
              <select value={form.advance_booking_days ?? 30} onChange={(e) => set({ advance_booking_days: Number(e.target.value) })}>
                <option value={15}>15 days</option><option value={30}>30 days</option><option value={60}>60 days</option>
              </select></div>
            <div className="field"><label>Cancellation window</label>
              <select value={form.cancellation_window_hours ?? 2} onChange={(e) => set({ cancellation_window_hours: Number(e.target.value) })}>
                <option value={2}>2 hours before</option><option value={4}>4 hours before</option><option value={24}>24 hours before</option>
              </select></div>
          </div>
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-booking-save" />
      </>
    ),

    'booking.queue': () => (
      <>
        <SectionHeader title="Walk-in queue" sub="Live queue behaviour at the salon." />
        <div className="block">
          <OptRow label="Walk-in queue" hint="Front desk can add walk-ins" on={!!form.walkin_queue_enabled} onChange={() => toggle('walkin_queue_enabled')} />
          <OptRow label="Show live wait time to guests" hint="Publish estimated wait on the QR page" on={!!form.show_live_wait_time} onChange={() => toggle('show_live_wait_time')} />
          <OptRow label="Auto-assign next free barber" hint="Queue picks the first available" on={!!form.auto_assign_next_barber} onChange={() => toggle('auto_assign_next_barber')} />
          <div className="grid2" style={{ marginTop: 14 }}>
            <div className="field"><label>Average service time (min)</label>
              <input type="number" value={form.average_service_time_min ?? 30} onChange={(e) => set({ average_service_time_min: Number(e.target.value) || 0 })} /></div>
            <div className="field"><label>Max queue size</label>
              <input type="number" value={form.max_queue_size ?? 15} onChange={(e) => set({ max_queue_size: Number(e.target.value) || 0 })} /></div>
          </div>
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-queue-save" />
      </>
    ),

    'payments.gateway': () => (
      <>
        <SectionHeader title="Payment gateway" sub="Online payments and wallet top-ups." />
        <div className="block">
          <div className="list-row">
            <div className="li"><svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
            <div className="ld"><b>Cashfree</b><span>UPI · Cards · Netbanking</span></div>
            <span className={`status-pill ${salon?.cashfree_configured ? 'ok' : ''}`}>{salon?.cashfree_configured ? 'Connected' : 'Not connected'}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <OptRow label="Test mode" hint="Use sandbox keys" on={!!form.gateway_test_mode} onChange={() => toggle('gateway_test_mode')} />
          </div>
        </div>
        <SaveRow onClick={() => save(['gateway_test_mode'])} disabled={saving || !dirty} testid="setg-gateway-save" />
      </>
    ),

    'payments.counter': () => (
      <>
        <SectionHeader title="Counter methods" sub="Payments accepted at checkout." />
        <div className="block">
          <OptRow label="Cash" hint="Accept cash at counter" on={!!form.counter_cash} onChange={() => toggle('counter_cash')} testid="setg-counter-cash" />
          <OptRow label="UPI" hint="QR / UPI ID at counter" on={!!form.counter_upi} onChange={() => toggle('counter_upi')} />
          <OptRow label="Card" hint="Card machine" on={!!form.counter_card} onChange={() => toggle('counter_card')} />
          <OptRow label="Wallet" hint="Guest prepaid wallet" on={!!form.counter_wallet} onChange={() => toggle('counter_wallet')} />
          <OptRow label="Pay later" hint="Allow unpaid invoices" on={!!form.counter_pay_later} onChange={() => toggle('counter_pay_later')} />
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-counter-save" />
      </>
    ),

    'payments.wallet': () => (
      <>
        <SectionHeader title="Marketing wallet" sub="Prepaid balance for WhatsApp / SMS / Email." />
        <div className="block">
          <h4>Wallet</h4>
          <p className="bs">Actual-cost billing — first recharge activates marketing.</p>
          <div className="list-row">
            <div className="li"><svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
            <div className="ld"><b>Balance</b><span>{salon?.marketing_wallet_auto_recharge ? `Auto-recharge on · below ₹${salon?.marketing_wallet_recharge_threshold || 200}` : 'Auto-recharge off'}</span></div>
            <span className="tag">₹{Number(salon?.marketing_wallet_balance || 0).toLocaleString('en-IN')}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => toast.info('Open Marketing tab to manage the wallet')}>
              <svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>Open marketing wallet
            </button>
          </div>
        </div>
      </>
    ),

    'notif.guest': () => (
      <>
        <SectionHeader title="Guest messages" sub="Automatic messages to customers. Toggle In-App and WhatsApp per event." />
        <div className="block">
          <NotifChannelRow label="Appointment reminders" hint="24h + 2h before"
            inApp={!!form.notif_appointment_reminders_inapp} wa={!!form.notif_appointment_reminders_wa}
            onToggleInApp={() => toggle('notif_appointment_reminders_inapp')} onToggleWa={() => toggle('notif_appointment_reminders_wa')}
            testid="setg-notif-appt-reminders" />
          <NotifChannelRow label="Booking confirmation" hint="On booking & checkout"
            inApp={!!form.notif_booking_confirmations_inapp} wa={!!form.notif_booking_confirmations_wa}
            onToggleInApp={() => toggle('notif_booking_confirmations_inapp')} onToggleWa={() => toggle('notif_booking_confirmations_wa')}
            testid="setg-notif-booking-confirm" />
          <NotifChannelRow label="Invoice generation" hint="Send invoice after checkout"
            inApp={!!form.notif_invoice_generation_inapp} wa={!!form.notif_invoice_generation_wa}
            onToggleInApp={() => toggle('notif_invoice_generation_inapp')} onToggleWa={() => toggle('notif_invoice_generation_wa')}
            testid="setg-notif-invoice" />
          <NotifChannelRow label="Review requests" hint="Sent after checkout"
            inApp={!!form.notif_review_requests_inapp} wa={!!form.notif_review_requests_wa}
            onToggleInApp={() => toggle('notif_review_requests_inapp')} onToggleWa={() => toggle('notif_review_requests_wa')}
            testid="setg-notif-review" />
          <NotifChannelRow label="Birthday & anniversary wishes" hint="With an offer"
            inApp={!!form.notif_birthday_wishes_inapp} wa={!!form.notif_birthday_wishes_wa}
            onToggleInApp={() => toggle('notif_birthday_wishes_inapp')} onToggleWa={() => toggle('notif_birthday_wishes_wa')}
            testid="setg-notif-birthday" />
          <OptRow label="Marketing opt-in required" hint="Only message guests who opted in" on={!!form.marketing_optin_required} onChange={() => toggle('marketing_optin_required')} />
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-notif-guest-save" />
      </>
    ),

    'notif.staffn': () => (
      <>
        <SectionHeader title="Staff & owner alerts" sub="Internal notifications. Toggle In-App and WhatsApp per event." />
        <div className="block">
          <NotifChannelRow label="Daily summary to owner" hint="End-of-day revenue & attendance"
            inApp={!!form.notif_daily_summary_owner_inapp} wa={!!form.notif_daily_summary_owner_wa}
            onToggleInApp={() => toggle('notif_daily_summary_owner_inapp')} onToggleWa={() => toggle('notif_daily_summary_owner_wa')}
            testid="setg-notif-daily-summary" />
          <NotifChannelRow label="Late check-in alert" hint="Notify owner when staff is late"
            inApp={!!form.notif_late_checkin_alert_inapp} wa={!!form.notif_late_checkin_alert_wa}
            onToggleInApp={() => toggle('notif_late_checkin_alert_inapp')} onToggleWa={() => toggle('notif_late_checkin_alert_wa')}
            testid="setg-notif-late-checkin" />
          <NotifChannelRow label="Low stock alert" hint="When inventory hits reorder level"
            inApp={!!form.notif_low_stock_alert_inapp} wa={!!form.notif_low_stock_alert_wa}
            onToggleInApp={() => toggle('notif_low_stock_alert_inapp')} onToggleWa={() => toggle('notif_low_stock_alert_wa')}
            testid="setg-notif-low-stock" />
          <NotifChannelRow label="New booking alert to barber" hint="Alert the assigned barber"
            inApp={!!form.notif_new_booking_alert_inapp} wa={!!form.notif_new_booking_alert_wa}
            onToggleInApp={() => toggle('notif_new_booking_alert_inapp')} onToggleWa={() => toggle('notif_new_booking_alert_wa')}
            testid="setg-notif-new-booking" />
        </div>
        <SaveRow onClick={() => save()} disabled={saving || !dirty} testid="setg-notif-staff-save" />
      </>
    ),
  };

  const renderContent = () => {
    if (!currentAllowed) return <RbacLock />;
    const key = `${sec}.${sub}`;
    const fn = RENDERERS[key];
    return fn ? fn() : <div className="rbac-lock">Coming soon</div>;
  };

  const filteredNav = useMemo(() => {
    return NAV.map((n) => {
      const allowedSubs = n.subs.filter((s) => permAllowed(s.perm));
      if (allowedSubs.length === 0) return null;
      if (!q) return { ...n, subs: allowedSubs, matched: allowedSubs, groupMatched: true };
      const groupMatch = n.label.toLowerCase().includes(q);
      const matchedSubs = allowedSubs.filter((s) => s.label.toLowerCase().includes(q));
      if (!groupMatch && matchedSubs.length === 0) return null;
      return { ...n, subs: allowedSubs, matched: groupMatch ? allowedSubs : matchedSubs, groupMatched: groupMatch };
    }).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, salonUser?.userId]);

  const highlight = (text) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>{text.slice(0, idx)}<span className="hit">{text.slice(idx, idx + q.length)}</span>{text.slice(idx + q.length)}</>
    );
  };

  return (
    <div className="setv3">
      <div className="phead">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2>
              <span className="hic">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </span>
              Settings
            </h2>
          </div>
          <SubscriptionBadge salon={salon} />
        </div>
      </div>

      <div className="workspace">
        <div className="pane-l">
          <div className="nav-head">Settings</div>
          <div className="nav-search">
            <div className="nav-search-box">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="search" placeholder="Search settings…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="settings-search-input" />
              {search && (
                <button className="clr" onClick={() => setSearch('')} data-testid="settings-search-clear" aria-label="Clear">
                  <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}>
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="setnav">
            {q && filteredNav.length === 0 && (
              <div className="no-match" data-testid="settings-search-nomatch">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <div>No settings match "{search}"</div>
              </div>
            )}
            {filteredNav.map((n) => {
              const on = q ? true : n.k === sec;
              const firstMatched = n.matched[0] || n.subs[0];
              return (
                <div key={n.k} className={`sgroup ${on ? 'on' : ''}`}>
                  <button className="sn" onClick={() => go(n.k, firstMatched.k)}>
                    <svg className="ic" viewBox="0 0 24 24">{n.ico}</svg>
                    {highlight(n.label)}
                    <svg className="chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                  <div className="subnav">
                    {n.subs.map((sc) => {
                      if (q && !n.matched.includes(sc)) return null;
                      return (
                        <button key={sc.k} className={`subitem ${n.k === sec && sub === sc.k ? 'on' : ''}`}
                          onClick={(e) => { e.stopPropagation(); go(n.k, sc.k); }}
                          data-testid={`settings-nav-${n.k}-${sc.k}`}>
                          {highlight(sc.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="pane-r">
          <div className="pane-body">{renderContent()}</div>
        </div>
      </div>

      {previewOpen && createPortal(
        <div data-testid="invoice-preview-drawer">
          <div onClick={() => setPreviewOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,40,.5)', zIndex: 3000, backdropFilter: 'blur(2px)' }} />
          <aside style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 'min(880px, 96vw)', background: '#eef0f6', zIndex: 3001, boxShadow: '-20px 0 60px rgba(20,16,40,.3)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', background: '#fff', borderBottom: '1px solid #ece9f5' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6C4FE0' }}>Live preview</div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Invoice preview</h3>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setPreviewOpen(false)} data-testid="invoice-preview-close"
                style={{ border: 'none', background: '#f2f0f8', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', fontSize: 18, color: '#4b4468' }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {previewLoading ? (
                <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#7a749a', fontWeight: 600 }}>Rendering preview…</div>
              ) : (
                <iframe title="invoice-preview" srcDoc={previewHtml} data-testid="invoice-preview-iframe"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#eef0f6' }} />
              )}
            </div>
          </aside>
        </div>,
        document.body
      )}
    </div>
  );
}
