/*
 * StaffReportSubs.js
 * -------------------
 * The Staff report tab has 4 sub-sections:
 *   1. Overview      -> exported here as StaffOverviewSub  (new, .shv2 themed)
 *   2. Performance   -> exported here as StaffPerformanceSub  (untouched .zen theme)
 *   3. Attendance    -> exported here as StaffAttendanceSub   (untouched .zen theme)
 *   4. Incentives    -> exported here as StaffIncentiveSub    (untouched .zen theme)
 *
 * Overview is the ONLY sub-section styled to match the salon_reports.html design
 * (`.shv2` namespace). Performance / Attendance / Incentives are copied verbatim
 * from the previous ReportsModule.js so the existing behaviour is preserved.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Icon, rupee, injectZenCss } from './opsTheme';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CHART_COLORS = ['#2145C7', '#7CB342', '#D9A82C', '#A61E4D', '#E5556E', '#3E93E8', '#7A5CD1', '#12A594', '#DB8433', '#E5484D'];
const CHART_TOOLTIP = {
  contentStyle: { background: '#fff', border: '1px solid #E6EBF4', borderRadius: 10, fontSize: 12, boxShadow: '0 6px 20px rgba(20,28,46,.08)' },
  labelStyle: { color: '#141C2E', fontWeight: 700 },
};

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
function resolveWindow(view, date) {
  const anchor = date ? new Date(date + 'T00:00:00') : new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  if (view === 'day') return { start: iso(anchor), end: iso(anchor) };
  if (view === 'week') {
    const s = new Date(anchor); s.setDate(anchor.getDate() - anchor.getDay());
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return { start: iso(s), end: iso(e) };
  }
  const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const e = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: iso(s), end: iso(e) };
}

/* -----------------------------------------------------------------------
 * 1. OVERVIEW (new — .shv2 themed, mirrors the design-guide "Staff" layout)
 * -----------------------------------------------------------------------
 * Uses .strip + .card + .rtable + .bar-mini classes from reportsTheme.css.
 * Pulls numbers from:
 *   • /api/salons/{id}/reports/snapshot       (utilization, rebooking, feedback)
 *   • /api/analytics/barber-wise-sales         (revenue/booking by staff)
 *   • /api/salons/{id}/staff-attendance/report (worked hours + present days)
 */
