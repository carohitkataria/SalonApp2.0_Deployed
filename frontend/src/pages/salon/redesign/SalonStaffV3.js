/**
 * SalonStaffV3.js — Redesigned Staff Management page (pink theme).
 *
 * Layout: two-pane workspace. Left = staff list with accordion sub-nav
 * (Profile / Attendance / Services / Documents / Access). Right = detail pane.
 *
 * RBAC: gated on `staff.view` (whole page). Individual sub-tabs & actions
 * respect finer permissions (attendance, salary_pay, edit, delete, documents,
 * access_control, view_all). Users without `staff.view_all` see only their
 * own linked staff record.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { STAFF_V3_CSS } from './StaffV3Styles';
import StaffAccessSection from '@/components/staff/access/StaffAccessSection';
import RolesAndAccessView from '@/components/staff/access/RolesAndAccessView';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AV_COLORS = ['#C6389E', '#12A594', '#3E93E8', '#E8952B', '#8A5CD1', '#2FA96A'];
const colorFor = (s = '') => AV_COLORS[(s.charCodeAt(0) || 0) % AV_COLORS.length];
const initial = (s = '') => (s || 'S').trim().charAt(0).toUpperCase();
const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
// Configured base salary — compensation may be a number OR a dict {base_salary,...}.
const baseSalaryOf = (comp) => {
  if (comp && typeof comp === 'object') return Number(comp.base_salary || 0);
  return Number(comp || 0);
};

// --- Attendance date-range helpers (local time) ---
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isoDateLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rangeThisWeek = () => {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday of current week
  return { from: isoDateLocal(monday), to: isoDateLocal(now) };
};
const rangeThisMonth = () => {
  const n = new Date();
  return { from: isoDateLocal(new Date(n.getFullYear(), n.getMonth(), 1)), to: isoDateLocal(n) };
};
const rangeLastMonth = () => {
  const n = new Date();
  const first = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const last = new Date(n.getFullYear(), n.getMonth(), 0);
  return { from: isoDateLocal(first), to: isoDateLocal(last) };
};

// --- Attendance calendar (Task 2) — replaces the P/A/H count strip ---
const ATT_STATUS_STYLE = {
  present: { bg: '#E4F6EC', fg: '#12855A', label: 'P' },
  half_day: { bg: '#FDF1DC', fg: '#B7791F', label: 'H' },
  'half-day': { bg: '#FDF1DC', fg: '#B7791F', label: 'H' },
  absent: { bg: '#FCE4E7', fg: '#C2334F', label: 'A' },
  holiday: { bg: '#E3F0FB', fg: '#2B72B8', label: 'HO' },
  leave: { bg: '#EDE7FB', fg: '#6C4FE0', label: 'L' },
  on_leave: { bg: '#EDE7FB', fg: '#6C4FE0', label: 'L' },
};
function AttendanceCalendar({ month, days }) {
  const parts = (month || '').split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!y || !m) return null;
  const first = new Date(y, m - 1, 1);
  const startWeekday = first.getDay(); // 0 = Sunday
  const numDays = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= numDays; d += 1) {
    const ds = `${month}-${String(d).padStart(2, '0')}`;
    cells.push({ d, status: (days[ds] || {}).status || '' });
  }
  return (
    <div className="att-cal" data-testid="attendance-calendar">
      <div className="att-cal__dow">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className="att-cal__grid">
        {cells.map((c, i) => {
          if (!c) return <span key={`e${i}`} className="att-cal__cell att-cal__cell--empty" />;
          const st = ATT_STATUS_STYLE[c.status];
          return (
            <span
              key={c.d}
              className="att-cal__cell"
              data-status={c.status || 'none'}
              title={c.status ? c.status.replace('_', ' ') : 'Not marked'}
              style={st ? { background: st.bg, color: st.fg, borderColor: st.bg } : undefined}
            >
              <b>{c.d}</b>
              {st && <em>{st.label}</em>}
            </span>
          );
        })}
      </div>
      <div className="att-cal__legend">
        <span><i style={{ background: '#12855A' }} />Present</span>
        <span><i style={{ background: '#C2334F' }} />Absent</span>
        <span><i style={{ background: '#B7791F' }} />Half-day</span>
        <span><i style={{ background: '#2B72B8' }} />Holiday</span>
        <span><i style={{ background: '#6C4FE0' }} />Leave</span>
      </div>
    </div>
  );
}

// Safely convert an API error (including FastAPI/Pydantic 422 objects) into a
// plain string so we never end up rendering a raw object as a React child.
const formatApiError = (err, fallback = 'Something went wrong') => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === 'string') return d;
        const field = Array.isArray(d?.loc) ? d.loc.filter((x) => x !== 'body').join('.') : '';
        const msg = d?.msg || 'Invalid value';
        return field ? `${field}: ${msg}` : msg;
      })
      .join(', ');
  }
  if (detail && typeof detail === 'object') return detail.msg || fallback;
  if (typeof err?.response?.data === 'string') return err.response.data;
  return err?.message || fallback;
};

// Read a File as a base64 data URL for inline document uploads.
const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('read failed'));
  reader.readAsDataURL(file);
});

// Fields configuring the multi-document uploader in the Add Staff drawer.
const DOC_SLOTS = [
  { key: 'aadhar_front', label: 'Aadhaar (Front)', accept: 'image/*,application/pdf' },
  { key: 'aadhar_back', label: 'Aadhaar (Back)', accept: 'image/*,application/pdf' },
  { key: 'pan', label: 'PAN Card', accept: 'image/*,application/pdf' },
  { key: 'photo', label: 'Profile Photo', accept: 'image/*' },
  { key: 'agreement', label: 'Agreement', accept: 'image/*,application/pdf' },
  { key: 'bank_details', label: 'Bank / UPI', accept: 'image/*,application/pdf' },
];

const EMPTY_NEW_STAFF = {
  name: '', mobile: '', experience: 0, category: 'Junior',
  department: '', designation: '',
  gender_specialization: '', specialization: '',
  dob: '', doj: '',
  emergency_contact: '', aadhar_number: '',
  compensation: '',
  is_barber: true,
};

const SECTIONS = [
  { key: 'profile', label: 'Profile', ico: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
  { key: 'attendance', label: 'Attendance', ico: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
  { key: 'services', label: 'Services & pricing', ico: <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/></> },
  { key: 'access', label: 'Access', ico: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></> },
];

export default function SalonStaffV3({ salonId, getAuthHeaders }) {
  const { hasModulePermission, salonUser } = useAuth();
  const isAdmin = salonUser?.role === 'admin' || salonUser?.role === 'branch_manager';
  const canViewAll = isAdmin || hasModulePermission?.('staff', 'view_all');
  const canCreate = isAdmin || hasModulePermission?.('staff', 'create');
  const canEdit = isAdmin || hasModulePermission?.('staff', 'edit');
  const canDelete = isAdmin || hasModulePermission?.('staff', 'delete');
  const canAttendance = isAdmin || hasModulePermission?.('staff', 'attendance');
  const canSalaryView = isAdmin || hasModulePermission?.('staff', 'salary_view');
  const canSalaryPay = isAdmin || hasModulePermission?.('staff', 'salary_pay');
  const canDocuments = isAdmin || hasModulePermission?.('staff', 'documents');
  const canAccess = isAdmin || hasModulePermission?.('staff', 'access_control');
  const ownStaffId = salonUser?.staffId || null;

  const [staff, setStaff] = useState([]);
  const [salonSettings, setSalonSettings] = useState({});
  const [salon, setSalon] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [section, setSection] = useState('profile');
  const [viewMode, setViewMode] = useState('staff'); // 'staff' | 'roles'
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newStaff, setNewStaff] = useState(EMPTY_NEW_STAFF);
  const [newDocs, setNewDocs] = useState({}); // { doc_type: { file, dataUrl, name, mime, size } }
  const [addBusy, setAddBusy] = useState(false);
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [services, setServices] = useState([]);
  const [barberServices, setBarberServices] = useState({});
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({});
  // Monthly attendance grid: { [barberId]: { month: 'YYYY-MM', days: { 'YYYY-MM-DD': {status,...} } } }
  const [attendanceGrid, setAttendanceGrid] = useState({});
  const [attMonth, setAttMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [attSaving, setAttSaving] = useState({});
  // Attendance drawer
  const [attOpen, setAttOpen] = useState(false);
  const [attFrom, setAttFrom] = useState('');
  const [attTo, setAttTo] = useState('');
  const [attRows, setAttRows] = useState([]); // [{date, in, out, status, sel}]
  const [attBusy, setAttBusy] = useState(false);
  // Salary drawer
  const [salOpen, setSalOpen] = useState(false);
  const [salMonth, setSalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [salMethod, setSalMethod] = useState('upi');
  const [salBase, setSalBase] = useState(0);
  // Prorated earned salary (base × earned_days / working_days) from the backend.
  const [salEarned, setSalEarned] = useState(0);
  const [salDaysInfo, setSalDaysInfo] = useState({ present: 0, working: 0, absent: 0, holidays: 0 });
  const [salInc, setSalInc] = useState(0);
  const [salDed, setSalDed] = useState(0);
  const [salAdv, setSalAdv] = useState(0);
  const [salRecord, setSalRecord] = useState(null);
  // Payment type: 'salary' | 'advance' | 'ff'
  const [payType, setPayType] = useState('salary');
  // One-off (Advance / F&F) fields
  const [salAmount, setSalAmount] = useState(0);
  const [salNote, setSalNote] = useState('');
  const [salBusy, setSalBusy] = useState(false);
  // Displayed amount payable — starts from backend calc, refreshes on Recalculate
  const [salDisplayedNet, setSalDisplayedNet] = useState(0);
  // Phase 3.11 — incentive is auto-calculated; keep target/actual for visibility.
  const [salIncMeta, setSalIncMeta] = useState({ target: 0, actual: 0, achievement_pct: 0 });
  // Phase 3.9 — per-category collapse state for Services & pricing (name -> bool).
  const [svcCatCollapsed, setSvcCatCollapsed] = useState({});
  // Payment history for the currently-selected staff (Salary + Advance + F&F)
  const [payHistory, setPayHistory] = useState([]);
  const [payHistoryLoading, setPayHistoryLoading] = useState(false);
  // Documents
  const [docs, setDocs] = useState({});
  const [docBusy, setDocBusy] = useState(false);
  const [preview, setPreview] = useState(null); // {doc, fileData}
  // Hidden file input ref for uploading
  const fileInputRef = React.useRef(null);
  const [pendingDocType, setPendingDocType] = useState(null);

  // ---------- Staff metrics/stats removed (Aug 2026) — profile shows details only ----------
  const [docsSecOpen, setDocsSecOpen] = useState(false); // collapsible Documents under profile

  // ---------- PHASE 2: branch switch ----------
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferBranchId, setTransferBranchId] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferRemarks, setTransferRemarks] = useState('');
  const [branchesList, setBranchesList] = useState([]);
  const [transferBusy, setTransferBusy] = useState(false);

  // ---------- PHASE 2: Access — login credentials + history ----------
  const [accessDraft, setAccessDraft] = useState({ login_id: '', password: '' });
  const [accessBusy, setAccessBusy] = useState(false);
  const [loginHistory, setLoginHistory] = useState({ history: [], active_devices: [] });
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false);

  // Scoped CSS injection
  useEffect(() => {
    const id = 'staff-v3-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = STAFF_V3_CSS;
    document.head.appendChild(el);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const [barbersRes, salonRes, servicesRes] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/barbers`, { headers: getAuthHeaders?.() || {} }),
        axios.get(`${API}/salons/${salonId}`).catch(() => ({ data: {} })),
        axios.get(`${API}/salons/${salonId}/services/enabled`).catch(() => ({ data: [] })),
      ]);
      let list = Array.isArray(barbersRes.data) ? barbersRes.data : [];
      // Enforce view scope on the client too (backend also enforces).
      if (!canViewAll && ownStaffId) list = list.filter((b) => b.id === ownStaffId);
      setStaff(list);
      setSelectedId((prev) => prev && list.find((s) => s.id === prev) ? prev : list[0]?.id || null);

      const salonData = salonRes.data?.salon || salonRes.data || {};
      setSalon(salonData);
      // Attendance settings snapshot (from salon record)
      setSalonSettings({
        attendance_method: salonData.attendance_mode || salonData.attendance_method || 'service_completion',
        shift_start: salonData.shift_start || '10:00',
        shift_end: salonData.shift_end || '20:00',
        grace_period_min: salonData.grace_period_min || 15,
        half_day_max_hours: salonData.half_day_max_hours || 4,
        min_hours_full_day: salonData.min_hours_full_day || 8,
        auto_checkout: salonData.auto_checkout ?? true,
        auto_checkout_time: salonData.auto_checkout_time || '21:00',
        allow_self_checkin: salonData.allow_self_checkin ?? true,
        geofence_required: salonData.geofence_required ?? false,
        overtime_after_hours: salonData.overtime_after_hours || 9,
        weekly_off: salonData.weekly_off || 'Sunday',
      });

      setServices(Array.isArray(servicesRes.data) ? servicesRes.data : []);
    } catch (err) {
      console.warn('SalonStaffV3 fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [salonId, getAuthHeaders, canViewAll, ownStaffId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Fetch per-barber services list when a staff is selected
  useEffect(() => {
    (async () => {
      if (!selectedId) return;
      try {
        const res = await axios.get(`${API}/barbers/${selectedId}/services`).catch(() => ({ data: [] }));
        const map = {};
        (res.data || []).forEach((s) => { map[s.service_id || s.id] = { on: !!s.is_available, price: s.price ?? s.base_price }; });
        setBarberServices((prev) => ({ ...prev, [selectedId]: map }));
      } catch (_) {}
    })();
  }, [selectedId]);

  // Fetch monthly attendance summary + full grid for selected staff / month
  const fetchAttendanceMonth = useCallback(async () => {
    if (!selectedId || !salonId) return;
    try {
      const res = await axios.get(
        `${API}/salons/${salonId}/staff-attendance/month/${attMonth}?barber_id=${selectedId}`,
        { headers: getAuthHeaders?.() || {} },
      );
      const b = (res.data?.barbers || []).find((x) => x.barber_id === selectedId);
      const arr = b?.attendance || [];
      const s = { P: 0, A: 0, H: 0, HO: 0, L: 0 };
      const days = {};
      arr.forEach((r) => {
        const st = String(r.status || '').toLowerCase();
        days[r.date] = { status: st, note: r.override_note, marked_by: r.marked_by_name };
        if (st === 'present') s.P += 1;
        else if (st === 'absent') s.A += 1;
        else if (st === 'half_day' || st === 'half-day') s.H += 1;
        else if (st === 'holiday') s.HO += 1;
        else if (st === 'leave' || st === 'on_leave') s.L += 1;
      });
      setAttendanceSummary((prev) => ({ ...prev, [selectedId]: s }));
      setAttendanceGrid((prev) => ({ ...prev, [selectedId]: { month: attMonth, days } }));
    } catch (_) { /* noop */ }
  }, [selectedId, salonId, attMonth, getAuthHeaders]);

  useEffect(() => { fetchAttendanceMonth(); }, [fetchAttendanceMonth]);

  // Cycle attendance status on click: blank → present → half_day → absent → holiday → on_leave → blank
  const CYCLE = ['present', 'half_day', 'absent', 'holiday', 'on_leave'];
  const cycleAttendance = async (date) => {
    if (!canAttendance || !selected) return;
    // Guard: don't allow future dates
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) return toast.error("Can't mark attendance for future dates");
    const key = `${selectedId}::${date}`;
    if (attSaving[key]) return;
    setAttSaving((prev) => ({ ...prev, [key]: true }));
    const grid = attendanceGrid[selectedId]?.days || {};
    const cur = (grid[date]?.status || '').toLowerCase();
    const idx = CYCLE.indexOf(cur);
    const next = idx === -1 ? CYCLE[0] : (idx === CYCLE.length - 1 ? null : CYCLE[idx + 1]);
    // Optimistic
    setAttendanceGrid((prev) => {
      const p = prev[selectedId] || { month: attMonth, days: {} };
      const days = { ...(p.days || {}) };
      if (next) days[date] = { ...(days[date] || {}), status: next };
      else delete days[date];
      return { ...prev, [selectedId]: { ...p, days } };
    });
    try {
      if (next) {
        await axios.put(
          `${API}/salons/${salonId}/staff-attendance/override/${selectedId}/${date}`,
          { status: next },
          { headers: getAuthHeaders?.() || {} },
        );
      } else {
        await axios.delete(
          `${API}/salons/${salonId}/staff-attendance/override/${selectedId}/${date}`,
          { headers: getAuthHeaders?.() || {} },
        );
      }
      // Refresh summary counts
      const days = attendanceGrid[selectedId]?.days || {};
      const merged = { ...days };
      if (next) merged[date] = { status: next }; else delete merged[date];
      const s = { P: 0, A: 0, H: 0, HO: 0, L: 0 };
      Object.values(merged).forEach((r) => {
        const st = (r.status || '').toLowerCase();
        if (st === 'present') s.P += 1;
        else if (st === 'absent') s.A += 1;
        else if (st === 'half_day') s.H += 1;
        else if (st === 'holiday') s.HO += 1;
        else if (st === 'leave' || st === 'on_leave') s.L += 1;
      });
      setAttendanceSummary((prev) => ({ ...prev, [selectedId]: s }));
    } catch (err) {
      // Revert on failure
      setAttendanceGrid((prev) => ({ ...prev, [selectedId]: { month: attMonth, days: grid } }));
      const msg = formatApiError(err, 'Could not update attendance');
      toast.error(String(msg));
    } finally {
      setAttSaving((prev) => { const p = { ...prev }; delete p[key]; return p; });
    }
  };

  // Documents: fetch list when staff selected
  useEffect(() => {
    (async () => {
      if (!selectedId || !canDocuments) return;
      try {
        const res = await axios.get(`${API}/barbers/${selectedId}/documents`, {
          headers: getAuthHeaders?.() || {},
        });
        setDocs((prev) => ({ ...prev, [selectedId]: res.data?.documents || [] }));
      } catch (_) { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, canDocuments]);

  // ---------- PHASE 2: Branches list (once per salon) ----------
  useEffect(() => {
    (async () => {
      if (!salonId) return;
      try {
        const res = await axios.get(`${API}/salons/${salonId}/branches`, {
          headers: getAuthHeaders?.() || {},
        });
        setBranchesList(res.data?.branches || res.data || []);
      } catch (_) { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId]);

  // ---------- PHASE 2: Login history & credentials ----------
  const loadLoginHistory = useCallback(async () => {
    if (!selectedId || !salonId || !canAccess) return;
    setLoginHistoryLoading(true);
    try {
      const res = await axios.get(
        `${API}/salons/${salonId}/barbers/${selectedId}/login-history?limit=25`,
        { headers: getAuthHeaders?.() || {} },
      );
      setLoginHistory({
        history: res.data?.history || [],
        active_devices: res.data?.active_devices || [],
      });
    } catch (_) {
      setLoginHistory({ history: [], active_devices: [] });
    } finally {
      setLoginHistoryLoading(false);
    }
  }, [selectedId, salonId, canAccess, getAuthHeaders]);

  useEffect(() => {
    if (section === 'access' && selectedId) {
      // Prefill login_id when opening access section
      const cur = staff.find((x) => x.id === selectedId);
      setAccessDraft({ login_id: cur?.login_id || '', password: '' });
      loadLoginHistory();
    }
  }, [section, selectedId, staff, loadLoginHistory]);

  const saveCredentials = async () => {
    if (!selectedId) return;
    const lid = (accessDraft.login_id || '').trim();
    const pwd = accessDraft.password || '';
    if (!lid && !pwd) return toast.error('Enter a Login ID or Password');
    if (lid && lid.length < 6) return toast.error('Login ID must be at least 6 characters');
    if (pwd && pwd.length < 8) return toast.error('Password must be at least 8 characters');
    setAccessBusy(true);
    try {
      const body = {};
      if (lid) body.login_id = lid;
      if (pwd) body.password = pwd;
      const res = await axios.put(
        `${API}/salons/${salonId}/barbers/${selectedId}/credentials`,
        body,
        { headers: getAuthHeaders?.() || {} },
      );
      toast.success('Credentials updated');
      // Update in-memory staff row
      setStaff((prev) => prev.map((r) => r.id === selectedId ? { ...r, login_id: res.data?.login_id || lid || r.login_id } : r));
      setAccessDraft({ login_id: res.data?.login_id || lid, password: '' });
    } catch (err) {
      toast.error(formatApiError(err, 'Could not save credentials'));
    } finally {
      setAccessBusy(false);
    }
  };

  const revokeSession = async (sessionId) => {
    if (!selectedId || !sessionId) return;
    if (!window.confirm('Revoke this device? The staff will be logged out on it.')) return;
    try {
      await axios.post(
        `${API}/salons/${salonId}/barbers/${selectedId}/revoke-session`,
        { session_id: sessionId },
        { headers: getAuthHeaders?.() || {} },
      );
      toast.success('Session revoked');
      loadLoginHistory();
    } catch (err) {
      toast.error(formatApiError(err, 'Could not revoke session'));
    }
  };

  // ---------- Staff metrics stats fetch removed (Aug 2026) ----------

  // ---------- PHASE 2: Branch transfer ----------
  const openTransferDrawer = () => {
    if (!selected) return;
    setTransferBranchId(selected.branch_id || '');
    setTransferDate(new Date().toISOString().slice(0, 10));
    setTransferRemarks('');
    setTransferOpen(true);
  };

  const saveTransfer = async () => {
    if (!selectedId || !transferBranchId) return toast.error('Pick a destination branch');
    if (transferBranchId === (selected?.branch_id || '')) return toast.error('Same as current branch');
    setTransferBusy(true);
    try {
      // Try dedicated transfer endpoint; fall back to updating the barber's branch_id.
      let ok = false;
      try {
        await axios.post(
          `${API}/salons/${salonId}/barbers/${selectedId}/transfer`,
          { to_branch_id: transferBranchId, transfer_date: transferDate, remarks: transferRemarks },
          { headers: getAuthHeaders?.() || {} },
        );
        ok = true;
      } catch (_) {
        await axios.put(
          `${API}/barbers/${selectedId}`,
          { branch_id: transferBranchId },
          { headers: getAuthHeaders?.() || {} },
        );
        ok = true;
      }
      if (ok) {
        toast.success('Branch transfer recorded');
        setStaff((prev) => prev.map((r) => r.id === selectedId ? { ...r, branch_id: transferBranchId } : r));
        setTransferOpen(false);
      }
    } catch (err) {
      toast.error(formatApiError(err, 'Could not transfer branch'));
    } finally {
      setTransferBusy(false);
    }
  };

  // ---------- PHASE 2: Services grouping + bulk actions ----------
  const setServicesBulk = async (svcIds, on) => {
    if (!canEdit) return toast.error("You don't have permission");
    if (!selectedId || !svcIds || svcIds.length === 0) return;
    const map = { ...(barberServices[selectedId] || {}) };
    svcIds.forEach((id) => { map[id] = { ...(map[id] || { price: null }), on }; });
    setBarberServices((prev) => ({ ...prev, [selectedId]: map }));
    let failed = 0;
    await Promise.all(svcIds.map(async (id) => {
      try {
        await axios.put(
          `${API}/barbers/${selectedId}/services/${id}/toggle?is_available=${on ? 'true' : 'false'}`,
          {}, { headers: getAuthHeaders?.() || {} },
        );
      } catch (_) { failed += 1; }
    }));
    if (failed) toast.error(`${failed} service(s) failed to update`);
    else toast.success(on ? 'All selected services enabled' : 'All selected services disabled');
  };

  const uploadDoc = (docType) => {
    if (!canDocuments) return toast.error("You don't have permission");
    setPendingDocType(docType);
    // Trigger the hidden file input
    setTimeout(() => fileInputRef.current?.click(), 30);
  };

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so same file can be re-selected
    if (!file || !pendingDocType || !selectedId) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('File too large (max 10 MB)');
    setDocBusy(true);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('read failed'));
        r.readAsDataURL(file);
      });
      const label = pendingDocType === 'aadhar_front' ? 'Aadhaar card'
        : pendingDocType === 'agreement' ? 'Employment agreement'
        : pendingDocType === 'bank_details' ? 'Bank / UPI details'
        : (pendingDocType.charAt(0).toUpperCase() + pendingDocType.slice(1).replace(/_/g, ' '));
      await axios.post(
        `${API}/barbers/${selectedId}/documents`,
        { doc_type: pendingDocType, label, file_data: dataUrl, mime_type: file.type, file_name: file.name },
        { headers: getAuthHeaders?.() || {} },
      );
      // Re-fetch list
      const res = await axios.get(`${API}/barbers/${selectedId}/documents`, {
        headers: getAuthHeaders?.() || {},
      });
      setDocs((prev) => ({ ...prev, [selectedId]: res.data?.documents || [] }));
      toast.success(label + ' uploaded');
    } catch (err) {
      toast.error(formatApiError(err, 'Upload failed'));
    } finally {
      setDocBusy(false);
      setPendingDocType(null);
    }
  };

  const deleteDoc = async (docId) => {
    if (!canDocuments) return;
    if (!window.confirm('Delete this document?')) return;
    try {
      await axios.delete(`${API}/barbers/${selectedId}/documents/${docId}`, {
        headers: getAuthHeaders?.() || {},
      });
      setDocs((prev) => ({
        ...prev,
        [selectedId]: (prev[selectedId] || []).filter((d) => d.id !== docId),
      }));
      toast.success('Document removed');
    } catch (err) {
      toast.error(formatApiError(err, 'Delete failed'));
    }
  };

  const previewDoc = async (docId) => {
    try {
      const res = await axios.get(`${API}/barbers/${selectedId}/documents/${docId}`, {
        headers: getAuthHeaders?.() || {},
      });
      setPreview(res.data);
    } catch (err) {
      toast.error('Could not load document');
    }
  };

  // ============ Attendance drawer helpers ============
  const openAttDrawer = () => {
    if (!canAttendance) return toast.error("You don't have permission");
    if (!selected) return;
    // Default range: THIS WEEK (Monday → today). Quick ranges cover last/this month.
    const { from, to } = rangeThisWeek();
    setAttFrom(from);
    setAttTo(to);
    setAttRows([]);
    setAttOpen(true);
    setTimeout(() => buildAttRows(from, to), 40);
  };

  // Quick date-range presets in the attendance drawer.
  const applyAttRange = (which) => {
    const r = which === 'thisMonth' ? rangeThisMonth() : which === 'lastMonth' ? rangeLastMonth() : rangeThisWeek();
    setAttFrom(r.from);
    setAttTo(r.to);
    setTimeout(() => buildAttRows(r.from, r.to), 20);
  };

  const buildAttRows = (fromDate, toDate) => {
    const from = fromDate || attFrom;
    const to = toDate || attTo;
    if (!from || !to || from > to) return toast.error('Pick a valid date range');
    const rows = [];
    const days = attendanceGrid[selectedId]?.days || {};
    const weeklyOff = salonSettings.weekly_off || 'Sunday';
    const start = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dstr = d.toISOString().slice(0, 10);
      const rec = days[dstr];
      const st = rec?.status || '';
      // Weekly-off days with no explicit record default to Holiday so they are
      // already shown as holiday and preserved during bulk marking.
      const isWeeklyOff = WEEKDAY_NAMES[d.getUTCDay()] === weeklyOff;
      const inT = rec?.check_in_time || (st === 'present' || st === 'half_day' ? (salonSettings.shift_start || '10:00') : '');
      const outT = rec?.check_out_time || (st === 'present' ? (salonSettings.shift_end || '20:00') : '');
      let statusCode = st === 'half_day' ? 'H' : st === 'absent' ? 'A' : st === 'holiday' ? 'HO' : st === 'leave' || st === 'on_leave' ? 'L' : st === 'present' ? 'P' : '';
      if (!statusCode && isWeeklyOff) statusCode = 'HO';
      rows.push({
        date: dstr,
        in: inT,
        out: outT,
        status: statusCode,
        weeklyOff: isWeeklyOff,
        // Snapshot of what's already saved on the server for this date so
        // saveAttendance can skip unchanged rows (fixes "0 saved, N failed").
        // Weekly-off holidays are backend-implicit, so treat them as unchanged.
        initialStatus: statusCode,
        initialIn: inT,
        initialOut: outT,
        sel: false,
      });
    }
    setAttRows(rows);
  };

  const attToggleAll = () => {
    const all = attRows.every((r) => r.sel);
    setAttRows(attRows.map((r) => ({ ...r, sel: !all })));
  };
  const attToggleRow = (i) => setAttRows(attRows.map((r, j) => (j === i ? { ...r, sel: !r.sel } : r)));
  const bulkStatus = (code) => {
    const anySel = attRows.some((r) => r.sel);
    setAttRows(attRows.map((r) => {
      const target = anySel ? r.sel : true;
      if (!target) return r;
      // Preserve holidays during bulk marking unless explicitly setting Holiday
      // or clearing — a "Present all" must not turn Sundays/holidays into Present.
      if (r.status === 'HO' && code !== 'HO' && code !== '') return r;
      return { ...r, status: code };
    }));
  };
  const bulkTime = (inV, outV) => {
    const anySel = attRows.some((r) => r.sel);
    setAttRows(attRows.map((r) => ((anySel ? r.sel : true) ? { ...r, in: inV, out: outV } : r)));
  };
  const setRow = (i, patch) => setAttRows(attRows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const saveAttendance = async () => {
    if (!canAttendance || !selected) return;
    if (attRows.length === 0) return toast.error('Load dates first');
    setAttBusy(true);
    const statusMap = { P: 'present', A: 'absent', H: 'half_day', HO: 'holiday', L: 'on_leave' };
    // Only rows whose status actually changed vs the loaded snapshot are sent.
    const changed = attRows.filter(
      (r) => (r.status || '') !== (r.initialStatus || ''),
    );
    if (changed.length === 0) {
      setAttBusy(false);
      toast.success('No changes to save');
      setAttOpen(false);
      return;
    }
    let ok = 0;
    let fail = 0;
    let locked = 0;
    const errors = [];
    // Parallelise the per-day PUT/DELETE calls in chunks of 8 to avoid a slow
    // sequential await-per-day loop (was N serial round-trips) while not
    // hammering the API with all N requests at once.
    const runRow = async (row) => {
      try {
        if (!row.status) {
          await axios.delete(`${API}/salons/${salonId}/staff-attendance/override/${selectedId}/${row.date}`, {
            headers: getAuthHeaders?.() || {},
          });
        } else {
          await axios.put(
            `${API}/salons/${salonId}/staff-attendance/override/${selectedId}/${row.date}`,
            { status: statusMap[row.status] || row.status.toLowerCase() },
            { headers: getAuthHeaders?.() || {} },
          );
        }
        ok += 1;
      } catch (err) {
        const code = err?.response?.status;
        const detail = err?.response?.data?.detail || err?.message || 'Save failed';
        if (code === 423 || /already paid|locked/i.test(String(detail))) {
          locked += 1;
        } else {
          fail += 1;
          errors.push(`${row.date}: ${detail}`);
        }
      }
    };
    const CHUNK = 8;
    for (let i = 0; i < changed.length; i += CHUNK) {
      await Promise.all(changed.slice(i, i + CHUNK).map(runRow));
    }
    setAttBusy(false);
    if (ok > 0 && fail === 0 && locked === 0) {
      toast.success(`Saved ${ok} day${ok === 1 ? '' : 's'}`);
    } else if (fail === 0 && locked > 0) {
      toast.error(`Saved ${ok}. ${locked} day${locked === 1 ? '' : 's'} skipped — salary already paid for that month (attendance is locked).`);
    } else {
      const msg = [
        `Saved ${ok}`,
        locked ? `${locked} locked (salary already paid)` : null,
        fail ? `${fail} failed${errors[0] ? ` — ${errors[0]}` : ''}` : null,
      ].filter(Boolean).join(' · ');
      toast.error(msg);
    }
    setAttOpen(false);
    // Refresh grid + summary counts from the backend (previously the refresh
    // was a no-op setAttMonth to the same value, so counts never updated).
    const month = attRows[0]?.date.slice(0, 7) || attMonth;
    if (month !== attMonth) setAttMonth(month);
    else fetchAttendanceMonth();
  };

  // ============ Salary drawer helpers ============
  const bindSalary = async (month) => {
    if (!selected || !canSalaryView) return;
    try {
      const res = await axios.get(
        `${API}/salons/${salonId}/staff-salary/month/${month}?barber_id=${selectedId}`,
      );
      const r = (res.data?.barbers || []).find((x) => x.barber_id === selectedId) || res.data;
      const record = r?.salary || r || null;
      setSalRecord(record);
      // Base salary is a fixed setting (read-only here) — always sourced from the
      // staff's configured base salary, not the LOP-adjusted calculated figure.
      const configuredBase = baseSalaryOf(selected.compensation) || Number(record?.base_salary ?? 0);
      setSalBase(configuredBase);
      // Manual deduction / advance start at 0 — the LOP for absences is ALREADY
      // baked into the prorated earned figure, so we must not deduct it twice.
      setSalDed(0);
      setSalAdv(0);
      setSalDaysInfo({
        present: Number(record?.present_days ?? 0),
        working: Number(record?.working_days_in_month ?? record?.working_days ?? 0),
        absent: Number(record?.absent_days ?? 0),
        holidays: Number(record?.holidays ?? 0),
      });

      // Incentive is auto-calculated — fetch the reward-plan incentive row for the
      // month so we can show target vs actual (read-only) and use the earned value.
      let autoInc = Number(record?.incentive_amount ?? 0);
      let incMeta = { target: 0, actual: 0, achievement_pct: 0 };
      try {
        const incRes = await axios.get(
          `${API}/salons/${salonId}/reward-plan/incentives?month=${month}&barber_id=${selectedId}`,
          { headers: getAuthHeaders?.() || {} },
        );
        const rows = incRes.data?.incentives || incRes.data?.rows || (Array.isArray(incRes.data) ? incRes.data : []);
        const row = rows.find((x) => x.barber_id === selectedId) || rows[0];
        if (row) {
          autoInc = Number(row.incentive_earned ?? row.incentive_amount ?? autoInc);
          incMeta = {
            target: Number(row.target ?? 0),
            actual: Number(row.actual_sales ?? row.actual ?? 0),
            achievement_pct: Number(row.achievement_pct ?? 0),
          };
        }
      } catch (_) { /* no reward plan configured — keep record incentive */ }
      setSalInc(autoInc);
      setSalIncMeta(incMeta);

      // Prorated earned salary = final_payable − incentive (already scaled to the
      // barber's actual attendance / working days by the backend).
      const finalPayable = Number(record?.final_payable ?? record?.total_payable ?? 0);
      const earned = record ? Math.max(0, finalPayable - autoInc) : configuredBase;
      setSalEarned(earned);
      // Net payable = earned + incentive − manual deductions − advance.
      setSalDisplayedNet(record ? finalPayable : configuredBase);
    } catch (err) {
      // Fallback to profile base
      setSalRecord(null);
      const fallbackBase = baseSalaryOf(selected?.compensation);
      setSalBase(fallbackBase);
      setSalEarned(fallbackBase);
      setSalDaysInfo({ present: 0, working: 0, absent: 0, holidays: 0 });
      setSalInc(0);
      setSalIncMeta({ target: 0, actual: 0, achievement_pct: 0 });
      setSalDed(0);
      setSalAdv(0);
      setSalDisplayedNet(fallbackBase);
    }
  };

  const openSalDrawer = async () => {
    if (!canSalaryPay) return toast.error("You don't have permission");
    setPayType('salary');
    setSalAmount(0);
    setSalNote('');
    setSalMonth(new Date().toISOString().slice(0, 7));
    setSalMethod('upi');
    await bindSalary(new Date().toISOString().slice(0, 7));
    setSalOpen(true);
  };

  const changeSalMonth = async (m) => {
    setSalMonth(m);
    await bindSalary(m);
  };

  // Live-computed net (from the currently-typed inputs). Shown only after
  // "Recalculate" is pressed — otherwise the drawer keeps showing the
  // backend-calculated value in `salDisplayedNet`.
  const salNet = Math.max(
    0,
    Number(salEarned || 0) + Number(salInc || 0) - Number(salDed || 0) - Number(salAdv || 0),
  );

  const recalcNet = () => {
    if (payType === 'salary') {
      setSalDisplayedNet(salNet);
      toast.success('Amount payable recalculated');
    } else {
      setSalDisplayedNet(Number(salAmount || 0));
    }
  };

  // Fetch recent payments (salary + advance + F&F) for the currently-selected staff.
  const loadPayHistory = useCallback(async () => {
    if (!salonId || !selectedId || !canSalaryView) {
      setPayHistory([]);
      return;
    }
    setPayHistoryLoading(true);
    try {
      const res = await axios.get(
        `${API}/salons/${salonId}/barbers/${selectedId}/payment-history?limit=25`,
        { headers: getAuthHeaders?.() || {} },
      );
      setPayHistory(Array.isArray(res.data?.payments) ? res.data.payments : []);
    } catch (err) {
      setPayHistory([]);
    } finally {
      setPayHistoryLoading(false);
    }
  }, [salonId, selectedId, canSalaryView, getAuthHeaders]);

  useEffect(() => {
    loadPayHistory();
  }, [loadPayHistory]);

  const markSalaryPaid = async () => {
    if (!canSalaryPay || !selected) return;
    // For a regular monthly salary, block if already paid.
    if (payType === 'salary' && salRecord?.is_paid) return toast.error('Already paid for this month');

    setSalBusy(true);
    try {
      if (payType === 'salary') {
        await axios.post(
          `${API}/salons/${salonId}/staff-salary/pay/${selectedId}/${salMonth}`,
          { payment_method: salMethod, note: `Net ₹${salDisplayedNet}` },
          { headers: getAuthHeaders?.() || {} },
        );
        toast.success('Salary marked as paid');
      } else {
        const amt = Number(salAmount || 0);
        if (amt <= 0) {
          toast.error('Enter a valid amount');
          setSalBusy(false);
          return;
        }
        await axios.post(
          `${API}/salons/${salonId}/barbers/${selectedId}/one-off-payment`,
          {
            payment_type: payType, // 'advance' | 'ff'
            amount: amt,
            payment_method: salMethod,
            note: salNote || null,
            month: salMonth || null,
          },
          { headers: getAuthHeaders?.() || {} },
        );
        toast.success(payType === 'advance' ? 'Advance recorded' : 'Full & Final recorded');
      }
      setSalOpen(false);
      loadPayHistory();
      fetchAll();
    } catch (err) {
      toast.error(formatApiError(err, 'Could not record payment'));
    } finally {
      setSalBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => (s.name || '').toLowerCase().includes(q));
  }, [staff, search]);

  const selected = staff.find((s) => s.id === selectedId);

  // ----- RBAC lock -----
  const canViewStaff = isAdmin || hasModulePermission?.('staff', 'view');
  if (!canViewStaff) {
    return (
      <div className="staffv3">
        <div className="workspace"><div className="pane-r"><div className="rbac-lock">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          You don't have permission to view Staff Management.
        </div></div></div>
      </div>
    );
  }

  // ---------- Actions ----------
  const handleAddStaff = async () => {
    const name = newStaff.name.trim();
    const phone = (newStaff.mobile || '').replace(/\D/g, '');
    if (!name) return toast.error('Enter full name');
    if (phone.length < 10) return toast.error('Mobile number is required (login ID)');
    const mobile = `+91${phone.slice(-10)}`;
    setAddBusy(true);
    try {
      const payload = {
        name,
        salon_id: salonId,
        mobile,
        experience: Number(newStaff.experience) || 0,
        category: newStaff.category || 'Junior',
        department: newStaff.department || null,
        designation: newStaff.designation || null,
        specialization: newStaff.specialization || null,
        gender_specialization: newStaff.gender_specialization || null,
        emergency_contact: newStaff.emergency_contact || null,
        aadhar_number: newStaff.aadhar_number || null,
        dob: newStaff.dob || null,
        doj: newStaff.doj || null,
        compensation: newStaff.compensation === '' || newStaff.compensation === null
          ? null
          : Number(newStaff.compensation) || 0,
        is_barber: newStaff.is_barber !== false,
      };
      const res = await axios.post(
        `${API}/salons/${salonId}/barbers`,
        payload,
        { headers: getAuthHeaders?.() || {} },
      );
      const createdId = res?.data?.id;

      // Upload attached documents (if any) in sequence
      const uploads = Object.entries(newDocs || {}).filter(([, v]) => v && v.dataUrl);
      if (createdId && uploads.length) {
        for (const [docType, meta] of uploads) {
          const slot = DOC_SLOTS.find((s) => s.key === docType);
          try {
            await axios.post(
              `${API}/barbers/${createdId}/documents`,
              {
                doc_type: docType,
                label: slot?.label || docType,
                file_data: meta.dataUrl,
                mime_type: meta.mime,
                file_name: meta.name,
              },
              { headers: getAuthHeaders?.() || {} },
            );
          } catch (docErr) {
            toast.error(`${slot?.label || docType}: ${formatApiError(docErr, 'upload failed')}`);
          }
        }
      }

      toast.success('Staff added · login ID ' + phone);
      setAddOpen(false);
      setNewStaff(EMPTY_NEW_STAFF);
      setNewDocs({});
      fetchAll();
    } catch (err) {
      toast.error(formatApiError(err, 'Could not add staff'));
    } finally {
      setAddBusy(false);
    }
  };

  const handleDeleteStaff = async () => {
    if (!selected || !canDelete) return;
    if (!window.confirm(`Delete ${selected.name}? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/barbers/${selected.id}`, { headers: getAuthHeaders?.() || {} });
      toast.success('Staff removed');
      fetchAll();
    } catch (err) {
      toast.error(formatApiError(err, 'Could not delete staff'));
    }
  };

  const startEditProfile = () => {
    if (!canEdit) return toast.error("You don't have permission to edit staff");
    setProfileDraft({
      name: selected?.name || '',
      experience: selected?.experience ?? 0,
      category: selected?.category || '',
      department: selected?.department || '',
      designation: selected?.designation || '',
      emergency_contact: selected?.emergency_contact || '',
      aadhar_number: selected?.aadhar_number || '',
      compensation: selected?.compensation ?? 0,
      visible_to_customers: selected?.visible_to_customers ?? true,
      dob: selected?.dob || '',
      doj: selected?.doj || '',
      photo_url: selected?.photo_url || '',
    });
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    if (!selected) return;
    try {
      const payload = { ...profileDraft };
      // Normalise blanks so the backend doesn't reject empty date strings.
      if (!payload.dob) payload.dob = null;
      if (!payload.doj) payload.doj = null;
      await axios.put(`${API}/barbers/${selected.id}`, payload, { headers: getAuthHeaders?.() || {} });
      toast.success('Profile saved');
      setEditingProfile(false);
      fetchAll();
    } catch (err) {
      toast.error(formatApiError(err, 'Could not save profile'));
    }
  };

  const onProfilePhotoPick = async (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Please pick an image under 3 MB');
      return;
    }
    // Preview immediately as base64, upload to backend
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      setProfileDraft((prev) => ({ ...prev, photo_url: dataUrl }));
      try {
        await axios.put(
          `${API}/barbers/${selected.id}`,
          { photo_url: dataUrl },
          { headers: getAuthHeaders?.() || {} },
        );
        toast.success('Photo updated');
        fetchAll();
      } catch (err) {
        toast.error(formatApiError(err, 'Could not update photo'));
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleService = async (svcId) => {
    if (!canEdit) return toast.error("You don't have permission");
    const map = { ...(barberServices[selectedId] || {}) };
    const cur = map[svcId] || { on: false, price: null };
    map[svcId] = { ...cur, on: !cur.on };
    setBarberServices((prev) => ({ ...prev, [selectedId]: map }));
    try {
      await axios.put(`${API}/barbers/${selectedId}/services/${svcId}/toggle?is_available=${!cur.on}`,
        {}, { headers: getAuthHeaders?.() || {} });
    } catch (err) {
      toast.error('Failed to update');
      map[svcId] = cur;
      setBarberServices((prev) => ({ ...prev, [selectedId]: map }));
    }
  };

  // ---------- Renderers ----------
  const renderStaffList = () => (
    <div className="pane-l">
      <div className="list-head">
        <div className="lt">
          <b><span className="dotg" />Active Staff</b>
          <span className="ct">{staff.length}</span>
          <div className="lt-actions">
            {canAccess && (
              <button
                type="button"
                className={`sq-btn ${viewMode === 'roles' ? 'on' : ''}`}
                title="Roles & Access"
                aria-label="Roles & Access"
                onClick={() => setViewMode((v) => (v === 'roles' ? 'staff' : 'roles'))}
                data-testid="toggle-roles-access"
              >
                <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                className="sq-btn sq-btn--pri"
                title="Add staff"
                aria-label="Add staff"
                onClick={() => setAddOpen(true)}
                data-testid="staff-add-btn"
              >
                <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            )}
          </div>
        </div>
        <div className="searchbox" style={{ width: '100%' }}>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Search staff…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="staff-list">
        {loading && <div style={{ padding: 20, fontSize: 12, color: '#8A7F90' }}>Loading…</div>}
        {!loading && filtered.length === 0 && <div style={{ padding: 20, fontSize: 12, color: '#8A7F90' }}>No staff yet</div>}
        {filtered.map((s) => {
          const on = s.id === selectedId;
          return (
            <div key={s.id} className={`sgroup ${on ? 'on' : ''}`}>
              <div className="sc" onClick={() => { setSelectedId(s.id); setSection('profile'); }}>
                <div className="av" style={{ background: colorFor(s.name) }}>{initial(s.name)}</div>
                <div className="si">
                  <b>{s.name}</b>
                  <span>{(s.category || 'Junior')} · {s.experience || 0} yr{s.experience === 1 ? '' : 's'}</span>
                </div>
                <svg className="chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
              {on && (
                <div className="subnav">
                  {SECTIONS.map((sec) => (
                    <button key={sec.key} type="button"
                      className={`subitem ${section === sec.key ? 'on' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setSection(sec.key); }}>
                      <svg viewBox="0 0 24 24">{sec.ico}</svg>{sec.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderProfileBody = () => {
    const s = selected;
    const att = attendanceSummary[s.id] || { P: 0, A: 0, H: 0, HO: 0, L: 0 };
    const currentBranchName = (branchesList.find((b) => (b.id || b.branch_id) === s.branch_id) || {}).name || s.branch_name || '';
    return (
      <>
        <div className="secttl">
          Personal information
          {isAdmin && branchesList.length > 1 && (
            <button className="btn-ghost" style={{ padding: '7px 12px', marginLeft: 'auto' }} onClick={openTransferDrawer} data-testid="staff-branch-switch">
              <svg viewBox="0 0 24 24"><path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/></svg>
              {currentBranchName ? `Switch branch (${currentBranchName})` : 'Switch branch'}
            </button>
          )}
          {canEdit && !editingProfile && (
            <button className="btn-ghost" style={{ padding: '7px 12px' }} onClick={startEditProfile}>
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>Edit
            </button>
          )}
          {editingProfile && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" style={{ padding: '7px 12px' }} onClick={() => setEditingProfile(false)}>Cancel</button>
              <button className="btn-primary" style={{ padding: '7px 12px' }} onClick={saveProfile}>Save</button>
            </div>
          )}
        </div>

        {/* Photo — visible always, clickable in edit mode */}
        <div className="profile-photo-row">
          <div className="pp-thumb" style={{ backgroundImage: (editingProfile ? profileDraft.photo_url : s.photo_url) ? `url(${editingProfile ? profileDraft.photo_url : s.photo_url})` : 'none' }}>
            {!((editingProfile ? profileDraft.photo_url : s.photo_url)) && (
              <span>{(s.name || '?').charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="pp-meta">
            <div className="pp-title">Profile photo</div>
            <div className="pp-sub">JPG / PNG, up to 3 MB</div>
            {canEdit && (
              <label className="btn-ghost" style={{ padding: '7px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {(editingProfile ? profileDraft.photo_url : s.photo_url) ? 'Change photo' : 'Upload photo'}
                <input type="file" accept="image/*" hidden onChange={(e) => onProfilePhotoPick(e.target.files?.[0])} data-testid="staff-photo-upload" />
              </label>
            )}
          </div>
        </div>

        <div className="grid2">
          <div className="field"><label>Full name <span className="req">*</span></label>
            <input value={editingProfile ? profileDraft.name : (s.name || '')} disabled={!editingProfile}
              onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })} /></div>
          <div className="field"><label>Mobile number</label>
            {(s.phone || s.mobile) ? (
              <a
                href={`tel:${(s.phone || s.mobile).replace(/\s+/g, '')}`}
                className="tel-link"
                data-testid="staff-phone-dial"
              >
                {s.phone || s.mobile}
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, marginLeft: 6 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13 1.05.37 2.08.72 3.06a2 2 0 0 1-.45 2.11L8.09 10.28a16 16 0 0 0 6 6l1.39-1.39a2 2 0 0 1 2.11-.45c.98.35 2.01.59 3.06.72A2 2 0 0 1 22 16.92z"/></svg>
              </a>
            ) : (
              <input value="—" disabled />
            )}
            </div>
          <div className="field"><label>Date of birth</label>
            <input
              type="date"
              value={editingProfile ? (profileDraft.dob || '') : (s.dob || '')}
              disabled={!editingProfile}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setProfileDraft({ ...profileDraft, dob: e.target.value })}
              data-testid="staff-dob"
            /></div>
          <div className="field"><label>Date of joining</label>
            <input
              type="date"
              value={editingProfile ? (profileDraft.doj || '') : (s.doj || '')}
              disabled={!editingProfile}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setProfileDraft({ ...profileDraft, doj: e.target.value })}
              data-testid="staff-doj"
            /></div>
          <div className="field"><label>Experience (years)</label>
            <input type="number" value={editingProfile ? profileDraft.experience : (s.experience ?? 0)} disabled={!editingProfile}
              onChange={(e) => setProfileDraft({ ...profileDraft, experience: e.target.value })} /></div>
          <div className="field"><label>Category</label>
            <select value={editingProfile ? profileDraft.category : (s.category || 'Junior')} disabled={!editingProfile}
              onChange={(e) => setProfileDraft({ ...profileDraft, category: e.target.value })}>
              <option>Junior</option><option>Star</option><option>Master</option>
            </select></div>
          <div className="field"><label>Department</label>
            <input value={editingProfile ? profileDraft.department : (s.department || '')} disabled={!editingProfile}
              placeholder="e.g. Hairstyling"
              onChange={(e) => setProfileDraft({ ...profileDraft, department: e.target.value })} /></div>
          <div className="field"><label>Designation</label>
            <input value={editingProfile ? profileDraft.designation : (s.designation || '')} disabled={!editingProfile}
              placeholder="e.g. Senior Stylist"
              onChange={(e) => setProfileDraft({ ...profileDraft, designation: e.target.value })} /></div>
          <div className="field"><label>Emergency contact</label>
            <input value={editingProfile ? profileDraft.emergency_contact : (s.emergency_contact || '')} disabled={!editingProfile}
              placeholder="+91…"
              onChange={(e) => setProfileDraft({ ...profileDraft, emergency_contact: e.target.value })} /></div>
          <div className="field"><label>Aadhaar number</label>
            <input value={editingProfile ? profileDraft.aadhar_number : (s.aadhar_number || '')} disabled={!editingProfile}
              placeholder="XXXX XXXX XXXX"
              onChange={(e) => setProfileDraft({ ...profileDraft, aadhar_number: e.target.value })} /></div>
          {canSalaryView && (
            <div className="field"><label>Base salary (₹)</label>
              <input type="number" value={editingProfile ? profileDraft.compensation : (s.compensation ?? 0)} disabled={!editingProfile}
                onChange={(e) => setProfileDraft({ ...profileDraft, compensation: e.target.value })} /></div>
          )}
          <div className="field"><label>Visible to customers</label>
            <select value={editingProfile ? (profileDraft.visible_to_customers ? 'Yes' : 'No') : ((s.visible_to_customers ?? true) ? 'Yes' : 'No')} disabled={!editingProfile}
              onChange={(e) => setProfileDraft({ ...profileDraft, visible_to_customers: e.target.value === 'Yes' })}>
              <option>Yes</option><option>No</option>
            </select></div>
        </div>

        {/* Documents — collapsible, shown right under the profile details */}
        {canDocuments && (
          <div className={`doc-collapse ${docsSecOpen ? 'open' : ''}`} data-testid="profile-docs-collapse">
            <button type="button" className="doc-collapse-h" onClick={() => setDocsSecOpen((v) => !v)} data-testid="profile-docs-toggle">
              <span className="dch-l">
                <svg viewBox="0 0 24 24" className="dch-ic"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                Documents
                <span className="dch-ct">{(docs[selectedId] || []).length}</span>
              </span>
              <svg viewBox="0 0 24 24" className="dch-chev"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {docsSecOpen && (
              <div className="doc-collapse-b">
                {renderDocumentsBody()}
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  const renderAttendanceBody = () => {
    if (!canAttendance) {
      return <div className="rbac-lock"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>You don't have permission to view attendance.</div>;
    }
    const s = selected;
    const M = salonSettings;
    const isCI = M.attendance_method === 'checkinout' || M.attendance_method === 'geo_checkin';
    return (
      <>
        <div className="method-note">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          Rules come from <b style={{ margin: '0 4px' }}>Settings → Staff &amp; Attendance</b>. Current method: <b style={{ marginLeft: 4 }}>{isCI ? 'Check-in / Check-out' : 'Service completion'}</b>
        </div>
        {isCI && (
          <>
            <div className="secttl">Check-in / check-out rules</div>
            <div className="shift-grid">
              <div className="shift-c"><span className="k">Shift</span><span className="v">{M.shift_start} – {M.shift_end}</span></div>
              <div className="shift-c"><span className="k">Grace period</span><span className="v">{M.grace_period_min} min</span></div>
              <div className="shift-c"><span className="k">Half-day under</span><span className="v">{M.half_day_max_hours} hrs</span></div>
              <div className="shift-c"><span className="k">Full day min</span><span className="v">{M.min_hours_full_day} hrs</span></div>
              <div className="shift-c"><span className="k">Auto check-out</span><span className="v">{M.auto_checkout ? M.auto_checkout_time : 'Off'}</span></div>
              <div className="shift-c"><span className="k">Overtime after</span><span className="v">{M.overtime_after_hours} hrs</span></div>
              <div className="shift-c"><span className="k">Self check-in</span><span className="v">{M.allow_self_checkin ? 'Allowed' : 'Admin only'}</span></div>
              <div className="shift-c"><span className="k">Geo-fence</span><span className="v">{M.geofence_required ? 'Required' : 'Off'}</span></div>
              <div className="shift-c"><span className="k">Weekly off</span><span className="v">{M.weekly_off}</span></div>
            </div>
          </>
        )}
        <div className="secttl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="month"
              value={attMonth}
              max={new Date().toISOString().slice(0, 7)}
              onChange={(e) => setAttMonth(e.target.value || attMonth)}
              data-testid="att-month-picker"
              style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', background: 'var(--surface)', outline: 'none' }}
            />
            <button className="btn-ghost" style={{ padding: '7px 11px' }} onClick={fetchAttendanceMonth} data-testid="att-refresh-btn" title="Refresh counts">
              <svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-ghost" style={{ padding: '9px 14px' }} onClick={openAttDrawer} data-testid="staff-mark-attendance-btn">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>Mark attendance
            </button>
            {canSalaryPay && (
              <button className="btn-primary" style={{ padding: '9px 14px' }} onClick={openSalDrawer} data-testid="staff-mark-salary-btn">
                <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Mark salary paid
              </button>
            )}
          </div>
        </div>
        <AttendanceCalendar month={attMonth} days={(attendanceGrid[s.id] || {}).days || {}} />
        <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, color: 'var(--green)', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}>
            <path d="M23 4v6h-6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>
          </svg>
          Home-page admin check-in/out writes this same record — always in sync.
        </p>

        {canSalaryView && (
          <>
            <div className="secttl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 }}>
              <span>Payment history</span>
              <button
                className="btn-ghost"
                style={{ padding: '7px 12px' }}
                onClick={loadPayHistory}
                disabled={payHistoryLoading}
                data-testid="pay-history-refresh"
              >
                <svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
                {payHistoryLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            {payHistory.length === 0 ? (
              <div style={{ padding: '18px 12px', color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', background: 'var(--paper-2, #FAF6EE)', borderRadius: 10 }}>
                No payments recorded yet for {selected.name}.
              </div>
            ) : (
              <div className="pay-history" data-testid="pay-history-list">
                <table className="svc-tbl pay-tbl">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Method</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payHistory.map((p) => (
                      <tr key={p.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{p.date || '—'}</td>
                        <td>
                          <span className={`pay-badge pay-${p.type || 'salary'}`}>
                            {p.type_label || (p.category || '').replace('staff_', '')}
                            {p.month ? ` · ${p.month}` : ''}
                          </span>
                        </td>
                        <td style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.4px' }}>{p.payment_method || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{rupee(p.amount)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 12.5 }}>{p.narration || p.description || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </>
    );
  };

  const renderServicesBody = () => {
    if (!canEdit && !isAdmin) {
      return <div className="rbac-lock"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>You don't have permission to manage services.</div>;
    }
    const map = barberServices[selectedId] || {};
    // Group services by sub_category (fallback to category)
    const groups = {};
    (services || []).forEach((c) => {
      const cat = c.sub_category || c.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });
    const groupNames = Object.keys(groups).sort();
    const allIds = (services || []).map((c) => c.id);
    const allOn = allIds.length > 0 && allIds.every((id) => map[id]?.on);

    return (
      <>
        <div className="secttl">
          Services by {selected.name}
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'none', letterSpacing: 0 }}>
            Only ticked services are bookable with this barber
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ padding: '7px 12px' }} onClick={() => setServicesBulk(allIds, !allOn)} data-testid="svc-select-all">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              {allOn ? 'Deselect all' : 'Select all services'}
            </button>
          </div>
        </div>
        {groupNames.map((cat, gi) => {
          const rows = groups[cat];
          const catIds = rows.map((r) => r.id);
          const catCount = catIds.filter((id) => map[id]?.on).length;
          const catAllOn = catCount === catIds.length;
          // Collapsed by default except the first group; remember user toggles.
          const collapsed = svcCatCollapsed[cat] === undefined ? gi !== 0 : svcCatCollapsed[cat];
          const toggleCollapse = () => setSvcCatCollapsed((prev) => ({ ...prev, [cat]: !collapsed }));
          return (
            <div key={cat} className="svc-cat-block" style={{ marginBottom: 10 }}>
              <div className="svc-cat-head" style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--soft)', padding: '9px 12px',
                borderRadius: 10, marginBottom: collapsed ? 0 : 6, cursor: 'pointer',
              }} onClick={toggleCollapse} data-testid={`svc-cat-head-${cat}`}>
                <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, color: 'var(--muted)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s', flex: 'none' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <b style={{ fontSize: 13, letterSpacing: 0.2 }}>{cat}</b>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>({catCount}/{catIds.length})</span>
                <button className="btn-ghost" style={{ padding: '5px 10px', marginLeft: 'auto', fontSize: 11 }}
                  onClick={(e) => { e.stopPropagation(); setServicesBulk(catIds, !catAllOn); }}
                  data-testid={`svc-cat-toggle-${cat}`}>
                  {catAllOn ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              {!collapsed && (
              <table className="svc-tbl compact">
                <thead><tr>
                  <th style={{ width: 34 }}></th><th>Service</th><th>Salon price</th><th>{selected.name}'s price</th><th></th>
                </tr></thead>
                <tbody>
                  {rows.map((c) => {
                    const st = map[c.id] || { on: false, price: null };
                    const base = Number(c.base_price || c.price || 0);
                    const ovr = st.on && st.price !== null && st.price !== base;
                    return (
                      <tr key={c.id} className={st.on ? '' : 'off'}>
                        <td><div className={`cbx ${st.on ? 'on' : ''}`} onClick={() => toggleService(c.id)}>
                          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        </div></td>
                        <td className="svc-n"><b>{c.service_name || c.name}</b><span>{c.default_duration || c.duration || 30} min</span></td>
                        <td><span className="base-p">{rupee(base)}</span></td>
                        <td>
                          <input className="price-in" defaultValue={st.on ? (st.price ?? base) : ''}
                            placeholder={String(base)} disabled={!st.on} />
                        </td>
                        <td style={{ textAlign: 'right' }}>{ovr && <span className="ovr">Custom</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>
          );
        })}
      </>
    );
  };

  const renderDocumentsBody = () => {
    if (!canDocuments) {
      return <div className="rbac-lock"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>You don't have permission to view documents.</div>;
    }
    const list = docs[selectedId] || [];
    const byType = list.reduce((acc, d) => { (acc[d.doc_type] = acc[d.doc_type] || []).push(d); return acc; }, {});
    const SLOTS = [
      { type: 'aadhar_front', label: 'Aadhaar card', hint: 'Front side of Aadhaar', ico: <><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></> },
      { type: 'agreement', label: 'Employment agreement', hint: 'Signed offer / contract', ico: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></> },
      { type: 'bank_details', label: 'Bank / UPI details', hint: 'For salary transfer', ico: <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></> },
    ];
    const otherDocs = list.filter((d) => !SLOTS.find((s) => s.type === d.doc_type));

    const renderRow = (slot) => {
      const uploaded = (byType[slot.type] || [])[0];
      const status = uploaded ? 'done' : 'empty';
      return (
        <div className="doc-row" key={slot.type}>
          <div className={`di ${status}`}>
            <svg viewBox="0 0 24 24">{slot.ico}</svg>
          </div>
          <div className="dd">
            <b>{slot.label}</b>
            <span>
              {uploaded
                ? `${uploaded.file_name || 'Uploaded'} · ${uploaded.size_kb || 0} KB`
                : slot.hint}
            </span>
          </div>
          <div className="actions">
            {uploaded && (
              <>
                <button title="Preview" onClick={() => previewDoc(uploaded.id)} data-testid={`doc-preview-${slot.type}`}>
                  <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button title="Replace" onClick={() => uploadDoc(slot.type)} data-testid={`doc-replace-${slot.type}`}>
                  <svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
                </button>
                <button title="Delete" className="danger" onClick={() => deleteDoc(uploaded.id)} data-testid={`doc-delete-${slot.type}`}>
                  <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </>
            )}
            {!uploaded && (
              <button title="Upload" onClick={() => uploadDoc(slot.type)} data-testid={`doc-upload-${slot.type}`}>
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </button>
            )}
          </div>
        </div>
      );
    };

    return (
      <>
        <div className="secttl">
          Documents
          <button className="btn-ghost" style={{ padding: '7px 12px' }} onClick={() => uploadDoc('other')} disabled={docBusy} data-testid="doc-upload-other">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {docBusy ? 'Uploading…' : 'Upload other'}
          </button>
        </div>
        {SLOTS.map(renderRow)}
        {otherDocs.length > 0 && (
          <>
            <div className="secttl" style={{ marginTop: 18 }}>Other documents</div>
            {otherDocs.map((d) => (
              <div className="doc-row" key={d.id}>
                <div className="di done">
                  <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                </div>
                <div className="dd">
                  <b>{d.label || d.file_name || 'Document'}</b>
                  <span>{d.file_name || ''} · {d.size_kb || 0} KB</span>
                </div>
                <div className="actions">
                  <button title="Preview" onClick={() => previewDoc(d.id)}>
                    <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button title="Delete" className="danger" onClick={() => deleteDoc(d.id)}>
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Hidden file input used by every upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          style={{ display: 'none' }}
          onChange={onFileSelected}
          data-testid="doc-file-input"
        />

        {/* Preview modal */}
        {preview && (
          <div className="doc-preview-ov" onClick={() => setPreview(null)}>
            <div className="doc-preview" onClick={(e) => e.stopPropagation()}>
              <div className="ph">
                <b>{preview.label || preview.file_name || 'Document'}</b>
                <button className="close" onClick={() => setPreview(null)} aria-label="Close">
                  <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="pb">
                {preview.file_data && preview.mime_type?.startsWith('image/') && (
                  <img src={preview.file_data} alt={preview.label || preview.file_name || ''} />
                )}
                {preview.file_data && preview.mime_type === 'application/pdf' && (
                  <iframe src={preview.file_data} title={preview.label || 'PDF'} />
                )}
                {(!preview.file_data ||
                  (!preview.mime_type?.startsWith('image/') && preview.mime_type !== 'application/pdf')) && (
                  <div className="empty">Preview not available for this file type</div>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderAccessBody = () => {
    if (!canAccess) {
      return <div className="rbac-lock"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>You don't have permission to manage access. Ask your admin to open Roles &amp; Access.</div>;
    }
    return (
      <StaffAccessSection
        salonId={salonId}
        barber={selected}
        getAuthHeaders={getAuthHeaders}
        onManageRoles={() => { setViewMode('roles'); }}
      />
    );
  };

  const renderDetailPane = () => {
    if (!selected) return <div className="pane-r"><div className="rbac-lock">Select a staff member from the left to view details.</div></div>;
    return (
      <div className="pane-r">
        <div className="dhead">
          <div className="av" style={{ background: colorFor(selected.name) }}>{initial(selected.name)}</div>
          <div className="dn">
            <h3>{selected.name}</h3>
            <div className="meta">
              <span style={{ textTransform: 'capitalize' }}>
                {selected.category || 'Junior'}{selected.designation ? ' · ' + selected.designation : ''}
              </span>
              <span>
                <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.27a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0 1 22 16.92z"/></svg>
                {selected.phone || selected.mobile || '—'}
              </span>
              <span>
                <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {salon?.city || 'Main Branch'}
              </span>
            </div>
          </div>
          {canDelete && (
            <button className="btn-danger" onClick={handleDeleteStaff}>
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete
            </button>
          )}
        </div>
        <div className="pane-body">
          {section === 'profile' && renderProfileBody()}
          {section === 'attendance' && renderAttendanceBody()}
          {section === 'services' && renderServicesBody()}
          {section === 'documents' && renderDocumentsBody()}
          {section === 'access' && renderAccessBody()}
        </div>
      </div>
    );
  };

  return (
    <div className="staffv3">
      <div className="phead">
        <h2>
          <span className="hic">
            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
          </span>
          Staff Management
        </h2>
      </div>

      <div className={`workspace ${viewMode === 'roles' ? 'workspace--full' : ''}`}>
        {viewMode === 'roles' ? (
          <div style={{ width: '100%' }}>
            <button className="btn-ghost" style={{ padding: '7px 12px', marginBottom: 12 }} onClick={() => setViewMode('staff')} data-testid="roles-back">
              <svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              Back to staff
            </button>
            <RolesAndAccessView
              salonId={salonId}
              onOpenStaff={(sid) => { setViewMode('staff'); setSelectedId(sid); setSection('access'); }}
            />
          </div>
        ) : (
          <>
            {renderStaffList()}
            {renderDetailPane()}
          </>
        )}
      </div>

      {/* Mark Attendance drawer */}
      <div className={`staffv3-ov ${attOpen ? 'open' : ''}`} onClick={() => !attBusy && setAttOpen(false)} />
      <aside className={`staffv3-drawer wide ${attOpen ? 'open' : ''}`}>
        <div className="dh">
          <div className="tt">
            <div className="ic">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>
            </div>
            <div>
              <h3>Mark Attendance {selected ? `— ${selected.name}` : ''}</h3>
              <p>Select dates, then mark or bulk-apply</p>
            </div>
          </div>
          <button className="close" onClick={() => setAttOpen(false)} disabled={attBusy}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="db-scroll">
          <div className="range-row">
            <div className="field">
              <label>From</label>
              <input type="date" value={attFrom} max={attTo || undefined} onChange={(e) => setAttFrom(e.target.value)} data-testid="att-drawer-from" />
            </div>
            <div className="field">
              <label>To</label>
              <input type="date" value={attTo} min={attFrom || undefined} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setAttTo(e.target.value)} data-testid="att-drawer-to" />
            </div>
            <button className="btn-ghost" onClick={() => buildAttRows()} data-testid="att-drawer-load">
              <svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Load dates
            </button>
          </div>
          <div className="range-row" style={{ marginTop: -4, marginBottom: 6, gap: 8 }}>
            <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => applyAttRange('thisWeek')} data-testid="att-range-week">This week</button>
            <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => applyAttRange('thisMonth')} data-testid="att-range-this-month">This month</button>
            <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => applyAttRange('lastMonth')} data-testid="att-range-last-month">Last month</button>
          </div>
          {attRows.length > 0 && (
            <div className="bulkbar">
              <span className="bt">{attRows.filter((r) => r.sel).length || attRows.length} {attRows.some((r) => r.sel) ? 'selected' : 'all'}</span>
              <button className="btn-ghost" onClick={() => bulkStatus('P')} data-testid="bulk-present">Present</button>
              <button className="btn-ghost" onClick={() => bulkStatus('A')} data-testid="bulk-absent">Absent</button>
              <button className="btn-ghost" onClick={() => bulkStatus('H')} data-testid="bulk-halfday">Half-day</button>
              <button className="btn-ghost" onClick={() => bulkStatus('HO')} data-testid="bulk-holiday">Holiday</button>
              <button className="btn-ghost" onClick={() => bulkStatus('L')} data-testid="bulk-leave">Leave</button>
              <button className="btn-ghost" onClick={() => bulkStatus('')} data-testid="bulk-clear">Clear</button>
            </div>
          )}
          {attRows.length > 0 && (
            <table className="att-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <div className={`cbx ${attRows.every((r) => r.sel) ? 'on' : ''}`} onClick={attToggleAll}>
                      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  </th>
                  <th>Date</th>
                  <th style={{ width: 100 }}>In</th>
                  <th style={{ width: 100 }}>Out</th>
                  <th style={{ width: 90 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {attRows.map((r, i) => (
                  <tr key={r.date}>
                    <td>
                      <div className={`cbx ${r.sel ? 'on' : ''}`} onClick={() => attToggleRow(i)}>
                        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    </td>
                    <td>{r.date}</td>
                    <td><input type="time" className="time-in" value={r.in} disabled={!['P', 'H'].includes(r.status)} onChange={(e) => setRow(i, { in: e.target.value })} /></td>
                    <td><input type="time" className="time-in" value={r.out} disabled={r.status !== 'P'} onChange={(e) => setRow(i, { out: e.target.value })} /></td>
                    <td>
                      {r.status ? (
                        <span className={`st-pill st-${r.status}`}>{r.status}</span>
                      ) : (
                        <span className="st-pill st-">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {attRows.length === 0 && (
            <div style={{ padding: '30px 10px', textAlign: 'center', color: '#8A7F90', fontSize: 12.5 }}>
              Pick a date range and click <b>Load dates</b> to start marking attendance.
            </div>
          )}
        </div>
        <div className="df">
          <span style={{ fontSize: 12, color: '#8A7F90', marginRight: 'auto' }}>
            Method: <b>{salonSettings.attendance_method === 'checkinout' ? 'Check-in / Check-out' : 'Service completion'}</b>
          </span>
          <button className="btn-ghost" onClick={() => setAttOpen(false)} disabled={attBusy}>Cancel</button>
          <button className="btn-primary" onClick={saveAttendance} disabled={attBusy || attRows.length === 0} data-testid="att-drawer-save">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>{attBusy ? 'Saving…' : 'Save attendance'}
          </button>
        </div>
      </aside>

      {/* Mark Salary Paid drawer */}
      <div className={`staffv3-ov ${salOpen ? 'open' : ''}`} onClick={() => !salBusy && setSalOpen(false)} />
      <aside className={`staffv3-drawer ${salOpen ? 'open' : ''}`}>
        <div className="dh">
          <div className="tt">
            <div className="ic">
              <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div>
              <h3>
                {payType === 'salary' ? 'Mark Salary Paid' : payType === 'advance' ? 'Record Advance' : 'Full & Final Settlement'}
                {selected ? ` — ${selected.name}` : ''}
              </h3>
              <p>{payType === 'salary' ? 'Payroll for this cycle' : payType === 'advance' ? 'One-off advance payment' : 'One-off full & final payment'}</p>
            </div>
          </div>
          <button className="close" onClick={() => !salBusy && setSalOpen(false)}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="db">
          {/* Payment type selector */}
          <div className="paytype-row" data-testid="sal-drawer-paytype">
            {[
              { k: 'salary', label: 'Salary' },
              { k: 'advance', label: 'Advance' },
              { k: 'ff', label: 'Full & Final' },
            ].map((opt) => (
              <button
                key={opt.k}
                type="button"
                className={`paytype-pill ${payType === opt.k ? 'on' : ''}`}
                onClick={() => setPayType(opt.k)}
                data-testid={`sal-paytype-${opt.k}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid2">
            <div className="field">
              <label>{payType === 'salary' ? 'Month' : 'Month (optional)'}</label>
              <input
                type="month"
                value={salMonth}
                max={new Date().toISOString().slice(0, 7)}
                onChange={(e) => (payType === 'salary' ? changeSalMonth(e.target.value) : setSalMonth(e.target.value))}
                data-testid="sal-drawer-month"
              />
            </div>
            <div className="field">
              <label>Payment method</label>
              <select value={salMethod} onChange={(e) => setSalMethod(e.target.value)} data-testid="sal-drawer-method">
                <option value="upi">UPI</option>
                <option value="bank">Bank transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            {payType === 'salary' && (
              <>
                <div className="field">
                  <label>Base salary (₹) <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· fixed</span></label>
                  <input type="number" value={salBase} readOnly disabled data-testid="sal-drawer-base"
                    title="Base salary is configured in staff settings" style={{ background: 'var(--line-2)', cursor: 'not-allowed' }} />
                </div>
                <div className="field">
                  <label>Earned salary (₹) <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· auto · editable</span></label>
                  <input type="number" value={salEarned} onChange={(e) => setSalEarned(e.target.value)} data-testid="sal-drawer-earned"
                    title="Auto-prorated to attendance — override if needed" />
                  <span className="idnote" style={{ marginTop: 4 }} data-testid="sal-earned-meta">
                    {salDaysInfo.present} present / {salDaysInfo.working} working days
                    {salDaysInfo.holidays ? ` · ${salDaysInfo.holidays} holiday` : ''}
                    {salDaysInfo.absent ? ` · ${salDaysInfo.absent} absent` : ''}
                  </span>
                </div>
                <div className="field">
                  <label>Incentives (₹) <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· auto · editable</span></label>
                  <input type="number" value={salInc} onChange={(e) => setSalInc(e.target.value)} data-testid="sal-drawer-incentive"
                    title="Auto-calculated from reward plan — override if needed" />
                  <span className="idnote" style={{ marginTop: 4 }} data-testid="sal-incentive-meta">
                    Target {rupee(salIncMeta.target)} · Actual {rupee(salIncMeta.actual)}
                    {salIncMeta.achievement_pct ? ` · ${Number(salIncMeta.achievement_pct).toFixed(0)}%` : ''}
                  </span>
                </div>
                <div className="field">
                  <label>Deductions (₹) <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· manual</span></label>
                  <input type="number" value={salDed} onChange={(e) => setSalDed(e.target.value)} data-testid="sal-drawer-deductions" />
                </div>
                <div className="field">
                  <label>Advance adjusted (₹)</label>
                  <input type="number" value={salAdv} onChange={(e) => setSalAdv(e.target.value)} data-testid="sal-drawer-advance" />
                </div>
              </>
            )}

            {payType !== 'salary' && (
              <>
                <div className="field">
                  <label>Amount (₹) <span className="req">*</span></label>
                  <input
                    type="number"
                    min="0"
                    value={salAmount}
                    onChange={(e) => setSalAmount(e.target.value)}
                    data-testid="sal-drawer-amount"
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / span 2' }}>
                  <label>Note (optional)</label>
                  <input
                    value={salNote}
                    placeholder={payType === 'advance' ? 'Reason for advance…' : 'F&F remarks…'}
                    onChange={(e) => setSalNote(e.target.value)}
                    data-testid="sal-drawer-note"
                  />
                </div>
              </>
            )}
          </div>

          <div className="payline">
            <div className="pl">
              <span>Amount payable</span>
              <b data-testid="sal-net">
                {rupee(payType === 'salary' ? salDisplayedNet : Number(salAmount || 0))}
              </b>
            </div>
            <button className="btn-ghost" onClick={recalcNet} data-testid="sal-drawer-recalc">
              <svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
              Recalculate
            </button>
            {payType === 'salary' && salRecord?.is_paid && (
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                Already paid
              </span>
            )}
          </div>
          {payType === 'salary' ? (
            <p style={{ fontSize: 11.5, color: '#8A7F90', marginTop: 10, lineHeight: 1.5 }}>
              Base salary is fixed (edit it in staff settings) and the incentive is auto-calculated from the reward plan. Adjust deductions / advance and click <b>Recalculate</b> to preview the net payable before saving.
            </p>
          ) : (
            <p style={{ fontSize: 11.5, color: '#8A7F90', marginTop: 10, lineHeight: 1.5 }}>
              {payType === 'advance'
                ? 'Advance is recorded as a one-off expense against this staff and shows in Payment history — it is not tied to any month.'
                : 'Full & Final is recorded as a one-off expense against this staff and shows in Payment history.'}
            </p>
          )}
        </div>
        <div className="df" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={() => setSalOpen(false)} disabled={salBusy}>Cancel</button>
          <button
            className="btn-primary"
            onClick={markSalaryPaid}
            disabled={salBusy || (payType === 'salary' && salRecord?.is_paid) || (payType !== 'salary' && !(Number(salAmount) > 0))}
            data-testid="sal-drawer-save"
          >
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            {salBusy ? 'Saving…' : payType === 'salary' ? 'Mark as paid' : payType === 'advance' ? 'Record advance' : 'Record F&F'}
          </button>
        </div>
      </aside>

      {/* Add Staff drawer */}
      <div className={`staffv3-ov ${addOpen ? 'open' : ''}`} onClick={() => !addBusy && setAddOpen(false)} />
      <aside className={`staffv3-drawer wide ${addOpen ? 'open' : ''}`}>
        <div className="dh">
          <div className="tt">
            <div className="ic"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg></div>
            <div><h3>Add Staff</h3><p>Mobile number becomes the login ID</p></div>
          </div>
          <button className="close" onClick={() => !addBusy && setAddOpen(false)}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="db">
          {/* Basic details */}
          <div className="dsec-title">Basic details</div>
          <div className="grid3">
            <div className="field span2"><label>Full name <span className="req">*</span></label>
              <input value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} placeholder="e.g. Ravi Kumar" /></div>
            <div className="field"><label>Mobile <span className="req">*</span></label>
              <input value={newStaff.mobile}
                onChange={(e) => setNewStaff({ ...newStaff, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                placeholder="10-digit" inputMode="numeric" /></div>
            <div className="field"><label>DOB</label>
              <input type="date" value={newStaff.dob} onChange={(e) => setNewStaff({ ...newStaff, dob: e.target.value })} /></div>
            <div className="field"><label>Date of joining</label>
              <input type="date" value={newStaff.doj} onChange={(e) => setNewStaff({ ...newStaff, doj: e.target.value })} /></div>
            <div className="field"><label>Emergency contact</label>
              <input value={newStaff.emergency_contact}
                onChange={(e) => setNewStaff({ ...newStaff, emergency_contact: e.target.value })} placeholder="+91…" /></div>
            <div className="field span3">
              <span className="idnote"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>Mobile number is the unique login ID for this staff.</span>
            </div>
          </div>

          {/* Role & experience */}
          <div className="dsec-title">Role &amp; experience</div>
          <div className="grid3">
            <div className="field"><label>Category</label>
              <select value={newStaff.category} onChange={(e) => setNewStaff({ ...newStaff, category: e.target.value })}>
                <option>Junior</option><option>Star</option><option>Master</option>
              </select></div>
            <div className="field"><label>Experience (yrs)</label>
              <input type="number" min="0" value={newStaff.experience}
                onChange={(e) => setNewStaff({ ...newStaff, experience: e.target.value })} /></div>
            <div className="field"><label>Base salary (₹)</label>
              <input type="number" min="0" value={newStaff.compensation}
                onChange={(e) => setNewStaff({ ...newStaff, compensation: e.target.value })} placeholder="Monthly" /></div>
            <div className="field"><label>Department</label>
              <input value={newStaff.department}
                onChange={(e) => setNewStaff({ ...newStaff, department: e.target.value })} placeholder="e.g. Hairstyling" /></div>
            <div className="field"><label>Designation</label>
              <input value={newStaff.designation}
                onChange={(e) => setNewStaff({ ...newStaff, designation: e.target.value })} placeholder="e.g. Stylist" /></div>
            <div className="field"><label>Specialization</label>
              <input value={newStaff.specialization}
                onChange={(e) => setNewStaff({ ...newStaff, specialization: e.target.value })} placeholder="e.g. Hair color" /></div>
            <div className="field"><label>Gender specialization</label>
              <select value={newStaff.gender_specialization}
                onChange={(e) => setNewStaff({ ...newStaff, gender_specialization: e.target.value })}>
                <option value="">Select…</option>
                <option value="Men">Men</option>
                <option value="Women">Women</option>
                <option value="Unisex">Unisex</option>
                <option value="Kids">Kids</option>
              </select></div>
            <div className="field"><label>Visible to customers</label>
              <select value={newStaff.is_barber ? 'Yes' : 'No'}
                onChange={(e) => setNewStaff({ ...newStaff, is_barber: e.target.value === 'Yes' })}>
                <option>Yes</option><option>No</option>
              </select></div>
          </div>

          {/* Identity */}
          <div className="dsec-title">Identity</div>
          <div className="grid3">
            <div className="field span2"><label>Aadhaar number</label>
              <input value={newStaff.aadhar_number}
                onChange={(e) => setNewStaff({ ...newStaff, aadhar_number: e.target.value.replace(/[^0-9\s]/g, '').slice(0, 14) })}
                placeholder="XXXX XXXX XXXX" inputMode="numeric" /></div>
          </div>

          {/* Documents */}
          <div className="dsec-title">Documents <span className="dsec-sub">Optional · max 10 MB each</span></div>
          <div className="doc-grid">
            {DOC_SLOTS.map((slot) => {
              const meta = newDocs[slot.key];
              return (
                <label key={slot.key} className={`doc-slot ${meta ? 'has' : ''}`}>
                  <input
                    type="file"
                    accept={slot.accept}
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) return toast.error('File too large (max 10 MB)');
                      try {
                        const dataUrl = await fileToDataUrl(file);
                        setNewDocs((prev) => ({
                          ...prev,
                          [slot.key]: { file, dataUrl, name: file.name, mime: file.type, size: file.size },
                        }));
                      } catch (_) { toast.error('Could not read file'); }
                    }}
                  />
                  <div className="ds-ic">
                    {meta ? (
                      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    )}
                  </div>
                  <div className="ds-tx">
                    <b>{slot.label}</b>
                    <span>{meta ? meta.name : 'Click to upload'}</span>
                  </div>
                  {meta && (
                    <button
                      type="button"
                      className="ds-rm"
                      onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setNewDocs((prev) => { const n = { ...prev }; delete n[slot.key]; return n; }); }}
                      title="Remove"
                    >
                      <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </label>
              );
            })}
          </div>
        </div>
        <div className="df">
          <button className="btn-ghost" disabled={addBusy} onClick={() => setAddOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleAddStaff} disabled={addBusy} data-testid="add-staff-submit">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>{addBusy ? 'Adding…' : 'Add staff'}
          </button>
        </div>
      </aside>

      {/* Branch Transfer drawer */}
      <div className={`staffv3-ov ${transferOpen ? 'open' : ''}`} onClick={() => !transferBusy && setTransferOpen(false)} />
      <aside className={`staffv3-drawer ${transferOpen ? 'open' : ''}`} data-testid="branch-transfer-drawer">
        <div className="dh">
          <div className="tt">
            <div className="ic">
              <svg viewBox="0 0 24 24"><path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/></svg>
            </div>
            <div>
              <h3>Switch branch {selected ? `— ${selected.name}` : ''}</h3>
              <p>Transfer the staff to another branch of the salon</p>
            </div>
          </div>
          <button className="close" onClick={() => setTransferOpen(false)} disabled={transferBusy}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="db-scroll">
          <div className="grid2">
            <div className="field">
              <label>Current branch</label>
              <input value={(branchesList.find((b) => (b.id || b.branch_id) === selected?.branch_id) || {}).name || '—'} disabled />
            </div>
            <div className="field">
              <label>Move to <span className="req">*</span></label>
              <select value={transferBranchId} onChange={(e) => setTransferBranchId(e.target.value)} data-testid="transfer-branch">
                <option value="">Select branch…</option>
                {branchesList.map((b) => (
                  <option key={b.id || b.branch_id} value={b.id || b.branch_id}>{b.name || b.branch_name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Effective date</label>
              <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} data-testid="transfer-date" />
            </div>
            <div className="field" style={{ gridColumn: '1 / span 2' }}>
              <label>Remarks (optional)</label>
              <input value={transferRemarks} onChange={(e) => setTransferRemarks(e.target.value)} placeholder="e.g. Requested by owner" data-testid="transfer-remarks" />
            </div>
          </div>
        </div>
        <div className="df">
          <button className="btn-ghost" disabled={transferBusy} onClick={() => setTransferOpen(false)}>Cancel</button>
          <button className="btn-primary" disabled={transferBusy || !transferBranchId} onClick={saveTransfer} data-testid="transfer-save">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>{transferBusy ? 'Saving…' : 'Confirm transfer'}
          </button>
        </div>
      </aside>
    </div>
  );
}
