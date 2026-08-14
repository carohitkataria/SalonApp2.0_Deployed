import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/*  Zenoti-style appointment calendar (WS1, v3.4)                     */
/*  - Session bands (Morning / Noon / Evening) from salon timings     */
/*  - Barbers as horizontally-scrollable columns (sticky rail/heads)  */
/*  - Blocks positioned by expected/queue time, height = duration     */
/*  - Max-2 overlap per barber, side-by-side half width               */
/*  - Click -> popover with Call / Complete & bill / Cancel / Resched */
/*  - Drag & drop (time/session + reassign barber) -> staff-reschedule*/
/* ------------------------------------------------------------------ */

const PX_PER_MIN = 1.7;              // legacy default (kept for reference)
// Zoom: vertical pixels-per-minute. Lower = more compact (see more of the day).
const ZOOM_LEVELS = [0.5, 0.7, 0.9, 1.2, 1.5, 1.9, 2.4];
const DEFAULT_ZOOM_IDX = 2;          // 0.9 px/min -> a full 24h day fits comfortably
const COL_WIDTH = 184;
const RAIL_WIDTH = 66;
const SESSIONS = ['Morning', 'Noon', 'Evening'];
const DEFAULT_WINDOWS = {
  Morning: { start: 9, end: 13 },
  Noon: { start: 13, end: 17 },
  Evening: { start: 17, end: 21 },
};
const BAND_TINT = { Morning: '#FFFBEB', Noon: '#EFF6FF', Evening: '#F5F3FF' };
const BAND_LABEL = { Morning: '#B45309', Noon: '#1D4ED8', Evening: '#6D28D9' };

