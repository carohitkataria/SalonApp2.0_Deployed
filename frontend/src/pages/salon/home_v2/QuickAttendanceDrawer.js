/**
 * QuickAttendanceDrawer.js — standalone "Mark today's attendance" drawer.
 *
 * Extracted from SalonStaffV3's quick-attendance ribbon so the right-side
 * ribbon (Home + every other page) can open it WITHOUT navigating to the
 * Staff page. It self-fetches the active staff list and salon attendance
 * settings, then posts to /salons/{id}/attendance/mark — identical payload
 * to the Staff page, so behaviour is unchanged.
 *
 * Rendered via a React portal to document.body so it stacks above the ribbon.
 */
import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { STAFF_V3_CSS } from '../redesign/StaffV3Styles';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const AV_COLORS = ['#C6389E', '#12A594', '#3E93E8', '#E8952B', '#8A5CD1', '#2FA96A'];
const colorFor = (s = '') => AV_COLORS[(String(s || '?').charCodeAt(0) || 0) % AV_COLORS.length];
const initial = (s = '') => (s || 'S').trim().charAt(0).toUpperCase();
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const formatApiError = (err, fallback = 'Something went wrong') => {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || '').filter(Boolean).join(', ') || fallback;
  return err?.message || fallback;
};

const ATT_CYCLE = ['present', 'half_day', 'absent', 'holiday', 'on_leave'];
const ATT_META = {
  present:  { lb: 'P',  full: 'Present',  bg: '#E4F6ED', fg: '#1F8F52' },
  half_day: { lb: 'HD', full: 'Half day', bg: '#F1EEFF', fg: '#6C4FE0' },
  absent:   { lb: 'A',  full: 'Absent',   bg: '#FCE4EC', fg: '#C33C5F' },
  holiday:  { lb: 'H',  full: 'Holiday',  bg: '#F1F2F6', fg: '#7C8092' },
  on_leave: { lb: 'L',  full: 'On leave', bg: '#FFF3DC', fg: '#B87A0A' },
};

function useStaffV3Styles() {
  useEffect(() => {
    const id = 'staff-v3-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = STAFF_V3_CSS;
    document.head.appendChild(el);
  }, []);
}