export function StaffOverviewSub({ salonId, view, date, branchId, getAuthHeaders }) {
  const range = useMemo(() => resolveWindow(view, date), [view, date]);
  const [barbers, setBarbers] = useState([]);
  const [snap, setSnap] = useState({ util: 0, rebook: 0, feedback: 0 });
  const [att, setAtt] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const bp = branchId && branchId !== 'all' ? `&branch_id=${branchId}` : '';
      const h = { headers: getAuthHeaders() };
      const [b, s, a] = await Promise.all([
        axios.get(`${API}/analytics/barber-wise-sales?salon_id=${salonId}&start_date=${range.start}&end_date=${range.end}${bp}`, h),
        axios.get(`${API}/salons/${salonId}/reports/snapshot?view=${view}&date=${date}${bp}`, h).catch(() => ({ data: { cards: [] } })),
        axios.get(`${API}/salons/${salonId}/staff-attendance/report?start_date=${range.start}&end_date=${range.end}${bp}`, h).catch(() => ({ data: { rows: [] } })),
      ]);
      setBarbers(b.data?.data || []);
      const cards = s.data?.cards || [];
      const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
      setSnap({
        util: byId.utilization?.total || 0,
        rebook: byId.rebooking?.total || 0,
        feedback: byId.feedback?.total || 0,
      });
      setAtt(a.data?.rows || a.data?.data || []);
    } catch (_) {
      toast.error('Failed to load staff overview');
    } finally { setLoading(false); }
  }, [salonId, range.start, range.end, branchId, getAuthHeaders, view, date]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="empty">Loading staff overview…</div>;

  const totalStaff = barbers.length;
  const totalRevenue = barbers.reduce((a, r) => a + Number(r.total_sales || 0), 0);
  const totalBookings = barbers.reduce((a, r) => a + Number(r.total_bookings || 0), 0);
  const avgTicket = totalBookings ? totalRevenue / totalBookings : 0;
  const top = barbers.slice().sort((a, b) => Number(b.total_sales || 0) - Number(a.total_sales || 0))[0];
  const maxRev = Math.max(1, ...barbers.map((b) => Number(b.total_sales || 0)));
  const presentDays = att.filter((r) => String(r.status || '').toLowerCase() === 'p' || String(r.status || '').toLowerCase() === 'present').length;

  const initials = (n) => (n || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarColor = (i) => ['#1B54C7', '#12A594', '#D9A82C', '#7A5CD1', '#E5556E', '#7CB342', '#DB8433', '#3E93E8'][i % 8];

  return (
    <div data-testid="staff-overview-report">
      {/* Strip — 5 KPI tiles */}
      <div className="strip">
        <div className="sc">
          <div className="ci" style={{ background: '#EEF3FF', color: '#1B54C7' }}><Icon name="users" /></div>
          <b>{totalStaff}</b><span>Active staff</span>
          <small style={{ color: '#6B7793' }}>Served in this window</small>
        </div>
        <div className="sc">
          <div className="ci" style={{ background: '#EFF6E7', color: '#5A8A2E' }}><Icon name="money" /></div>
          <b>{rupee(totalRevenue)}</b><span>Revenue attributed</span>
          <small style={{ color: '#6B7793' }}>{totalBookings} bookings</small>
        </div>
        <div className="sc">
          <div className="ci" style={{ background: '#FCF4E2', color: '#9A7314' }}><Icon name="tag" /></div>
          <b>{rupee(avgTicket)}</b><span>Avg ticket</span>
          <small style={{ color: '#6B7793' }}>Per booking</small>
        </div>
        <div className="sc">
          <div className="ci" style={{ background: '#EFEBFB', color: '#7A5CD1' }}><Icon name="gauge" /></div>
          <b>{Math.round(snap.util)}%</b><span>Utilization</span>
          <small style={{ color: '#6B7793' }}>Booked ÷ available</small>
        </div>
        <div className="sc">
          <div className="ci" style={{ background: '#E4F6F3', color: '#12A594' }}><Icon name="star" /></div>
          <b>{Number(snap.feedback || 0).toFixed(1)}</b><span>Guest rating</span>
          <small style={{ color: '#6B7793' }}>Avg ★ in window</small>
        </div>
      </div>

      {/* Top performer + Rebooking */}
      <div className="g2">
        <div className="card">
          <div className="card__h">
            <div className="t"><Icon name="trendup" /> Top performer</div>
          </div>
          {!top ? <div className="empty">No staff activity yet</div> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="av" style={{ width: 56, height: 56, borderRadius: 14, fontSize: 18, background: avatarColor(0) }}>{initials(top.barber_name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'Plus Jakarta Sans' }}>{top.barber_name}</div>
                <div style={{ fontSize: 12, color: '#6B7793', fontWeight: 600 }}>{top.total_bookings} bookings · {rupee(top.total_sales)}</div>
              </div>
              <span className="pill g">#1</span>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card__h">
            <div className="t"><Icon name="ret" /> Retention</div>
          </div>
          <div className="kv-row"><span className="k">Rebooking rate</span><span className="v">{Math.round(snap.rebook)}%</span></div>
          <div className="kv-row"><span className="k">Present-day records</span><span className="v">{presentDays}</span></div>
          <div className="kv-row"><span className="k">Total staff served</span><span className="v">{totalStaff}</span></div>
        </div>
      </div>

      {/* Staff scorecard */}
      <div className="card">
        <div className="card__h">
          <div className="t"><Icon name="users" /> Staff scorecard</div>
          <span style={{ fontSize: 11, color: '#98A2B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>
            {range.start} → {range.end}
          </span>
        </div>
        {barbers.length === 0 ? (
          <div className="empty">No staff activity in this window</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="rtable">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Bookings</th>
                  <th>Revenue share</th>
                  <th className="r">Revenue</th>
                  <th className="r">Avg ticket</th>
                </tr>
              </thead>
              <tbody>
                {barbers.slice().sort((a, b) => Number(b.total_sales || 0) - Number(a.total_sales || 0)).map((r, i) => (
                  <tr key={r.barber_id || i} data-testid={`staff-overview-row-${i}`}>
                    <td>
                      <span className="nm">
                        <span className="av" style={{ background: avatarColor(i) }}>{initials(r.barber_name)}</span>
                        {r.barber_name}
                      </span>
                    </td>
                    <td><span className="num">{r.total_bookings || 0}</span></td>
                    <td>
                      <div className="bar-mini"><i style={{ width: `${(Number(r.total_sales || 0) / maxRev) * 100}%`, background: avatarColor(i) }} /></div>
                    </td>
                    <td className="r"><span className="num">{rupee(r.total_sales)}</span></td>
                    <td className="r"><span className="num">{rupee(r.total_bookings ? r.total_sales / r.total_bookings : 0)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
 * 2. PERFORMANCE (unchanged — .zen theme, kept verbatim from prior module)
 * -----------------------------------------------------------------------
 */
export function StaffPerformanceSub({ salonId, view, date, branchId, getAuthHeaders }) {
  useEffect(() => { injectZenCss(); }, []);
  const [range, setRange] = useState({ start: isoDaysAgo(10), end: (date || new Date().toISOString().slice(0, 10)) });
  const [dayWise, setDayWise] = useState([]);
  const [barberWise, setBarberWise] = useState([]);
  const [serviceWise, setServiceWise] = useState([]);
  const [gender, setGender] = useState([]);
  const [detailed, setDetailed] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const bp = branchId && branchId !== 'all' ? `&branch_id=${branchId}` : '';
      const q = `salon_id=${salonId}&start_date=${range.start}&end_date=${range.end}${bp}`;
      const h = { headers: getAuthHeaders() };
      const [d, b, s, g, det] = await Promise.all([
        axios.get(`${API}/analytics/day-wise-sales?${q}`, h),
        axios.get(`${API}/analytics/barber-wise-sales?${q}`, h),
        axios.get(`${API}/analytics/service-wise-sales?${q}`, h),
        axios.get(`${API}/analytics/gender-distribution?${q}`, h),
        axios.get(`${API}/analytics/detailed-report?${q}`, h),
      ]);
      setDayWise(d.data?.data || []);
      setBarberWise(b.data?.data || []);
      setServiceWise((s.data?.data || []).slice(0, 10));
      setGender((g.data?.data || []).filter((x) => Number(x.value) > 0));
      setDetailed(det.data?.data || []);
    } catch (e) {
      toast.error('Failed to load performance report');
    } finally { setLoading(false); }
  }, [salonId, range.start, range.end, branchId, getAuthHeaders]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [salonId]);

  const totalSales = dayWise.reduce((a, r) => a + Number(r.total_sales || 0), 0);
  const totalBookings = dayWise.reduce((a, r) => a + Number(r.total_bookings || 0), 0);

  const exportCsv = () => {
    if (!detailed.length) { toast.info('Nothing to export'); return; }
    const head = ['Date', 'Token', 'Customer', 'Phone', 'Barber', 'Services', 'Amount', 'Status', 'Shift', 'Call Time', 'Complete Time', 'Time Taken', 'Payment Status'];
    const body = detailed.map((r) => [r.date, r.token_number, r.customer_name, r.phone, r.barber_name, `"${(r.services || '').replace(/"/g, "'")}"`, r.amount, r.status, r.shift, r.call_time, r.complete_time, r.time_taken, r.payment_status].join(','));
    const csv = [head.join(','), ...body].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `performance_${range.start}_to_${range.end}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  const statusPill = (st) => {
    const s = String(st || '').toLowerCase();
    if (s === 'completed') return 'z-pill--ok';
    if (s === 'skipped' || s === 'waiting' || s === 'in_progress') return 'z-pill--warn';
    if (s === 'cancelled') return 'z-pill--bad';
    return '';
  };

  return (
    <div className="zen" data-testid="staff-performance-report">
      <div className="z-card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-muted)', marginBottom: 4 }}>Start date</div>
          <input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} data-testid="perf-start-date"
                 style={{ padding: '8px 12px', border: '1px solid var(--z-line)', borderRadius: 10, background: '#fff' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-muted)', marginBottom: 4 }}>End date</div>
          <input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} data-testid="perf-end-date"
                 style={{ padding: '8px 12px', border: '1px solid var(--z-line)', borderRadius: 10, background: '#fff' }} />
        </div>
        <button className="z-btn z-btn--pri" onClick={load} disabled={loading} data-testid="perf-apply-btn">
          <Icon name="calendar" /> {loading ? 'Loading…' : 'Apply'}
        </button>
        <button className="z-btn z-btn--ghost" style={{ marginLeft: 'auto' }} onClick={exportCsv} data-testid="perf-export-btn">
          <Icon name="save" /> Export CSV
        </button>
      </div>

      <div className="z-metrics" style={{ marginBottom: 14 }}>
        <div className="z-metric g-amber"><div className="k"><Icon name="trendup" />Total sales</div><div className="v">{rupee(totalSales)}</div></div>
        <div className="z-metric g-blue"><div className="k"><Icon name="calendar" />Total bookings</div><div className="v">{totalBookings}</div></div>
        <div className="z-metric g-mint"><div className="k"><Icon name="tag" />Avg per booking</div><div className="v">{rupee(totalBookings ? totalSales / totalBookings : 0)}</div></div>
      </div>

      <div className="z-card" style={{ padding: 16, marginBottom: 14 }}>
        <div className="z-dsec">Day-wise sales</div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dayWise} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5FB" />
            <XAxis dataKey="date" stroke="#98A2B8" fontSize={11} />
            <YAxis stroke="#98A2B8" fontSize={11} />
            <Tooltip {...CHART_TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="total_sales" fill={CHART_COLORS[0]} name="Sales (₹)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="total_bookings" fill={CHART_COLORS[1]} name="Bookings" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="z-grid2" style={{ marginBottom: 14 }}>
        <div className="z-card" style={{ padding: 16 }}>
          <div className="z-dsec">Staff-wise sales</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barberWise} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5FB" />
              <XAxis type="number" stroke="#98A2B8" fontSize={11} />
              <YAxis dataKey="barber_name" type="category" stroke="#98A2B8" fontSize={11} width={90} />
              <Tooltip {...CHART_TOOLTIP} />
              <Bar dataKey="total_sales" fill={CHART_COLORS[0]} name="Sales (₹)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="z-card" style={{ padding: 16 }}>
          <div className="z-dsec">Customer gender split</div>
          {gender.length === 0 ? (
            <div className="z-empty" style={{ padding: 40 }}>No gender data in range.</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={gender} cx="50%" cy="50%" labelLine={false} outerRadius={100} dataKey="value"
                     label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                  {gender.map((entry, index) => <Cell key={`c-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip {...CHART_TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="z-card" style={{ padding: 16, marginBottom: 14 }}>
        <div className="z-dsec">Top 10 services</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={serviceWise} margin={{ top: 8, right: 8, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5FB" />
            <XAxis dataKey="service_name" stroke="#98A2B8" fontSize={10} angle={-35} textAnchor="end" height={80} interval={0} />
            <YAxis stroke="#98A2B8" fontSize={11} />
            <Tooltip {...CHART_TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" fill={CHART_COLORS[2]} name="Times booked" radius={[4, 4, 0, 0]} />
            <Bar dataKey="revenue" fill={CHART_COLORS[4]} name="Revenue (₹)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="z-card" style={{ padding: 16 }}>
        <div className="z-dsec">Detailed report</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="z-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E6EBF4' }}>
                {['Date', 'Token', 'Customer', 'Phone', 'Barber', 'Services', 'Amount', 'Status', 'Time Taken'].map((h) => (
                  <th key={h} style={{ textAlign: h === 'Amount' ? 'right' : 'left', padding: '10px 8px', fontSize: 12, color: 'var(--z-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detailed.map((r, i) => (
                <tr key={`${r.token_number || ''}-${r.date || ''}-${i}`} style={{ borderBottom: '1px solid #F4F7FC' }}>
                  <td style={{ padding: '9px 8px', color: 'var(--z-muted)' }}>{r.date}</td>
                  <td style={{ padding: '9px 8px', fontWeight: 700, color: '#1B54C7' }}>{r.token_number}</td>
                  <td style={{ padding: '9px 8px', fontWeight: 600 }}>{r.customer_name}</td>
                  <td style={{ padding: '9px 8px', color: 'var(--z-muted)' }}>{r.phone}</td>
                  <td style={{ padding: '9px 8px' }}>{r.barber_name}</td>
                  <td style={{ padding: '9px 8px', color: 'var(--z-muted)', maxWidth: 220 }}>{r.services}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700 }}>{rupee(r.amount)}</td>
                  <td style={{ padding: '9px 8px' }}><span className={`z-pill ${statusPill(r.status)}`}>{r.status}</span></td>
                  <td style={{ padding: '9px 8px', color: 'var(--z-muted)' }}>{r.time_taken || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {detailed.length === 0 && <div className="z-empty" style={{ padding: 24 }}>No data for the selected range.</div>}
        </div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
 * 3. ATTENDANCE (unchanged — .zen theme, kept verbatim from prior module)
 * -----------------------------------------------------------------------
 */
const ATT_STATUS_PILL = { P: 'z-pill--ok', H: 'z-pill--warn', A: 'z-pill--bad', L: 'z-pill--blue', HOL: '' };

export function StaffAttendanceSub({ salonId, date, branchId, getAuthHeaders }) {
  useEffect(() => { injectZenCss(); }, []);
  const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
  const [range, setRange] = useState({ start: firstOfMonth(), end: (date || new Date().toISOString().slice(0, 10)) });
  const [barbers, setBarbers] = useState([]);
  const [selectedBarbers, setSelectedBarbers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!salonId) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/barbers`, { headers: getAuthHeaders() });
        const list = Array.isArray(res.data) ? res.data : (res.data?.barbers || []);
        setBarbers(list.filter((b) => b.is_active !== false));
      } catch (_) { /* filters optional */ }
    })();
  }, [salonId, getAuthHeaders]);

  const load = useCallback(async () => {
    if (!salonId) return;
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams({ start_date: range.start, end_date: range.end, format: 'json' });
      if (branchId && branchId !== 'all') params.set('branch_id', branchId);
      if (selectedBarbers.length) params.set('barber_ids', selectedBarbers.join(','));
      const res = await axios.get(`${API}/salons/${salonId}/staff-attendance/report?${params}`, { headers: getAuthHeaders() });
      setRows(res.data?.rows || []);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to load attendance report');
    } finally { setLoading(false); }
  }, [salonId, range.start, range.end, branchId, selectedBarbers, getAuthHeaders]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [salonId]);

  const downloadCsv = async () => {
    if (!salonId) return;
    setDownloading(true);
    try {
      const params = new URLSearchParams({ start_date: range.start, end_date: range.end, format: 'csv' });
      if (branchId && branchId !== 'all') params.set('branch_id', branchId);
      if (selectedBarbers.length) params.set('barber_ids', selectedBarbers.join(','));
      const res = await axios.get(`${API}/salons/${salonId}/staff-attendance/report?${params}`, { headers: getAuthHeaders(), responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = `attendance_${range.start}_to_${range.end}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'CSV download failed');
    } finally { setDownloading(false); }
  };

  const toggleBarber = (id) => setSelectedBarbers((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const tally = rows.reduce((acc, r) => { const k = r.status || ''; if (acc[k] != null) acc[k] += 1; return acc; }, { P: 0, H: 0, A: 0, L: 0, HOL: 0 });
  const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');

  return (
    <div className="zen" data-testid="staff-attendance-report">
      <div className="z-card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-muted)', marginBottom: 4 }}>Start date</div>
          <input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} data-testid="att-start-date"
                 style={{ padding: '8px 12px', border: '1px solid var(--z-line)', borderRadius: 10, background: '#fff' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-muted)', marginBottom: 4 }}>End date</div>
          <input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} data-testid="att-end-date"
                 style={{ padding: '8px 12px', border: '1px solid var(--z-line)', borderRadius: 10, background: '#fff' }} />
        </div>
        <button className="z-btn z-btn--pri" onClick={load} disabled={loading} data-testid="att-apply-btn"><Icon name="calendar" /> Apply</button>
        <button className="z-btn z-btn--ghost" style={{ marginLeft: 'auto' }} onClick={downloadCsv} disabled={downloading || !rows.length} data-testid="att-export-btn">
          <Icon name="save" /> {downloading ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>

      {barbers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {barbers.map((b) => (
            <button key={b.id} onClick={() => toggleBarber(b.id)} data-testid={`att-chip-${b.id}`}
                    className={`z-chip ${selectedBarbers.includes(b.id) ? 'on' : ''}`}>{b.name}</button>
          ))}
        </div>
      )}

      <div className="z-metrics" style={{ marginBottom: 14 }}>
        <div className="z-metric g-mint"><div className="k"><Icon name="user" />Present</div><div className="v">{tally.P}</div></div>
        <div className="z-metric g-amber"><div className="k"><Icon name="clock" />Half day</div><div className="v">{tally.H}</div></div>
        <div className="z-metric g-rose"><div className="k"><Icon name="alert" />Absent</div><div className="v">{tally.A}</div></div>
        <div className="z-metric g-blue"><div className="k"><Icon name="calendar" />Leave / Holiday</div><div className="v">{tally.L + tally.HOL}</div></div>
      </div>

      <div className="z-card" style={{ padding: 16 }}>
        <div className="z-dsec">Attendance — {range.start} to {range.end}</div>
        {err && <div className="z-empty" style={{ padding: 20 }}>Could not load: {String(err)}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table className="z-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E6EBF4' }}>
                {['Branch', 'Date', 'Staff', 'Status', 'Leave', 'Check-in', 'Check-out', 'Worked', 'Marked By', 'Mode'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 8px', fontSize: 12, color: 'var(--z-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--z-muted)' }}>Loading…</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--z-muted)' }}>No data in this range.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={`${r.staff_id}-${r.date}-${i}`} style={{ borderBottom: '1px solid #F4F7FC' }}>
                  <td style={{ padding: '8px', color: 'var(--z-muted)' }}>{r.branch}</td>
                  <td style={{ padding: '8px' }}>{r.date}</td>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{r.staff_name}</td>
                  <td style={{ padding: '8px' }}>{r.status ? <span className={`z-pill ${ATT_STATUS_PILL[r.status] || ''}`}>{r.status}</span> : <span style={{ color: 'var(--z-muted)' }}>—</span>}</td>
                  <td style={{ padding: '8px', color: 'var(--z-muted)' }}>{r.leave_type || '—'}</td>
                  <td style={{ padding: '8px', color: 'var(--z-muted)' }}>{fmtTime(r.check_in)}</td>
                  <td style={{ padding: '8px', color: 'var(--z-muted)' }}>{fmtTime(r.check_out)}</td>
                  <td style={{ padding: '8px' }}>{r.worked_minutes != null ? `${Math.floor(r.worked_minutes / 60)}h ${r.worked_minutes % 60}m` : '—'}</td>
                  <td style={{ padding: '8px' }}>{r.marked_by_label && r.marked_by_label !== '—' ? <span className="z-pill z-pill--blue">{r.marked_by_label}</span> : <span style={{ color: 'var(--z-muted)' }}>—</span>}</td>
                  <td style={{ padding: '8px', fontSize: 11, color: 'var(--z-muted)' }}>{r.mode === 'geo_checkin' ? 'Geo' : r.mode === 'service_completion' ? 'Service' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: 'var(--z-muted)', marginTop: 10 }}>Each row reflects the attendance mode active on that specific date — so months spanning a switch read correctly.</p>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
 * 4. INCENTIVES (unchanged — .zen theme, kept verbatim from prior module)
 * -----------------------------------------------------------------------
 */
const INC_STATUS_PILL = { Paid: 'z-pill--ok', Approved: 'z-pill--blue', Pending: 'z-pill--warn', Hold: 'z-pill--bad' };
const effIncentive = (r) => Number(r.manual_amount != null ? r.manual_amount : (r.incentive_earned || 0));

export function StaffIncentiveSub({ salonId, date, getAuthHeaders, canManage = true }) {
  useEffect(() => { injectZenCss(); }, []);
  const [month, setMonth] = useState((date || new Date().toISOString().slice(0, 10)).slice(0, 7));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [payDialog, setPayDialog] = useState(null);
  const [payMethod, setPayMethod] = useState('cash');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await axios.get(`${API}/salons/${salonId}/reward-plan/incentives?month=${month}`, { headers: getAuthHeaders() });
      setRows(res.data?.incentives || []);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to load incentives');
    } finally { setLoading(false); }
  }, [salonId, month, getAuthHeaders]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [salonId, month]);

  const setStatus = async (row, status, extra = {}) => {
    setBusy(true);
    try {
      await axios.put(`${API}/salons/${salonId}/reward-plan/incentives/${row.barber_id}/${month}/status`,
        { status, ...extra }, { headers: getAuthHeaders() });
      toast.success(`Marked ${status}`);
      setPayDialog(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Update failed');
    } finally { setBusy(false); }
  };

  const totalIncentive = rows.reduce((a, r) => a + effIncentive(r), 0);
  const paid = rows.filter((r) => r.status === 'Paid').reduce((a, r) => a + effIncentive(r), 0);
  const approved = rows.filter((r) => r.status === 'Approved').reduce((a, r) => a + effIncentive(r), 0);
  const pending = rows.filter((r) => r.status === 'Pending').reduce((a, r) => a + effIncentive(r), 0);
  const onHold = rows.filter((r) => r.status === 'Hold').reduce((a, r) => a + effIncentive(r), 0);
  const avgAch = rows.length ? rows.reduce((a, r) => a + Number(r.achievement_pct || 0), 0) / rows.length : 0;

  const exportCsv = () => {
    const head = ['Staff', 'Salary', 'Target', 'Actual Sales', 'Achievement %', 'Incentive', 'Status'];
    const body = rows.map((r) => [r.barber_name || '—', r.salary || 0, r.target || 0, r.actual_sales || 0, `${Number(r.achievement_pct || 0).toFixed(1)}%`, effIncentive(r), r.status || 'Pending'].join(','));
    const csv = [head.join(','), ...body].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `staff-incentives-${month}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="zen"><div className="z-empty">Loading incentives…</div></div>;

  return (
    <div className="zen" data-testid="staff-incentive-report">
      <div className="z-card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-muted)', marginBottom: 4 }}>Month</div>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="inc-month"
                 style={{ padding: '8px 12px', border: '1px solid var(--z-line)', borderRadius: 10, background: '#fff' }} />
        </div>
        <button className="z-btn z-btn--ghost" style={{ marginLeft: 'auto' }} onClick={exportCsv} disabled={!rows.length} data-testid="inc-export-btn">
          <Icon name="save" /> Export CSV
        </button>
      </div>

      <div className="z-metrics" style={{ marginBottom: 14 }}>
        <div className="z-metric g-amber"><div className="k"><Icon name="money" />Total incentives</div><div className="v">{rupee(totalIncentive)}</div></div>
        <div className="z-metric g-mint"><div className="k"><Icon name="wallet" />Paid</div><div className="v">{rupee(paid)}</div></div>
        <div className="z-metric g-blue"><div className="k"><Icon name="star" />Approved</div><div className="v">{rupee(approved)}</div></div>
        <div className="z-metric g-rose"><div className="k"><Icon name="clock" />Pending / Hold</div><div className="v">{rupee(pending + onHold)}</div></div>
      </div>

      <div className="z-card" style={{ padding: 16 }}>
        <div className="z-dsec" style={{ display: 'flex', alignItems: 'center' }}>
          Incentive breakup — {month}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--z-muted)', fontWeight: 600 }}>Avg achievement {avgAch.toFixed(1)}%</span>
        </div>
        {err && <div className="z-empty" style={{ padding: 20 }}>Could not load: {String(err)}</div>}
        {!err && rows.length === 0 && <div className="z-empty" style={{ padding: 20 }}>No incentive records for this month. Configure a reward plan first (Staff → Rewards).</div>}
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="z-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E6EBF4' }}>
                  {['Staff', 'Salary', 'Target', 'Actual Sales', 'Achievement', 'Incentive', 'Status'].map((h) => (
                    <th key={h} style={{ textAlign: h === 'Staff' ? 'left' : 'center', padding: '10px 8px', fontSize: 12, color: 'var(--z-muted)' }}>{h}</th>
                  ))}
                  {canManage && <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: 12, color: 'var(--z-muted)' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const ach = Number(r.achievement_pct || 0);
                  const st = r.status || 'Pending';
                  return (
                    <tr key={r.barber_id || i} style={{ borderBottom: '1px solid #F4F7FC' }}>
                      <td style={{ padding: '9px 8px', fontWeight: 600 }}>{r.barber_name || '—'}</td>
                      <td style={{ textAlign: 'center', padding: '9px 8px', color: 'var(--z-muted)' }}>{rupee(r.salary)}</td>
                      <td style={{ textAlign: 'center', padding: '9px 8px' }}>{rupee(r.target)}</td>
                      <td style={{ textAlign: 'center', padding: '9px 8px', fontWeight: 700 }}>{rupee(r.actual_sales)}</td>
                      <td style={{ textAlign: 'center', padding: '9px 8px' }}>{ach.toFixed(1)}%</td>
                      <td style={{ textAlign: 'center', padding: '9px 8px', fontWeight: 700, color: '#1B54C7' }}>{rupee(effIncentive(r))}</td>
                      <td style={{ textAlign: 'center', padding: '9px 8px' }}><span className={`z-pill ${INC_STATUS_PILL[st] || ''}`}>{st}</span></td>
                      {canManage && (
                        <td style={{ textAlign: 'right', padding: '9px 8px', whiteSpace: 'nowrap' }}>
                          {st !== 'Paid' && (
                            <>
                              {st !== 'Approved' && <button className="z-btn z-btn--ghost z-btn--sm" disabled={busy} onClick={() => setStatus(r, 'Approved')} data-testid={`inc-approve-${r.barber_id}`}>Approve</button>}
                              <button className="z-btn z-btn--ok z-btn--sm" style={{ marginLeft: 6 }} disabled={busy || effIncentive(r) <= 0} onClick={() => { setPayMethod('cash'); setPayDialog({ row: r }); }} data-testid={`inc-pay-${r.barber_id}`}>Pay</button>
                              {st !== 'Hold' && <button className="z-btn z-btn--ghost z-btn--sm" style={{ marginLeft: 6 }} disabled={busy} onClick={() => setStatus(r, 'Hold')}>Hold</button>}
                            </>
                          )}
                          {st === 'Paid' && <span style={{ fontSize: 11, color: 'var(--z-muted)' }}>{r.payment_method ? `via ${r.payment_method}` : 'Paid'}</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payDialog && (
        <div className="z-overlay" onClick={() => !busy && setPayDialog(null)}>
          <div className="z-drawer" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="z-drawer-h">
              <div style={{ fontWeight: 800 }}>Pay incentive — {payDialog.row.barber_name}</div>
              <button className="z-drawer-close" onClick={() => !busy && setPayDialog(null)}><Icon name="x" /></button>
            </div>
            <div className="z-drawer-body" style={{ padding: 16 }}>
              <div style={{ marginBottom: 12, fontSize: 14 }}>Amount: <strong>{rupee(effIncentive(payDialog.row))}</strong></div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-muted)', marginBottom: 6 }}>Payment method</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {['cash', 'upi', 'bank'].map((m) => (
                  <button key={m} className={`z-chip ${payMethod === m ? 'on' : ''}`} onClick={() => setPayMethod(m)} data-testid={`inc-paymethod-${m}`}>{m.toUpperCase()}</button>
                ))}
              </div>
              <button className="z-btn z-btn--pri" style={{ width: '100%' }} disabled={busy}
                      onClick={() => setStatus(payDialog.row, 'Paid', { payment_method: payMethod })} data-testid="inc-confirm-pay">
                {busy ? 'Processing…' : `Confirm & mark Paid`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