function istDate(offset = 0) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt.format(new Date());
  if (offset === 0) return today;
  const [y, m, d] = today.split('-').map(Number);
  return fmt.format(new Date(Date.UTC(y, m - 1, d + offset)));
}
function istNowMinutes() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return h * 60 + m;
}
function minToHHMM(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function fmtTimeLabel(min) {
  let h = Math.floor(min / 60); const m = Math.round(min % 60);
  const ap = h >= 12 ? 'PM' : 'AM'; const hh = ((h + 11) % 12) + 1;
  return m === 0 ? `${hh} ${ap}` : `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}
function parseHHMM(s) {
  if (!s) return null;
  const p = String(s).split(':');
  const h = Number(p[0]); const m = Number(p[1] || 0);
  if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
  return null;
}

/* status -> visual bucket */
function statusMeta(t) {
  const s = (t.status || '').toLowerCase();
  if (s === 'completed') return { key: 'completed', label: 'Completed', bg: '#F3F4F6', bd: '#9CA3AF', fg: '#4B5563', strike: false };
  if (s === 'cancelled' || s === 'skipped') return { key: 'cancelled', label: s === 'skipped' ? 'Skipped' : 'Cancelled', bg: '#FFE4E6', bd: '#FB7185', fg: '#9F1239', strike: true };
  if (s === 'called' || s === 'in_service' || s === 'in_progress') return { key: 'in_service', label: 'In service', bg: '#DCFCE7', bd: '#22C55E', fg: '#15803D', strike: false };
  if (s === 'booked' || t.booking_type === 'schedule') return { key: 'booked', label: 'Booked', bg: '#EDE9FE', bd: '#7C3AED', fg: '#5B21B6', strike: false };
  return { key: 'waiting', label: 'Waiting', bg: '#DBEAFE', bd: '#3B82F6', fg: '#1E40AF', strike: false };
}
const LEGEND = [
  { label: 'Booked', c: '#7C3AED' },
  { label: 'Waiting', c: '#3B82F6' },
  { label: 'In service', c: '#22C55E' },
  { label: 'Completed', c: '#9CA3AF' },
  { label: 'Cancelled', c: '#FB7185' },
];

export default function QueueCalendarView({
  salonId, getAuthHeaders, API, barbers = [],
  handleCallToken, handleCompleteToken, handleCancelToken, handleSendNotification,
}) {
  const [calDate, setCalDate] = useState(istDate(0));
  const [tokens, setTokens] = useState([]);
  const [windows, setWindows] = useState(DEFAULT_WINDOWS);
  const [svcMap, setSvcMap] = useState({});   // id -> {name, dur}
  const [loading, setLoading] = useState(false);
  const [selectedBarbers, setSelectedBarbers] = useState(null); // null = ALL
  const [filterOpen, setFilterOpen] = useState(false);
  const [pop, setPop] = useState(null);       // {token, x, y, mode:'view'|'reschedule'}
  const [dragId, setDragId] = useState(null);
  const gridRef = useRef(null);
  // Zoom (pixels-per-minute) with persistence per salon.
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const pxPerMin = ZOOM_LEVELS[zoomIdx];
  const didAutoScroll = useRef(false);

  const activeBarbers = useMemo(
    () => (barbers || []).filter((b) => b.is_active !== false),
    [barbers],
  );

  /* persisted barber filter */
  useEffect(() => {
    if (!salonId) return;
    try {
      const raw = localStorage.getItem(`qcal_barbers_${salonId}`);
      if (raw) { const v = JSON.parse(raw); setSelectedBarbers(v === 'ALL' ? null : v); }
    } catch (_) { /* noop */ }
  }, [salonId]);
  const persistFilter = (v) => {
    try { localStorage.setItem(`qcal_barbers_${salonId}`, JSON.stringify(v === null ? 'ALL' : v)); } catch (_) { /* noop */ }
  };

  const shownBarbers = useMemo(() => {
    if (!selectedBarbers) return activeBarbers;
    const set = new Set(selectedBarbers);
    return activeBarbers.filter((b) => set.has(b.id));
  }, [activeBarbers, selectedBarbers]);

  /* ---- data loaders ---- */
  const fetchTokens = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const headers = getAuthHeaders ? getAuthHeaders() : {};
      const { data } = await axios.get(`${API}/salons/${salonId}/queue?date=${calDate}`, { headers });
      setTokens(Array.isArray(data) ? data : []);
    } catch (_) { setTokens([]); }
    finally { setLoading(false); }
  }, [API, salonId, calDate, getAuthHeaders]);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  useEffect(() => {
    if (!salonId) return;
    (async () => {
      try {
        const headers = getAuthHeaders ? getAuthHeaders() : {};
        const { data } = await axios.get(`${API}/salons/${salonId}/shift-windows?date=${calDate}`, { headers });
        const w = {};
        (data?.shifts || []).forEach((s) => {
          if (s.start != null && s.end != null) w[s.id] = { start: s.start, end: s.end };
        });
        setWindows(Object.keys(w).length ? { ...DEFAULT_WINDOWS, ...w } : DEFAULT_WINDOWS);
      } catch (_) { setWindows(DEFAULT_WINDOWS); }
    })();
  }, [API, salonId, calDate, getAuthHeaders]);

  useEffect(() => {
    if (!salonId) return;
    (async () => {
      try {
        const headers = getAuthHeaders ? getAuthHeaders() : {};
        const res = await axios.get(`${API}/salons/${salonId}/services/all`, { headers }).catch(() => ({ data: [] }));
        const list = Array.isArray(res.data) ? res.data : (res.data?.services || []);
        const map = {};
        list.forEach((s) => { map[s.id] = { name: s.name, dur: Number(s.default_duration) || 30 }; });
        setSvcMap(map);
      } catch (_) { /* noop */ }
    })();
  }, [API, salonId, getAuthHeaders]);

  /* re-sync when other parts of the app change tokens */
  useEffect(() => {
    const h = () => fetchTokens();
    window.addEventListener('salon:refresh-tokens', h);
    return () => window.removeEventListener('salon:refresh-tokens', h);
  }, [fetchTokens]);

  /* ---- geometry (full 24h day, Zenoti-style) ---- */
  const dayStart = 0;              // 00:00
  const dayEnd = 24 * 60;          // 24:00 — full day always visible
  const totalHeight = Math.max((dayEnd - dayStart) * pxPerMin, 300);

  const tokenDuration = useCallback((t) => {
    if (Number(t.total_service_minutes) > 0) return Number(t.total_service_minutes);
    const ids = t.selected_services || [];
    let sum = 0;
    ids.forEach((id) => { sum += (svcMap[id]?.dur || 30); });
    return sum > 0 ? sum : 30;
  }, [svcMap]);

  const serviceNames = useCallback((t) => {
    const ids = t.selected_services || [];
    const names = ids.map((id) => svcMap[id]?.name).filter(Boolean);
    return names.length ? names.join(', ') : `${ids.length || 1} service${(ids.length || 1) > 1 ? 's' : ''}`;
  }, [svcMap]);

  const sessionStart = (session) => (windows[session]?.start ?? DEFAULT_WINDOWS[session]?.start ?? 9) * 60;
  const sessionOfMinute = (min) => {
    for (const s of SESSIONS) {
      const st = (windows[s]?.start ?? DEFAULT_WINDOWS[s].start) * 60;
      const en = (windows[s]?.end ?? DEFAULT_WINDOWS[s].end) * 60;
      if (min >= st && min < en) return s;
    }
    // nearest
    return min < sessionStart('Noon') ? 'Morning' : (min < sessionStart('Evening') ? 'Noon' : 'Evening');
  };

  /* compute laid-out blocks per barber column */
  const columns = useMemo(() => {
    const byBarber = {};
    shownBarbers.forEach((b) => { byBarber[b.id] = []; });
    // group tokens; unknown barber -> 'any' bucket assigned to first col? we skip if not shown
    const grouped = {};
    tokens.forEach((t) => {
      const bid = t.barber_id || 'any';
      if (!(bid in byBarber)) return; // barber filtered out / not a column
      (grouped[bid] = grouped[bid] || []).push(t);
    });

    Object.keys(grouped).forEach((bid) => {
      const list = grouped[bid];
      // sort by session order then expected/queue
      const sortKey = (t) => {
        const sIdx = SESSIONS.indexOf(t.shift || 'Morning');
        const et = parseHHMM(t.expected_time);
        return sIdx * 100000 + (et != null ? et : 9999) * 10 + (Number(t.token_number) || 0) / 1000;
      };
      list.sort((a, b) => sortKey(a) - sortKey(b));
      // assign start minutes: expected_time wins, else stack after cursor per session
      const cursor = {};
      const placed = list.map((t) => {
        const session = t.shift || 'Morning';
        const dur = tokenDuration(t);
        let start = parseHHMM(t.expected_time);
        if (start == null) {
          const c = cursor[session] != null ? cursor[session] : sessionStart(session);
          start = c;
        }
        cursor[session] = start + dur;
        return { t, start, end: start + dur, dur };
      });
      // lane assignment (interval partition)
      placed.sort((a, b) => a.start - b.start || a.end - b.end);
      const laneEnds = [];
      placed.forEach((p) => {
        let lane = laneEnds.findIndex((e) => e <= p.start);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(p.end); }
        else laneEnds[lane] = p.end;
        p.lane = lane;
      });
      // cluster width = max concurrent overlap for each block
      placed.forEach((p) => {
        let maxLanes = 1;
        placed.forEach((q) => {
          if (p.start < q.end && q.start < p.end) maxLanes = Math.max(maxLanes, (q.lane || 0) + 1);
        });
        p.cluster = Math.max(maxLanes, p.lane + 1);
      });
      byBarber[bid] = placed;
    });
    return byBarber;
  }, [tokens, shownBarbers, windows, svcMap, tokenDuration]);

  const isToday = calDate === istDate(0);
  const nowMin = istNowMinutes();
  const nowTop = isToday && nowMin >= dayStart && nowMin <= dayEnd ? (nowMin - dayStart) * pxPerMin : null;

  const hourLabels = useMemo(() => {
    const out = [];
    const startH = Math.floor(dayStart / 60);
    const endH = Math.ceil(dayEnd / 60);
    for (let h = startH; h <= endH; h++) out.push({ h, top: (h * 60 - dayStart) * pxPerMin });
    return out;
  }, [dayStart, dayEnd, pxPerMin]);

  /* Auto-scroll to business start (or now) once, so a full-24h grid doesn't
     dump the user at midnight. */
  useEffect(() => {
    if (didAutoScroll.current || !gridRef.current) return;
    const target = isToday ? Math.max(nowMin - 90, 0) : ((windows.Morning?.start ?? 9) * 60 - 30);
    gridRef.current.scrollTop = Math.max((target - dayStart) * pxPerMin, 0);
    didAutoScroll.current = true;
  }, [isToday, nowMin, windows, dayStart, pxPerMin]);

  /* ---- interactions ---- */
  const closePop = () => setPop(null);

  const refreshSoon = () => { setTimeout(fetchTokens, 500); window.dispatchEvent(new CustomEvent('salon:refresh-tokens')); };

  const onBlockClick = (e, t) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(r.right + 8, window.innerWidth - 300);
    const y = Math.min(r.top, window.innerHeight - 340);
    setPop({ token: t, x: Math.max(12, x), y: Math.max(12, y), mode: 'view' });
  };

  const openNewBooking = (barberId, session, min) => {
    // past guard
    if (calDate < istDate(0) || (isToday && min < nowMin - 1)) {
      toast.error('Cannot create a booking in the past');
      return;
    }
    window.dispatchEvent(new CustomEvent('salon:open-new-appointment', {
      detail: { preset: { barber_id: barberId, shift: session, expected_time: minToHHMM(min), date: calDate } },
    }));
  };

  const onColumnClick = (e, barberId) => {
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + gridRef.current.scrollTop;
    const min = Math.round((y / pxPerMin + dayStart) / 5) * 5;
    openNewBooking(barberId, sessionOfMinute(min), Math.max(dayStart, min));
  };

  const doReschedule = async (t, payload) => {
    try {
      const headers = getAuthHeaders ? getAuthHeaders() : {};
      await axios.put(`${API}/tokens/${t.id}/staff-reschedule`, payload, { headers });
      toast.success('Booking rescheduled');
      closePop();
      refreshSoon();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Could not reschedule';
      toast.error(msg);
      fetchTokens(); // revert visual
    }
  };

  const onDrop = (e, barberId) => {
    e.preventDefault();
    if (!dragId || !gridRef.current) return;
    const t = tokens.find((x) => x.id === dragId);
    setDragId(null);
    if (!t) return;
    const meta = statusMeta(t);
    if (meta.key === 'completed' || meta.key === 'cancelled') {
      toast.error('Completed / cancelled bookings cannot be moved');
      return;
    }
    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + gridRef.current.scrollTop;
    let min = Math.round((y / pxPerMin + dayStart) / 5) * 5;
    min = Math.max(dayStart, Math.min(min, dayEnd - 5));
    const session = sessionOfMinute(min);
    if (calDate < istDate(0) || (isToday && min < nowMin - 1)) {
      toast.error('Cannot move a booking into the past');
      return;
    }
    const sameBarber = (t.barber_id || 'any') === barberId;
    const barberName = shownBarbers.find((b) => b.id === barberId)?.name || 'barber';
    const ok = window.confirm(
      `Move ${t.customer_name || 'guest'} to ${barberName}, ${session} ${fmtTimeLabel(min)}?`,
    );
    if (!ok) return;
    doReschedule(t, {
      barber_id: barberId, shift: session, expected_time: minToHHMM(min), date: calDate, source: 'drag',
    });
    void sameBarber;
  };

  /* ---- popover actions ---- */
  const actCall = async (t) => { try { await handleCallToken?.(t.id); } finally { closePop(); refreshSoon(); } };
  const actComplete = async (t) => { try { await handleCompleteToken?.(t.id); } finally { closePop(); refreshSoon(); } };
  const actCancel = async (t) => { try { await handleCancelToken?.(t.id); } finally { closePop(); refreshSoon(); } };
  const actNotify = async (t) => { try { await handleSendNotification?.(t.id); } finally { closePop(); } };

  return (
    <div className="qcal">
      <style>{CSS}</style>

      {/* toolbar */}
      <div className="qcal-toolbar">
        <div className="qcal-datenav">
          <button className="qcal-navbtn" onClick={() => setCalDate(shiftDate(calDate, -1))} title="Previous day">‹</button>
          <button className="qcal-today" onClick={() => setCalDate(istDate(0))}>Today</button>
          <button className="qcal-navbtn" onClick={() => setCalDate(shiftDate(calDate, 1))} title="Next day">›</button>
          <input type="date" className="qcal-datepick" value={calDate} onChange={(e) => setCalDate(e.target.value)} />
          <span className="qcal-datelabel">{prettyDate(calDate)}{loading ? ' · …' : ''}</span>
        </div>

        <div className="qcal-midtools">
          <div className="qcal-zoom" title="Zoom calendar">
            <button
              className="qcal-zbtn"
              onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
              disabled={zoomIdx <= 0}
              title="Zoom out"
            >−</button>
            <span className="qcal-zlabel">{Math.round(pxPerMin / ZOOM_LEVELS[DEFAULT_ZOOM_IDX] * 100)}%</span>
            <button
              className="qcal-zbtn"
              onClick={() => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
              disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
              title="Zoom in"
            >+</button>
          </div>
          <div className="qcal-legend">
            {LEGEND.map((l) => (
              <span key={l.label} className="qcal-lg"><i style={{ background: l.c }} />{l.label}</span>
            ))}
          </div>
        </div>

        <div className="qcal-filterwrap">
          <button className="qcal-filterbtn" onClick={() => setFilterOpen((o) => !o)}>
            Barbers: {selectedBarbers ? `${shownBarbers.length}` : 'All'} ▾
          </button>
          {filterOpen && (
            <div className="qcal-filtermenu" onMouseLeave={() => setFilterOpen(false)}>
              <label className="qcal-fitem">
                <input
                  type="checkbox"
                  checked={!selectedBarbers}
                  onChange={() => { setSelectedBarbers(null); persistFilter(null); }}
                />
                <b>All barbers</b>
              </label>
              <div className="qcal-fdiv" />
              {activeBarbers.map((b) => {
                const checked = !selectedBarbers || selectedBarbers.includes(b.id);
                return (
                  <label key={b.id} className="qcal-fitem">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        let base = selectedBarbers || activeBarbers.map((x) => x.id);
                        base = checked ? base.filter((id) => id !== b.id) : [...base, b.id];
                        const v = base.length === activeBarbers.length ? null : base;
                        setSelectedBarbers(v); persistFilter(v);
                      }}
                    />
                    {b.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* grid */}
      <div className="qcal-scroll" ref={gridRef} onClick={closePop}>
        {/* header row */}
        <div className="qcal-headrow" style={{ width: RAIL_WIDTH + shownBarbers.length * COL_WIDTH }}>
          <div className="qcal-railhead" style={{ width: RAIL_WIDTH }} />
          {shownBarbers.map((b) => (
            <div key={b.id} className="qcal-colhead" style={{ width: COL_WIDTH }}>
              <div className="qcal-avatar">{(b.name || '?').slice(0, 1).toUpperCase()}</div>
              <div className="qcal-chmeta">
                <div className="qcal-chname">{b.name}</div>
                <div className="qcal-chrole">{b.role || b.specialization || 'Stylist'}</div>
              </div>
            </div>
          ))}
          {shownBarbers.length === 0 && <div className="qcal-colhead" style={{ width: COL_WIDTH }}>No barbers</div>}
        </div>

        {/* body */}
        <div className="qcal-body" style={{ height: totalHeight, width: RAIL_WIDTH + shownBarbers.length * COL_WIDTH }}>
          {/* rail */}
          <div className="qcal-rail" style={{ width: RAIL_WIDTH, height: totalHeight }}>
            {hourLabels.map((hl) => (
              <div key={hl.h} className="qcal-hlabel" style={{ top: hl.top }}>{fmtTimeLabel(hl.h * 60)}</div>
            ))}
          </div>

          {/* columns area (bands + now-line + columns) */}
          <div className="qcal-colsarea" style={{ width: shownBarbers.length * COL_WIDTH, height: totalHeight }}>
            {/* session bands */}
            {SESSIONS.map((s) => {
              const st = (windows[s]?.start ?? DEFAULT_WINDOWS[s].start) * 60;
              const en = (windows[s]?.end ?? DEFAULT_WINDOWS[s].end) * 60;
              const top = (st - dayStart) * pxPerMin;
              const h = (en - st) * pxPerMin;
              return (
                <div key={s} className="qcal-band" style={{ top, height: h, background: BAND_TINT[s] }}>
                  <span className="qcal-bandlabel" style={{ color: BAND_LABEL[s] }}>{s} · {fmtTimeLabel(st)}–{fmtTimeLabel(en)}</span>
                </div>
              );
            })}
            {/* hour gridlines */}
            {hourLabels.map((hl) => (
              <div key={`gl-${hl.h}`} className="qcal-gridline" style={{ top: hl.top }} />
            ))}
            {/* now line */}
            {nowTop != null && (
              <div className="qcal-now" style={{ top: nowTop }}><span className="qcal-nowdot" /></div>
            )}

            {/* barber columns */}
            {shownBarbers.map((b, ci) => (
              <div
                key={b.id}
                className="qcal-col"
                style={{ left: ci * COL_WIDTH, width: COL_WIDTH, height: totalHeight }}
                onClick={(e) => onColumnClick(e, b.id)}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => onDrop(e, b.id)}
              >
                {(columns[b.id] || []).map((p) => {
                  const meta = statusMeta(p.t);
                  const w = (COL_WIDTH - 6) / (p.cluster || 1);
                  const left = 3 + (p.lane || 0) * w;
                  const draggable = meta.key !== 'completed' && meta.key !== 'cancelled';
                  return (
                    <div
                      key={p.t.id}
                      className={`qcal-block${draggable ? ' drag' : ''}`}
                      draggable={draggable}
                      onDragStart={() => setDragId(p.t.id)}
                      onDragEnd={() => setDragId(null)}
                      style={{
                        top: (p.start - dayStart) * pxPerMin,
                        height: Math.max(p.dur * pxPerMin - 3, 26),
                        left, width: w - 3,
                        background: meta.bg, borderColor: meta.bd,
                        opacity: dragId === p.t.id ? 0.4 : 1,
                      }}
                      onClick={(e) => onBlockClick(e, p.t)}
                      title={`${p.t.customer_name || 'Guest'} · ${meta.label}`}
                    >
                      <div className="qcal-btitle" style={{ color: meta.fg, textDecoration: meta.strike ? 'line-through' : 'none' }}>
                        #{p.t.token_number} {p.t.customer_name || 'Guest'}
                      </div>
                      <div className="qcal-bsub" style={{ color: meta.fg }}>{fmtTimeLabel(p.start)} · {serviceNames(p.t)}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* popover */}
      {pop && (
        <div className="qcal-popwrap" onClick={closePop}>
          <div className="qcal-pop" style={{ left: pop.x, top: pop.y }} onClick={(e) => e.stopPropagation()}>
            {pop.mode === 'view' ? (
              <ViewPop
                t={pop.token} meta={statusMeta(pop.token)} serviceNames={serviceNames}
                onCall={() => actCall(pop.token)}
                onComplete={() => actComplete(pop.token)}
                onCancel={() => actCancel(pop.token)}
                onNotify={() => actNotify(pop.token)}
                onReschedule={() => setPop({ ...pop, mode: 'reschedule' })}
                onClose={closePop}
              />
            ) : (
              <ReschedulePop
                t={pop.token} barbers={activeBarbers} windows={windows}
                onCancel={() => setPop({ ...pop, mode: 'view' })}
                onSave={(payload) => doReschedule(pop.token, payload)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------- popover: view ------- */
function ViewPop({ t, meta, serviceNames, onCall, onComplete, onCancel, onNotify, onReschedule, onClose }) {
  const done = meta.key === 'completed' || meta.key === 'cancelled';
  return (
    <>
      <div className="qcal-pophead">
        <div>
          <div className="qcal-popname">{t.customer_name || 'Guest'}</div>
          <div className="qcal-popphone">{t.phone || '—'}</div>
        </div>
        <span className="qcal-popbadge" style={{ background: meta.bg, color: meta.fg, border: `1px solid ${meta.bd}` }}>{meta.label}</span>
      </div>
      <div className="qcal-poprow"><span>Token</span><b>#{t.token_number}</b></div>
      <div className="qcal-poprow"><span>Session</span><b>{t.shift}{t.expected_time ? ` · ${fmtTimeLabel(parseHHMM(t.expected_time))}` : ''}</b></div>
      <div className="qcal-poprow"><span>Service</span><b className="qcal-poptrunc">{serviceNames(t)}</b></div>
      <div className="qcal-poprow"><span>Amount</span><b>₹{Number(t.total_amount || 0).toFixed(0)}</b></div>
      <div className="qcal-popactions">
        {!done && (t.status === 'waiting' || t.status === 'booked') && (
          <button className="qcal-act call" onClick={onCall}>Call</button>
        )}
        {!done && (
          <button className="qcal-act complete" onClick={onComplete}>Complete &amp; bill</button>
        )}
        {!done && <button className="qcal-act resched" onClick={onReschedule}>Reschedule</button>}
        {!done && <button className="qcal-act notify" onClick={onNotify}>Notify</button>}
        {!done && <button className="qcal-act cancel" onClick={onCancel}>Cancel</button>}
        {done && <button className="qcal-act" onClick={onClose}>Close</button>}
      </div>
    </>
  );
}

/* ------- popover: reschedule form ------- */
function ReschedulePop({ t, barbers, windows, onCancel, onSave }) {
  const [shift, setShift] = useState(t.shift || 'Morning');
  const [time, setTime] = useState(t.expected_time || minToHHMM((windows[t.shift]?.start ?? 9) * 60));
  const [barberId, setBarberId] = useState(t.barber_id || 'any');
  return (
    <>
      <div className="qcal-pophead"><div className="qcal-popname">Reschedule #{t.token_number}</div></div>
      <label className="qcal-flabel">Session
        <select value={shift} onChange={(e) => setShift(e.target.value)}>
          {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="qcal-flabel">Time
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label className="qcal-flabel">Barber
        <select value={barberId} onChange={(e) => setBarberId(e.target.value)}>
          <option value="any">Any</option>
          {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <div className="qcal-popactions">
        <button className="qcal-act resched" onClick={() => onSave({ barber_id: barberId, shift, expected_time: time, source: 'form' })}>Save</button>
        <button className="qcal-act" onClick={onCancel}>Back</button>
      </div>
    </>
  );
}

/* ------- helpers ------- */
function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
}
function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(dt);
}

/* ------- scoped styles ------- */
const CSS = `
.qcal{--vi:#7C3AED;--ink:#111827;font-family:Inter,system-ui,sans-serif;}
.qcal-toolbar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:10px 12px;background:#fff;border:1px solid #EEE;border-radius:14px;margin-bottom:12px;}
.qcal-datenav{display:flex;align-items:center;gap:8px;}
.qcal-navbtn{width:32px;height:32px;border:1px solid #E5E7EB;background:#fff;border-radius:9px;font-size:18px;line-height:1;cursor:pointer;color:#374151;}
.qcal-navbtn:hover{background:#F9FAFB;}
.qcal-today{height:32px;padding:0 12px;border:1px solid #E5E7EB;background:#fff;border-radius:9px;font-weight:600;font-size:13px;cursor:pointer;color:#374151;}
.qcal-today:hover{border-color:var(--vi);color:var(--vi);}
.qcal-datepick{height:32px;border:1px solid #E5E7EB;border-radius:9px;padding:0 8px;font-size:13px;color:#374151;}
.qcal-datelabel{font-size:13px;color:#6B7280;font-weight:600;}
.qcal-midtools{display:flex;align-items:center;gap:14px;margin-left:auto;flex-wrap:wrap;}
.qcal-zoom{display:inline-flex;align-items:center;gap:2px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:9px;padding:2px;}
.qcal-zbtn{width:28px;height:28px;border:none;background:#fff;border-radius:7px;font-size:18px;line-height:1;font-weight:700;cursor:pointer;color:#374151;box-shadow:0 1px 2px rgba(0,0,0,.06);}
.qcal-zbtn:hover:not(:disabled){color:var(--vi);}
.qcal-zbtn:disabled{opacity:.4;cursor:default;box-shadow:none;background:transparent;}
.qcal-zlabel{min-width:42px;text-align:center;font-size:12px;font-weight:700;color:#4B5563;}
.qcal-legend{display:flex;gap:12px;flex-wrap:wrap;}
.qcal-lg{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#4B5563;}
.qcal-lg i{width:12px;height:12px;border-radius:4px;display:inline-block;}
.qcal-filterwrap{position:relative;}
.qcal-filterbtn{height:32px;padding:0 12px;border:1px solid #E5E7EB;background:#fff;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;color:#374151;}
.qcal-filtermenu{position:absolute;right:0;top:38px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.14);padding:8px;z-index:60;min-width:190px;max-height:320px;overflow:auto;}
.qcal-fitem{display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:13px;color:#374151;border-radius:8px;cursor:pointer;}
.qcal-fitem:hover{background:#F5F3FF;}
.qcal-fdiv{height:1px;background:#EEE;margin:4px 0;}
.qcal-scroll{position:relative;overflow:auto;max-height:calc(100vh - 250px);border:1px solid #EEE;border-radius:14px;background:#F7F6FB;}
.qcal-headrow{position:sticky;top:0;z-index:30;display:flex;background:#fff;border-bottom:1px solid #E5E7EB;}
.qcal-railhead{position:sticky;left:0;z-index:31;background:#fff;border-right:1px solid #EEE;flex:0 0 auto;}
.qcal-colhead{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;border-right:1px solid #F0F0F0;background:#fff;}
.qcal-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#A855F7);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex:0 0 auto;}
.qcal-chname{font-size:13px;font-weight:700;color:#1F2937;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;}
.qcal-chrole{font-size:11px;color:#9CA3AF;}
.qcal-body{position:relative;display:flex;}
.qcal-rail{position:sticky;left:0;z-index:20;background:#fff;border-right:1px solid #EEE;flex:0 0 auto;}
.qcal-hlabel{position:absolute;right:8px;font-size:11px;color:#9CA3AF;transform:translateY(-6px);}
.qcal-colsarea{position:relative;flex:0 0 auto;}
.qcal-band{position:absolute;left:0;right:0;pointer-events:none;}
.qcal-bandlabel{position:sticky;left:8px;top:2px;display:inline-block;font-size:11px;font-weight:700;padding:2px 6px;letter-spacing:.02em;}
.qcal-gridline{position:absolute;left:0;right:0;height:1px;background:rgba(0,0,0,.05);pointer-events:none;}
.qcal-now{position:absolute;left:0;right:0;height:2px;background:#EF4444;z-index:15;pointer-events:none;}
.qcal-nowdot{position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:#EF4444;}
.qcal-col{position:absolute;top:0;border-right:1px solid #F0F0F0;cursor:copy;}
.qcal-block{position:absolute;border:1px solid;border-left-width:3px;border-radius:8px;padding:4px 6px;overflow:hidden;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.06);z-index:5;transition:box-shadow .1s;}
.qcal-block.drag{cursor:grab;}
.qcal-block:hover{box-shadow:0 4px 12px rgba(0,0,0,.14);z-index:8;}
.qcal-btitle{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.qcal-bsub{font-size:11px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.qcal-popwrap{position:fixed;inset:0;z-index:80;}
.qcal-pop{position:fixed;width:284px;background:#fff;border:1px solid #E5E7EB;border-radius:14px;box-shadow:0 18px 44px rgba(0,0,0,.2);padding:14px;z-index:81;}
.qcal-pophead{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;}
.qcal-popname{font-size:15px;font-weight:800;color:#111827;}
.qcal-popphone{font-size:12px;color:#6B7280;}
.qcal-popbadge{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;}
.qcal-poprow{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:3px 0;color:#6B7280;}
.qcal-poprow b{color:#1F2937;text-align:right;}
.qcal-poptrunc{max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.qcal-popactions{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}
.qcal-act{flex:1 1 auto;min-width:70px;height:34px;border-radius:9px;border:1px solid #E5E7EB;background:#fff;font-size:13px;font-weight:600;cursor:pointer;color:#374151;}
.qcal-act:hover{background:#F9FAFB;}
.qcal-act.call{background:#2563EB;border-color:#2563EB;color:#fff;}
.qcal-act.complete{background:#16A34A;border-color:#16A34A;color:#fff;}
.qcal-act.resched{background:#7C3AED;border-color:#7C3AED;color:#fff;}
.qcal-act.cancel{background:#fff;border-color:#FCA5A5;color:#DC2626;}
.qcal-flabel{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#6B7280;margin-top:8px;}
.qcal-flabel select,.qcal-flabel input{height:34px;border:1px solid #E5E7EB;border-radius:9px;padding:0 8px;font-size:13px;color:#111827;}
`;