export default function QuickAttendanceDrawer({ open, onClose, salonId, getAuthHeaders }) {
  useStaffV3Styles();

  const [staff, setStaff] = useState([]);
  const [settings, setSettings] = useState({ attendance_method: 'service_completion', shift_start: '10:00' });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({}); // { barber_id: 'present'|... }
  const [times, setTimes] = useState({});   // { barber_id: {check_in, check_out} }
  const [date, setDate] = useState(todayIST());

  const authHeaders = useCallback(() => {
    try { return (getAuthHeaders && getAuthHeaders()) || {}; } catch (_) { return {}; }
  }, [getAuthHeaders]);

  const isGeoMode = ['checkinout', 'geo_checkin', 'geo'].includes(settings?.attendance_method);
  const activeStaff = (staff || []).filter((s) => s.is_active !== false);

  // Fetch staff + settings whenever the drawer is opened.
  useEffect(() => {
    if (!open || !salonId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [barbersRes, salonRes] = await Promise.all([
          axios.get(`${API}/salons/${salonId}/barbers?include_inactive=true`, { headers: authHeaders() }),
          axios.get(`${API}/salons/${salonId}`).catch(() => ({ data: {} })),
        ]);
        if (cancelled) return;
        const list = Array.isArray(barbersRes.data) ? barbersRes.data : [];
        const salonData = salonRes.data?.salon || salonRes.data || {};
        const st = {
          attendance_method: salonData.attendance_mode || salonData.attendance_method || 'service_completion',
          shift_start: salonData.shift_start || '10:00',
        };
        setStaff(list);
        setSettings(st);
        const act = list.filter((s) => s.is_active !== false);
        const initS = {}; const initT = {};
        act.forEach((s) => {
          initS[s.id] = 'present';
          initT[s.id] = { check_in: st.shift_start || '10:00', check_out: '' };
        });
        setStatus(initS);
        setTimes(initT);
        setDate(todayIST());
      } catch (err) {
        if (!cancelled) toast.error(formatApiError(err, 'Could not load staff'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, salonId, authHeaders]);

  const setStatusFor = (id, s) => setStatus((prev) => ({ ...prev, [id]: s }));
  const setTimeFor = (id, key, val) => setTimes((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: val } }));
  const setAll = (s) => { const m = {}; activeStaff.forEach((x) => { m[x.id] = s; }); setStatus(m); };

  const save = async () => {
    setBusy(true);
    try {
      let rows;
      if (isGeoMode) {
        rows = activeStaff.map((s) => {
          const t = times[s.id] || {};
          const st = status[s.id];
          if (st && st !== 'present' && st !== 'half_day') return { barber_id: s.id, status: st };
          return { barber_id: s.id, check_in: t.check_in || null, check_out: t.check_out || null };
        });
      } else {
        rows = activeStaff.map((s) => ({ barber_id: s.id, status: status[s.id] || 'present' }));
      }
      const isToday = date === todayIST();
      const res = await axios.post(`${API}/salons/${salonId}/attendance/mark`, { rows, date },
        { headers: authHeaders() });
      const whenLabel = isToday ? 'today' : new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      toast.success(`Attendance saved for ${res.data?.count ?? rows.length} staff (${whenLabel})`);
      onClose?.();
    } catch (err) {
      toast.error(formatApiError(err, 'Could not save attendance'));
    } finally { setBusy(false); }
  };

  const body = (
    <div className="shv2">
      <div className={`staffv3-ov ${open ? 'open' : ''}`} onClick={() => !busy && onClose?.()} />
      <aside className={`staffv3-drawer wide ${open ? 'open' : ''}`} data-testid="quick-attendance-drawer">
        <div className="dh">
          <div className="tt">
            <div className="ic">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>
            </div>
            <div>
              <h3>{date === todayIST() ? "Mark today's attendance" : 'Back-fill attendance'}</h3>
              <p>{new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} · {isGeoMode ? 'Check-in / check-out times' : 'Tap a staff to change status'}</p>
            </div>
          </div>
          <button className="close" onClick={() => onClose?.()} disabled={busy}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="db-scroll" style={{ padding: '16px 20px' }}>
          {/* Attendance date — today by default, past dates allowed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }} data-testid="quick-attendance-date-row">
            <span style={{ fontSize: 11.5, color: '#8A8EA0', fontWeight: 700 }}>Attendance date</span>
            <input type="date" value={date} max={todayIST()}
              onChange={(e) => { const v = e.target.value; if (v && v <= todayIST()) setDate(v); }}
              data-testid="quick-attendance-date"
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E1DDEE', fontSize: 13, fontWeight: 600, color: '#2B2B3A' }} />
            {date !== todayIST() && (
              <button type="button" onClick={() => setDate(todayIST())}
                style={{ fontSize: 11, fontWeight: 800, border: '1px solid #E1DDEE', background: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', color: '#7C5CFC' }}>
                Back to today
              </button>
            )}
          </div>
          {!isGeoMode && activeStaff.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, color: '#8A8EA0', fontWeight: 700 }}>Set all:</span>
              {ATT_CYCLE.map((st) => (
                <button key={st} onClick={() => setAll(st)}
                  style={{ fontSize: 11, fontWeight: 800, border: 'none', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', background: ATT_META[st].bg, color: ATT_META[st].fg }}>
                  {ATT_META[st].full}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading && <div style={{ fontSize: 12.5, color: '#8A8EA0', padding: 12 }}>Loading staff…</div>}
            {!loading && activeStaff.length === 0 && <div style={{ fontSize: 12.5, color: '#8A8EA0', padding: 12 }}>No active staff to mark.</div>}
            {!loading && activeStaff.map((s) => {
              const st = status[s.id] || 'present';
              const t = times[s.id] || {};
              return (
                <div key={s.id} data-testid={`ribbon-staff-${s.id}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid #ECECF3', borderRadius: 12, padding: '10px 12px', background: '#fff' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: colorFor(s.name), color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{initial(s.name)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#23252F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#9298AA', fontWeight: 600 }}>{s.category || 'Junior'}</span>
                    </span>
                  </span>
                  {isGeoMode ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                      {(st === 'absent' || st === 'holiday' || st === 'on_leave') ? (
                        <span style={{ fontSize: 11, fontWeight: 900, borderRadius: 7, padding: '4px 10px', background: ATT_META[st].bg, color: ATT_META[st].fg }}>{ATT_META[st].full}</span>
                      ) : (
                        <>
                          <input type="time" value={t.check_in || ''} onChange={(e) => setTimeFor(s.id, 'check_in', e.target.value)}
                            style={{ border: '1px solid #E4E4EF', borderRadius: 8, padding: '5px 7px', fontSize: 12, fontWeight: 700 }} title="Check-in" />
                          <span style={{ color: '#9298AA', fontSize: 11 }}>→</span>
                          <input type="time" value={t.check_out || ''} onChange={(e) => setTimeFor(s.id, 'check_out', e.target.value)}
                            style={{ border: '1px solid #E4E4EF', borderRadius: 8, padding: '5px 7px', fontSize: 12, fontWeight: 700 }} title="Check-out" />
                        </>
                      )}
                      <select value={(st === 'absent' || st === 'holiday' || st === 'on_leave') ? st : 'present'} onChange={(e) => setStatusFor(s.id, e.target.value)}
                        style={{ border: '1px solid #E4E4EF', borderRadius: 8, padding: '5px 6px', fontSize: 11, fontWeight: 700 }} title="Override">
                        <option value="present">In</option>
                        <option value="absent">A</option>
                        <option value="holiday">H</option>
                        <option value="on_leave">L</option>
                      </select>
                    </span>
                  ) : (
                    <span style={{ display: 'flex', gap: 5, flex: 'none' }}>
                      {ATT_CYCLE.map((code) => {
                        const m = ATT_META[code]; const active = st === code;
                        return (
                          <button key={code} onClick={() => setStatusFor(s.id, code)} title={m.full}
                            style={{ width: 34, height: 30, borderRadius: 8, fontSize: 11, fontWeight: 900, cursor: 'pointer',
                              border: active ? `2px solid ${m.fg}` : '1px solid #ECECF3',
                              background: active ? m.bg : '#FBFBFD', color: active ? m.fg : '#9298AA' }}>
                            {m.lb}
                          </button>
                        );
                      })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="df" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid #F0F0F5' }}>
          <button className="btn-ghost" onClick={() => onClose?.()} disabled={busy} style={{ padding: '9px 16px' }}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy || loading || activeStaff.length === 0} data-testid="quick-attendance-save"
            style={{ padding: '9px 22px', background: '#2FA96A', border: 'none' }}>{busy ? 'Saving…' : 'Save attendance'}</button>
        </div>
      </aside>
    </div>
  );

  return ReactDOM.createPortal(body, document.body);
}
