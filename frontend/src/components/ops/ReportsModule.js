/*
 * ReportsModule.js — Reports page (Zenoti-blue design)
 * -----------------------------------------------------
 * Structure mirrors salon_reports.html 1:1 using the `.shv2` CSS namespace
 * defined in reportsTheme.css. The 3 legacy Staff sub-tabs (Performance,
 * Attendance, Incentives) live in StaffReportSubs.js and remain untouched;
 * this file only owns the outer shell + Snapshot/Sales/Payments/P&L/Clients/
 * Marketing/Inventory tabs, plus the new Staff → Overview sub-tab.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Icon, rupee, injectZenCss } from './opsTheme';
import './reportsTheme.css';
import {
  StaffOverviewSub,
  StaffPerformanceSub,
  StaffAttendanceSub,
  StaffIncentiveSub,
} from './StaffReportSubs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/* Section tabs in the exact order shown in the design brief. */
const SECTIONS = [
  { id: 'snapshot',     label: 'Business snapshot',   ico: 'chart' },
  { id: 'sales',        label: 'Sales',                ico: 'trendup' },
  { id: 'payments-gst', label: 'Payments & GST',       ico: 'money' },
  { id: 'pnl',          label: 'Expenses & P&L',       ico: 'wallet' },
  { id: 'staff',        label: 'Staff',                ico: 'users' },
  { id: 'clients',      label: 'Clients',              ico: 'user' },
  { id: 'marketing',    label: 'Marketing',            ico: 'gift' },
  { id: 'inventory',    label: 'Inventory',            ico: 'box' },
];

/* Card gradient + accent colour pool (design brief exact) */
const GRADS = [
  ['linear-gradient(135deg,#EDE9FE 0%,#DCE4FD 100%)', '#6D5AE0'],
  ['linear-gradient(135deg,#FDECD9 0%,#FBD8C1 100%)', '#DB8433'],
  ['linear-gradient(135deg,#FCE0EC 0%,#F8C9DC 100%)', '#D24C86'],
  ['linear-gradient(135deg,#FDE3DD 0%,#F9C6BE 100%)', '#DF6350'],
  ['linear-gradient(135deg,#D8F2EA 0%,#C1EADB 100%)', '#149A80'],
  ['linear-gradient(135deg,#E2EFFD 0%,#C9E0FB 100%)', '#3A7ED4'],
  ['linear-gradient(135deg,#EEE4FC 0%,#DFCFFA 100%)', '#7A5CD1'],
  ['linear-gradient(135deg,#FBF1D3 0%,#F6E1A8 100%)', '#C0941C'],
];
const PIE_COLORS = ['#2145C7', '#7CB342', '#D9A82C', '#A61E4D', '#E5556E', '#3E93E8', '#7A5CD1', '#12A594', '#DB8433', '#E5484D'];
const CARD_ICON = {
  appointments: 'calendar', collections: 'money', revenue: 'trendup', source: 'chart',
  guests: 'users', avgticket: 'tag', utilization: 'gauge', wait: 'clock',
  products: 'box', addons: 'plus', noshow: 'alert', rebooking: 'ret',
  feedback: 'star', membership: 'wallet', discounts: 'scissors',
};
const BAR_METRICS = new Set(['wait', 'feedback']);

/* --------- helpers --------- */
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
function stepDate(view, date, dir) {
  const d = new Date(date + 'T00:00:00');
  if (view === 'day') d.setDate(d.getDate() + dir);
  else if (view === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  return d.toISOString().slice(0, 10);
}
function windowLabel(view, date) {
  const { start, end } = resolveWindow(view, date);
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const monthName = s.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (view === 'day') return s.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  if (view === 'week') return `${s.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} → ${e.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}`;
  return monthName;
}
function formatCardValue(card) {
  const v = card.total;
  if (card.money) return rupee(v);
  const id = card.id;
  if (id === 'utilization' || id === 'noshow' || id === 'rebooking') return `${Math.round(v || 0)}%`;
  if (id === 'wait') return `${Math.round(v || 0)} min`;
  if (id === 'feedback') return `${(v || 0).toFixed(1)}`;
  return `${v || 0}`;
}
function exportSnapshotCsv(cards, windowMeta) {
  if (!cards || !cards.length) { toast.info('Nothing to export'); return; }
  const rows = [['Metric', 'Achieved', 'Projected', 'Target', 'Trend']];
  cards.forEach((c) => {
    rows.push([(c.label || '').replace(/,/g, ' '), c.total ?? '', c.projected ?? '', c.target ?? '', c.trend ?? '']);
  });
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob(
    [`# Reports snapshot ${windowMeta?.view || ''} ${windowMeta?.start || ''} to ${windowMeta?.end || ''}\n`, csv],
    { type: 'text/csv' }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reports-snapshot-${windowMeta?.start || Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success('CSV exported');
}

/* -----------------------------------------------------------------------
 * ROOT COMPONENT
 * -----------------------------------------------------------------------
 */
export default function ReportsModule({ salonId, canManageFinancials = true, getAuthHeaders }) {
  useEffect(() => { injectZenCss(); }, []); // keep .zen theme available for legacy sub-tabs

  const [tab, setTab] = useState('snapshot');
  const [view, setView] = useState('month');           // day | week | month
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [compare, setCompare] = useState(false);

  // Branch scoping
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('all');
  useEffect(() => {
    if (!salonId) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/branches`, { headers: getAuthHeaders() });
        setBranches(res.data || []);
      } catch (_) { /* single-branch mode */ }
    })();
  }, [salonId, getAuthHeaders]);
  const effectiveBranch = branchId === 'all' ? null : branchId;

  // Drawers
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showTargets, setShowTargets] = useState(false);

  // Snapshot lifted for header Export button
  const [snapshotData, setSnapshotData] = useState({ cards: [], window: null });

  return (
    <div className="shrpt" data-testid="reports-module">
      <div className="content">
        {/* Page header */}
        <div className="phead">
          <h2>
            <span className="hic"><Icon name="chart" /></span>
            Reports
          </h2>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {branches.length > 1 && (
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
                      data-testid="reports-branch-filter" title="Filter by branch"
                      className="viewsel">
                <option value="all">All branches</option>
                {branches.map((b) => (<option key={b.id} value={b.id}>{b.branch_name || b.name}</option>))}
              </select>
            )}
            <button className="btn-ghost" onClick={() => exportSnapshotCsv(snapshotData.cards, snapshotData.window)}
                    data-testid="reports-export-btn">
              <Icon name="download" />Export
            </button>
            {canManageFinancials && (
              <button className="btn-primary" onClick={() => setShowAddEntry(true)} data-testid="reports-add-entry-btn">
                <Icon name="plus" />Add entry
              </button>
            )}
          </div>
        </div>

        {/* Subtabs */}
        <div className="subtabs" data-testid="reports-subtabs">
          {SECTIONS.map((s) => (
            <button key={s.id}
                    className={`subtab ${tab === s.id ? 'on' : ''}`}
                    onClick={() => setTab(s.id)}
                    data-testid={`reports-tab-${s.id}`}>
              <Icon name={s.ico} />{s.label}
            </button>
          ))}
        </div>

        {/* Control bar (view selector + date stepper + compare + configure) */}
        <div className="ctrlbar">
          <select className="viewsel" value={view} onChange={(e) => setView(e.target.value)} data-testid="reports-view-select">
            <option value="day">Day view</option>
            <option value="week">Week view</option>
            <option value="month">Month view</option>
          </select>
          <div className="datenav">
            <button onClick={() => setDate(stepDate(view, date, -1))} data-testid="reports-date-prev" title="Previous"><Icon name="chevL" /></button>
            <span className="dlbl" data-testid="reports-date-label">{windowLabel(view, date)}</span>
            <button onClick={() => setDate(stepDate(view, date, 1))} data-testid="reports-date-next" title="Next"><Icon name="chevR" /></button>
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="reports-date-input"
                 className="viewsel" style={{ minWidth: 130 }} />
          <button className={`btn-ghost ${compare ? 'on' : ''}`} onClick={() => setCompare((v) => !v)} data-testid="reports-compare-btn">
            <Icon name="layers" />Compare
          </button>
          <div className="ctrlbar__spacer" />
          {tab === 'snapshot' && (
            <>
              <button className="btn-ghost" onClick={() => setShowTargets(true)} data-testid="reports-targets-btn">
                <Icon name="gauge" />Targets
              </button>
              <button className="btn-ghost" onClick={() => setShowConfig(true)} data-testid="reports-configure-btn">
                <Icon name="filter" />Configure cards
              </button>
            </>
          )}
        </div>

        {/* Section body */}
        <div className={`sec ${tab === 'snapshot' ? 'on' : ''}`}>
          {tab === 'snapshot' && (
            <SnapshotTab salonId={salonId} view={view} date={date} compare={compare} branchId={effectiveBranch}
                         getAuthHeaders={getAuthHeaders} onLoaded={setSnapshotData} />
          )}
        </div>
        <div className={`sec ${tab === 'sales' ? 'on' : ''}`}>
          {tab === 'sales' && <SalesTab salonId={salonId} view={view} date={date} branchId={effectiveBranch} getAuthHeaders={getAuthHeaders} />}
        </div>
        <div className={`sec ${tab === 'payments-gst' ? 'on' : ''}`}>
          {tab === 'payments-gst' && <PaymentsTab salonId={salonId} view={view} date={date} branchId={effectiveBranch} getAuthHeaders={getAuthHeaders} />}
        </div>
        <div className={`sec ${tab === 'pnl' ? 'on' : ''}`}>
          {tab === 'pnl' && <PnlTab salonId={salonId} view={view} date={date} branchId={effectiveBranch} getAuthHeaders={getAuthHeaders}
                                    canManage={canManageFinancials} onAdd={() => setShowAddEntry(true)} />}
        </div>
        <div className={`sec ${tab === 'staff' ? 'on' : ''}`}>
          {tab === 'staff' && <StaffTab salonId={salonId} view={view} date={date} branchId={effectiveBranch} getAuthHeaders={getAuthHeaders} canManage={canManageFinancials} />}
        </div>
        <div className={`sec ${tab === 'clients' ? 'on' : ''}`}>
          {tab === 'clients' && <ClientsTab salonId={salonId} view={view} date={date} branchId={effectiveBranch} getAuthHeaders={getAuthHeaders} />}
        </div>
        <div className={`sec ${tab === 'marketing' ? 'on' : ''}`}>
          {tab === 'marketing' && <MarketingTab salonId={salonId} view={view} date={date} branchId={effectiveBranch} getAuthHeaders={getAuthHeaders} />}
        </div>
        <div className={`sec ${tab === 'inventory' ? 'on' : ''}`}>
          {tab === 'inventory' && <InventoryTab salonId={salonId} view={view} date={date} branchId={effectiveBranch} getAuthHeaders={getAuthHeaders} />}
        </div>

        <div className="refresh" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          Data last updated {new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {showAddEntry && <AddEntryDrawer salonId={salonId} getAuthHeaders={getAuthHeaders} onClose={() => setShowAddEntry(false)} />}
      {showConfig && <ConfigDrawer salonId={salonId} getAuthHeaders={getAuthHeaders} onClose={() => setShowConfig(false)} />}
      {showTargets && <TargetsDrawer salonId={salonId} view={view} date={date} getAuthHeaders={getAuthHeaders} onClose={() => setShowTargets(false)} />}
    </div>
  );
}

/* -----------------------------------------------------------------------
 * SNAPSHOT TAB — left kgrid + right detail panel
 * -----------------------------------------------------------------------
 */
function AnimatedPie({ data, centerLabel, centerValue }) {
  const total = data.reduce((s, d) => s + Number(d[1] || 0), 0) || 1;
  const R = 54, sw = 26, cx = 79, cy = 79, circ = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="pie">
      <svg viewBox="0 0 158 158" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#F1F5FB" strokeWidth={sw} />
        {data.map(([name, value], i) => {
          const frac = Number(value || 0) / total;
          const len = frac * circ;
          const rot = acc * 360;
          acc += frac;
          const col = PIE_COLORS[i % PIE_COLORS.length];
          return (
            <circle key={name + i} className="pieseg" cx={cx} cy={cy} r={R} fill="none"
                    stroke={col} strokeWidth={sw} strokeDasharray={`0 ${circ.toFixed(1)}`}
                    style={{
                      '--len': `${len.toFixed(1)}`,
                      '--gap': `${(circ - len).toFixed(1)}`,
                      transform: `rotate(${rot.toFixed(2)}deg)`,
                      transformOrigin: `${cx}px ${cy}px`,
                      animationDelay: `${(i * 0.09).toFixed(2)}s`,
                    }}>
              <title>{`${name}: ${Math.round(frac * 100)}%`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="pie-c">
        <div className="pie-c-v">{centerValue}</div>
        <div className="pie-c-l">{centerLabel || 'total'}</div>
      </div>
    </div>
  );
}
function AnimatedBars({ data }) {
  const max = Math.max(1, ...data.map((d) => Number(d[1] || 0)));
  const ticks = [max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0];
  return (
    <div className="bars">
      <div className="yaxis">{ticks.map((t, i) => <span key={i}>{t}</span>)}</div>
      {data.map(([name, value], i) => {
        const h = Math.max(2, (Number(value || 0) / max) * 100);
        const col = PIE_COLORS[i % PIE_COLORS.length];
        return (
          <div key={name + i} className="bcol">
            <div className="bar" data-v={value} style={{ height: `${h}%`, background: col }} />
            <div className="bl">{name}</div>
          </div>
        );
      })}
    </div>
  );
}
function GaugeRing({ pct }) {
  const R = 26, circ = 2 * Math.PI * R;
  return (
    <div className="gauge">
      <svg width="56" height="56">
        <circle cx="28" cy="28" r={R} fill="none" stroke="#E6EBF4" strokeWidth="5" />
        <circle cx="28" cy="28" r={R} fill="none" stroke="#D9A82C" strokeWidth="5"
                strokeLinecap="round" strokeDasharray={circ}
                strokeDashoffset={circ - (circ * pct) / 100} />
      </svg>
      <span className="gv">{pct}%</span>
    </div>
  );
}

function SnapshotTab({ salonId, view, date, compare, branchId, getAuthHeaders, onLoaded }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [drill, setDrill] = useState(null);
  const [tgtEdit, setTgtEdit] = useState(null);

  const load = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const bp = branchId ? `&branch_id=${branchId}` : '';
      const res = await axios.get(
        `${API}/salons/${salonId}/reports/snapshot?view=${view}&date=${date}&compare=${compare}${bp}`,
        { headers: getAuthHeaders() }
      );
      const list = res.data?.cards || [];
      setCards(list);
      if (list.length && !list.find((c) => c.id === sel)) setSel(list[0].id);
      if (onLoaded) onLoaded({ cards: list, window: res.data?.window });
    } catch (_) {
      toast.error('Failed to load snapshot');
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, view, date, compare, branchId]);
  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => cards.find((c) => c.id === sel) || cards[0], [cards, sel]);

  if (loading) return <div className="empty" data-testid="reports-loading">Loading snapshot…</div>;
  if (!cards.length) return <div className="empty" data-testid="reports-empty">No metrics enabled. Use “Configure cards” to enable KPIs.</div>;

  return (
    <>
      <div className="snap">
        <div className="snap-l">
          <div className="kgrid" data-testid="reports-kgrid">
            {cards.map((c, i) => {
              const [bg, acc] = GRADS[i % GRADS.length];
              const trendUp = c.up === true;
              const trendDown = c.up === false;
              return (
                <button key={c.id}
                        className={`kcard ${c.id === (active?.id) ? 'on' : ''}`}
                        style={{ background: bg }}
                        onClick={() => setSel(c.id)}
                        data-testid={`reports-card-${c.id}`}>
                  <div className="kt">
                    <span className="kl">{c.label}</span>
                    <span className="kchip" style={{ color: acc }}>
                      <Icon name={CARD_ICON[c.id] || 'chart'} />
                    </span>
                  </div>
                  <div className="kv">{formatCardValue(c)}</div>
                  {c.trend && (
                    <div className={`kd ${trendUp ? 'up' : trendDown ? 'down' : 'flat'}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                        {trendUp ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                      </svg>
                      {c.trend}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="snap-r">
          {active && (
            <SnapshotDetail card={active} salonId={salonId} view={view} date={date} branchId={branchId}
                            getAuthHeaders={getAuthHeaders}
                            onEditTarget={() => setTgtEdit(active)}
                            onDrill={() => setDrill(active)} />
          )}
        </div>
      </div>

      {drill && (
        <MetricDrillDrawer card={drill} salonId={salonId} view={view} date={date} branchId={branchId}
                           getAuthHeaders={getAuthHeaders} onClose={() => setDrill(null)} />
      )}
      {tgtEdit && (
        <TargetEditDrawer card={tgtEdit} salonId={salonId} view={view}
                          getAuthHeaders={getAuthHeaders}
                          onClose={() => setTgtEdit(null)}
                          onSaved={() => { setTgtEdit(null); load(); }} />
      )}
    </>
  );
}

function SnapshotDetail({ card, salonId, view, date, branchId, getAuthHeaders, onEditTarget, onDrill }) {
  const [breakdown, setBreakdown] = useState(card.chart?.data || []);
  useEffect(() => {
    setBreakdown(card.chart?.data || []);
    (async () => {
      try {
        const bp = branchId ? `&branch_id=${branchId}` : '';
        const res = await axios.get(
          `${API}/salons/${salonId}/reports/metric/${card.id}?view=${view}&date=${date}${bp}`,
          { headers: getAuthHeaders() }
        );
        if (res.data?.breakdown) setBreakdown(res.data.breakdown.map((r) => [r.label, r.value]));
      } catch (_) { /* keep chart from card */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, view, date, branchId]);

  const useBars = BAR_METRICS.has(card.id) || card.chart?.kind === 'bar';
  const pct = card.target > 0 ? Math.min(100, Math.round((card.total / card.target) * 100)) : 0;
  const total = breakdown.reduce((s, d) => s + Number(d[1] || 0), 0);

  const description = {
    appointments: 'Booked appointments and their live status.',
    collections: 'Money actually received in this window.',
    revenue: 'Value earned from completed tokens (services + retail).',
    source: 'How bookings entered the system.',
    guests: 'Distinct paying customers, split new vs returning.',
    avgticket: 'Average bill value per served guest.',
    utilization: 'Booked service time ÷ available staffed time.',
    wait: 'Average walk-in wait before service starts.',
    products: 'Retail product sales value.',
    addons: 'Upsell revenue added at the chair.',
    noshow: 'Share of bookings that never arrived.',
    rebooking: 'Guests who booked their next visit before leaving.',
    feedback: 'Average rating across reviews collected in this window.',
    membership: 'Unredeemed prepaid value the salon owes guests.',
    discounts: 'Total discount value granted.',
  }[card.id] || 'Detailed breakdown for this metric.';

  return (
    <>
      <div className="dtop">
        <div>
          <h3>{card.label.replace(' (₹)', '')}</h3>
          <p>{description}</p>
        </div>
        <div className="tgt">
          <div className="tc"><span className="k">Achieved</span><span className="v">{formatCardValue(card)}</span></div>
          <div className="sep" />
          <div className="tc"><span className="k">Projected</span><span className="v">{formatCardValue({ ...card, total: card.projected || 0 })}</span></div>
          <div className="sep" />
          <div className="tc"><span className="k">Target</span>
            <span className="v">{formatCardValue({ ...card, total: card.target || 0 })}
              <button title="Edit target" onClick={onEditTarget} data-testid={`reports-edit-target-${card.id}`}><Icon name="edit" /></button>
            </span>
          </div>
          <GaugeRing pct={pct} />
        </div>
      </div>

      <div className="dbody">
        <div className="chartbox">
          <div className="chart-ttl">{card.chart?.title || 'Breakdown'}</div>
          {breakdown.length === 0 ? (
            <div className="empty">No data for this period.</div>
          ) : useBars ? (
            <AnimatedBars data={breakdown} />
          ) : (
            <>
              <div className="pieholder">
                <AnimatedPie data={breakdown}
                             centerLabel="total"
                             centerValue={card.money ? rupee(total) : Math.round(total)} />
              </div>
              <div className="legend" style={{ justifyContent: 'center' }}>
                {breakdown.map(([n], i) => (
                  <span key={n + i}><i style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{n}</span>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="dtable">
          <table>
            <thead><tr><th>{(card.chart?.title || 'Item')}</th><th>Value</th></tr></thead>
            <tbody>
              {breakdown.map(([n, v], i) => (
                <tr key={n + i}>
                  <td><span className="sw" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{n}</td>
                  <td>{card.money ? rupee(v) : Math.round(Number(v || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dfoot">
        <a onClick={() => toast.info('Feedback noted — thanks!')} data-testid="reports-feedback-link">Give feedback</a>
        <a onClick={onDrill} data-testid={`reports-drill-${card.id}`}>View details ›</a>
      </div>
    </>
  );
}

/* -----------------------------------------------------------------------
 * DRAWERS — Config / Targets / MetricDrill / TargetEdit / AddEntry
 * -----------------------------------------------------------------------
 * All drawers are portalled to <body> so they cannot be trapped behind the
 * salon-dashboard sidebar / ribbon stacking contexts and always render on
 * top of the app shell.
 */
function Drawer({ children }) {
  return createPortal(children, document.body);
}

function ConfigDrawer({ salonId, getAuthHeaders, onClose }) {
  const [prefs, setPrefs] = useState({ all_cards: [], cards: [], order: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/reports/prefs`, { headers: getAuthHeaders() });
        setPrefs(res.data || { all_cards: [], cards: [], order: [] });
      } catch (_) { toast.error('Load failed'); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id) => setPrefs((p) => {
    const set = new Set(p.cards);
    const order = Array.isArray(p.order) ? [...p.order] : [];
    if (set.has(id)) set.delete(id);
    else { set.add(id); if (!order.includes(id)) order.push(id); }
    return { ...p, cards: Array.from(set), order };
  });
  const move = (id, dir) => setPrefs((p) => {
    const order = Array.isArray(p.order) ? [...p.order] : [...(p.cards || [])];
    const idx = order.indexOf(id);
    if (idx < 0) return p;
    const j = idx + dir;
    if (j < 0 || j >= order.length) return p;
    [order[idx], order[j]] = [order[j], order[idx]];
    return { ...p, order };
  });
  const save = async () => {
    setBusy(true);
    try {
      const enabled = prefs.cards || [];
      const order = Array.isArray(prefs.order) ? [...prefs.order] : [];
      enabled.forEach((id) => { if (!order.includes(id)) order.push(id); });
      await axios.put(`${API}/salons/${salonId}/reports/prefs`, { cards: enabled, order }, { headers: getAuthHeaders() });
      toast.success('Card layout saved');
      onClose();
    } catch (_) { toast.error('Save failed'); }
    finally { setBusy(false); }
  };

  const orderedCards = useMemo(() => {
    const all = prefs.all_cards || [];
    const order = prefs.order && prefs.order.length ? prefs.order : all.map((c) => c.id);
    const byId = Object.fromEntries(all.map((c) => [c.id, c]));
    return [...order.filter((id) => byId[id]).map((id) => byId[id]),
            ...all.filter((c) => !order.includes(c.id))];
  }, [prefs]);

  return (
    <Drawer>
      <div className="shrpt-ov" onClick={onClose} />
      <aside className="shrpt-drawer" data-testid="reports-config-drawer">
        <div className="dh">
          <div className="tt">
            <div className="ic"><Icon name="filter" /></div>
            <div>
              <h3>Configure cards</h3>
              <p>Choose which KPIs appear on the snapshot and reorder them.</p>
            </div>
          </div>
          <button className="close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="db">
          {orderedCards.length === 0 && <div className="empty">No cards available</div>}
          {orderedCards.map((c) => (
            <div key={c.id} className="cfg-row" data-testid={`cfg-row-${c.id}`}>
              <span className="grip" title="Reorder">
                <button onClick={() => move(c.id, -1)} style={{ padding: 0 }} data-testid={`cfg-up-${c.id}`}><Icon name="chevD" className="" /></button>
              </span>
              <span className="cn">{c.label}</span>
              <button onClick={() => move(c.id, 1)} className="grip" style={{ padding: 0 }} data-testid={`cfg-down-${c.id}`} title="Move down"><Icon name="chevD" /></button>
              <button className={`toggle ${prefs.cards.includes(c.id) ? 'on' : ''}`}
                      onClick={() => toggle(c.id)} data-testid={`cfg-toggle-${c.id}`} />
            </div>
          ))}
        </div>
        <div className="df">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy} data-testid="reports-config-save">
            <Icon name="save" />{busy ? 'Saving…' : 'Save layout'}
          </button>
        </div>
      </aside>
    </Drawer>
  );
}

function TargetsDrawer({ salonId, view, date, getAuthHeaders, onClose }) {
  const [cards, setCards] = useState([]);
  const [targets, setTargets] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/reports/snapshot?view=${view}&date=${date}`, { headers: getAuthHeaders() });
        const list = res.data?.cards || [];
        setCards(list);
        const t = {}; list.forEach((c) => { t[c.id] = c.target; });
        setTargets(t);
      } catch (_) { /* noop */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date]);

  const saveOne = async (id) => {
    setBusy(true);
    try {
      await axios.put(`${API}/salons/${salonId}/reports/targets`, {
        metric_id: id, period_type: view, target: Number(targets[id]) || 0,
      }, { headers: getAuthHeaders() });
      toast.success('Target saved');
    } catch (_) { toast.error('Save failed'); }
    finally { setBusy(false); }
  };

  return (
    <Drawer>
      <div className="shrpt-ov" onClick={onClose} />
      <aside className="shrpt-drawer" data-testid="reports-targets-drawer">
        <div className="dh">
          <div className="tt">
            <div className="ic"><Icon name="gauge" /></div>
            <div>
              <h3>Edit targets</h3>
              <p>Set the {view} goal for each metric. Reports compare against these values.</p>
            </div>
          </div>
          <button className="close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="db">
          {cards.map((c) => (
            <div key={c.id} className="field" data-testid={`tgt-field-${c.id}`}>
              <label>{c.label} · current {c.money ? rupee(c.total) : c.total}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" value={targets[c.id] ?? ''} onChange={(e) => setTargets((t) => ({ ...t, [c.id]: e.target.value }))}
                       data-testid={`tgt-input-${c.id}`} style={{ flex: 1 }} />
                <button className="btn-primary" onClick={() => saveOne(c.id)} disabled={busy} data-testid={`tgt-save-${c.id}`}>
                  <Icon name="save" />Save
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </Drawer>
  );
}

function TargetEditDrawer({ card, salonId, view, getAuthHeaders, onClose, onSaved }) {
  const [value, setValue] = useState(card.target || 0);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await axios.put(`${API}/salons/${salonId}/reports/targets`,
        { metric_id: card.id, period_type: view, target: Number(value) },
        { headers: getAuthHeaders() });
      toast.success('Target updated');
      onSaved();
    } catch (_) { toast.error('Could not save target'); }
    finally { setBusy(false); }
  };
  return (
    <Drawer>
      <div className="shrpt-ov" onClick={onClose} />
      <aside className="shrpt-drawer narrow" data-testid="reports-target-edit-drawer">
        <div className="dh">
          <div className="tt">
            <div className="ic"><Icon name="gauge" /></div>
            <div><h3>{card.label}</h3><p>Set {view} target</p></div>
          </div>
          <button className="close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="db">
          <div className="field">
            <label>Target value</label>
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)} autoFocus
                   data-testid={`target-input-${card.id}`} />
          </div>
        </div>
        <div className="df">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy} data-testid={`target-save-${card.id}`}>
            <Icon name="save" />{busy ? 'Saving…' : 'Save target'}
          </button>
        </div>
      </aside>
    </Drawer>
  );
}

function MetricDrillDrawer({ card, salonId, view, date, branchId, getAuthHeaders, onClose }) {
  const [data, setData] = useState({ breakdown: [] });
  useEffect(() => {
    (async () => {
      try {
        const bp = branchId ? `&branch_id=${branchId}` : '';
        const res = await axios.get(`${API}/salons/${salonId}/reports/metric/${card.id}?view=${view}&date=${date}${bp}`,
          { headers: getAuthHeaders() });
        setData(res.data);
      } catch (_) { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, view, date]);

  const rows = data.breakdown || (card.chart?.data || []).map(([label, value]) => ({ label, value, share: 0 }));
  const maxV = Math.max(1, ...rows.map((r) => Number(r.value || 0)));
  const totalV = rows.reduce((s, r) => s + Number(r.value || 0), 0) || 1;

  return (
    <Drawer>
      <div className="shrpt-ov" onClick={onClose} />
      <aside className="shrpt-drawer" data-testid="reports-drill-drawer">
        <div className="dh">
          <div className="tt">
            <div className="ic"><Icon name="chart" /></div>
            <div>
              <h3>{card.label.replace(' (₹)', '')} — details</h3>
              <p>Full share breakdown</p>
            </div>
          </div>
          <button className="close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="db">
          <div className="strip" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div className="sc"><div className="ci" style={{ background: '#EEF3FF', color: '#1B54C7' }}><Icon name="trendup" /></div>
              <b>{formatCardValue(card)}</b><span>Achieved</span></div>
            <div className="sc"><div className="ci" style={{ background: '#E4F6F3', color: '#12A594' }}><Icon name="chart" /></div>
              <b>{formatCardValue({ ...card, total: card.projected || 0 })}</b><span>Projected</span></div>
            <div className="sc"><div className="ci" style={{ background: '#FCF4E2', color: '#9A7314' }}><Icon name="gauge" /></div>
              <b>{formatCardValue({ ...card, total: card.target || 0 })}</b><span>Target</span></div>
          </div>
          <div className="dtable">
            <table>
              <thead><tr><th>Item</th><th>Bar</th><th>Value</th><th>Share</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.label + i}>
                    <td><span className="sw" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{r.label}</td>
                    <td style={{ minWidth: 120 }}>
                      <div className="bar-mini"><i style={{ width: `${(Number(r.value || 0) / maxV) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} /></div>
                    </td>
                    <td>{card.money ? rupee(r.value) : Math.round(Number(r.value || 0))}</td>
                    <td>{r.share || Math.round((Number(r.value || 0) / totalV) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </aside>
    </Drawer>
  );
}

function AddEntryDrawer({ salonId, getAuthHeaders, onClose }) {
  const [f, setF] = useState({
    type: 'outflow',
    category: 'consumables',
    amount: '',
    payment_mode: 'cash',
    narration: '',
    date: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.amount || Number(f.amount) <= 0) return toast.error('Enter amount');
    setBusy(true);
    try {
      await axios.post(`${API}/salons/${salonId}/financials/transactions`, {
        ...f, amount: parseFloat(f.amount),
      }, { headers: getAuthHeaders() });
      toast.success('Entry saved');
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setBusy(false); }
  };
  return (
    <Drawer>
      <div className="shrpt-ov" onClick={onClose} />
      <aside className="shrpt-drawer narrow" data-testid="reports-add-entry-drawer">
        <div className="dh">
          <div className="tt">
            <div className="ic"><Icon name="wallet" /></div>
            <div><h3>Add finance entry</h3><p>Record income, expense, or adjustment.</p></div>
          </div>
          <button className="close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="db">
          <div className="field">
            <label>Type</label>
            <select value={f.type} onChange={(e) => upd('type', e.target.value)} data-testid="entry-type">
              {['inflow', 'outflow', 'deposit', 'withdrawal', 'adjustment'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Category</label>
            <select value={f.category} onChange={(e) => upd('category', e.target.value)} data-testid="entry-category">
              {['consumables', 'salary', 'staff_refreshment', 'utilities', 'rent', 'maintenance', 'products', 'marketing', 'equipment', 'custom'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field"><label>Amount (₹)</label>
            <input type="number" value={f.amount} onChange={(e) => upd('amount', e.target.value)} autoFocus data-testid="entry-amount" />
          </div>
          <div className="field"><label>Date</label>
            <input type="date" value={f.date} onChange={(e) => upd('date', e.target.value)} data-testid="entry-date" />
          </div>
          <div className="field"><label>Payment mode</label>
            <select value={f.payment_mode} onChange={(e) => upd('payment_mode', e.target.value)} data-testid="entry-payment-mode">
              {['cash', 'upi', 'card', 'wallet'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field"><label>Narration</label>
            <textarea value={f.narration} onChange={(e) => upd('narration', e.target.value)} placeholder="Optional note…" data-testid="entry-narration" rows={2} />
          </div>
        </div>
        <div className="df">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy} data-testid="entry-save">
            <Icon name="save" />{busy ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </aside>
    </Drawer>
  );
}

/* -----------------------------------------------------------------------
 * SALES TAB
 * -----------------------------------------------------------------------
 */
function SalesTab({ salonId, view, date, branchId, getAuthHeaders }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const bp = branchId ? `&branch_id=${branchId}` : '';
        const res = await axios.get(`${API}/salons/${salonId}/reports/sales?view=${view}&date=${date}${bp}`, { headers: getAuthHeaders() });
        setData(res.data);
      } catch (_) { toast.error('Failed to load sales'); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, view, date, branchId]);
  if (!data) return <div className="empty">Loading…</div>;

  const bookings = data.bookings || 0;
  const avg = bookings ? (data.total_revenue || 0) / bookings : 0;
  const line = data.line || [];
  const staff = data.by_staff || [];
  const svc = (data.by_service || []).slice(0, 15);

  return (
    <div data-testid="sales-report">
      <div className="strip">
        <div className="sc"><div className="ci" style={{ background: '#EEF3FF', color: '#1B54C7' }}><Icon name="money" /></div>
          <b>{rupee(data.total_revenue)}</b><span>Revenue</span><small style={{ color: '#5A8A2E' }}>{bookings} bookings</small></div>
        <div className="sc"><div className="ci" style={{ background: '#E4F6F3', color: '#12A594' }}><Icon name="tag" /></div>
          <b>{rupee(avg)}</b><span>Avg ticket</span><small style={{ color: '#6B7793' }}>Per booking</small></div>
        <div className="sc"><div className="ci" style={{ background: '#FCF4E2', color: '#9A7314' }}><Icon name="scissors" /></div>
          <b>{svc.length}</b><span>Services sold</span><small style={{ color: '#6B7793' }}>Distinct in window</small></div>
        <div className="sc"><div className="ci" style={{ background: '#FDECEF', color: '#A61E4D' }}><Icon name="users" /></div>
          <b>{staff.length}</b><span>Staff served</span><small style={{ color: '#6B7793' }}>Active this window</small></div>
        <div className="sc"><div className="ci" style={{ background: '#EFEBFB', color: '#7A5CD1' }}><Icon name="calendar" /></div>
          <b>{line.length}</b><span>Selling days</span><small style={{ color: '#6B7793' }}>With activity</small></div>
      </div>

      <div className="card">
        <div className="card__h"><div className="t"><Icon name="trendup" />Revenue by day</div></div>
        <MiniLine data={line} />
      </div>

      <div className="g2">
        <div className="card">
          <div className="card__h"><div className="t"><Icon name="users" />Revenue by staff</div></div>
          <RankedList rows={staff.slice(0, 10).map((r) => ({ name: r.name, value: r.revenue, sub: `${r.bookings} bookings` }))} money />
        </div>
        <div className="card">
          <div className="card__h"><div className="t"><Icon name="scissors" />Top services</div></div>
          <RankedList rows={svc.map((r) => ({ name: r.name, value: r.revenue, sub: `× ${r.count}` }))} money />
        </div>
      </div>
    </div>
  );
}

function MiniLine({ data }) {
  if (!data || data.length === 0) return <div className="empty">No data</div>;
  const w = 800, h = 200, pad = 24;
  const max = Math.max(1, ...data.map((d) => Number(d.revenue || 0)));
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = pad + i * step;
    const y = h - pad - ((Number(d.revenue || 0) / max) * (h - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 220 }}>
        <polyline fill="none" stroke="#1B54C7" strokeWidth="2.4" points={points} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => {
          const x = pad + i * step;
          const y = h - pad - ((Number(d.revenue || 0) / max) * (h - pad * 2));
          return <circle key={i} cx={x} cy={y} r="3" fill="#1B54C7"><title>{`${d.date}: ${rupee(d.revenue)}`}</title></circle>;
        })}
      </svg>
    </div>
  );
}

function RankedList({ rows, money }) {
  if (!rows || rows.length === 0) return <div className="empty">No data</div>;
  const max = Math.max(1, ...rows.map((r) => Number(r.value || 0)));
  return (
    <table className="rtable">
      <thead><tr><th>Item</th><th></th><th className="r">Value</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.name + i}>
            <td><span className="nm"><span className="av" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}>{(r.name || '?')[0]}</span>{r.name}</span></td>
            <td style={{ minWidth: 120 }}><div className="bar-mini"><i style={{ width: `${(Number(r.value || 0) / max) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} /></div></td>
            <td className="r"><span className="num">{money ? rupee(r.value) : r.value}</span><br /><small style={{ color: '#6B7793', fontWeight: 600 }}>{r.sub}</small></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -----------------------------------------------------------------------
 * PAYMENTS & GST TAB
 * -----------------------------------------------------------------------
 */
function PaymentsTab({ salonId, view, date, branchId, getAuthHeaders }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const bp = branchId ? `&branch_id=${branchId}` : '';
        const res = await axios.get(`${API}/salons/${salonId}/reports/payments-gst?view=${view}&date=${date}${bp}`, { headers: getAuthHeaders() });
        setData(res.data);
      } catch (_) { toast.error('Failed to load payments'); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, view, date, branchId]);
  if (!data) return <div className="empty">Loading…</div>;

  const gst = data.gst || {};
  const byMode = data.by_mode || [];
  const totalMode = byMode.reduce((s, m) => s + Number(m.amount || 0), 0) || 1;

  return (
    <div data-testid="payments-report">
      <div className="strip">
        <div className="sc"><div className="ci" style={{ background: '#EEF3FF', color: '#1B54C7' }}><Icon name="money" /></div>
          <b>{rupee(data.total_collected)}</b><span>Collected</span><small style={{ color: '#6B7793' }}>All modes</small></div>
        <div className="sc"><div className="ci" style={{ background: '#E4F6F3', color: '#12A594' }}><Icon name="gauge" /></div>
          <b>{rupee(gst.taxable)}</b><span>Taxable value</span><small style={{ color: '#6B7793' }}>Excl. GST</small></div>
        <div className="sc"><div className="ci" style={{ background: '#FCF4E2', color: '#9A7314' }}><Icon name="tag" /></div>
          <b>{rupee(gst.cgst)}</b><span>CGST</span><small style={{ color: '#6B7793' }}>9%</small></div>
        <div className="sc"><div className="ci" style={{ background: '#FDECEF', color: '#A61E4D' }}><Icon name="tag" /></div>
          <b>{rupee(gst.sgst)}</b><span>SGST</span><small style={{ color: '#6B7793' }}>9%</small></div>
        <div className="sc"><div className="ci" style={{ background: '#EFEBFB', color: '#7A5CD1' }}><Icon name="chart" /></div>
          <b>{rupee(gst.total_tax)}</b><span>Total tax</span><small style={{ color: '#6B7793' }}>Gross {rupee(gst.gross)}</small></div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card__h"><div className="t"><Icon name="wallet" />Collections by payment mode</div></div>
          {byMode.length === 0 ? <div className="empty">No collections recorded</div> : (
            <div className="donut-wrap">
              <AnimatedPie data={byMode.map((m) => [m.mode, m.amount])} centerLabel="collected" centerValue={rupee(totalMode)} />
              <div style={{ flex: 1 }}>
                {byMode.map((m, i) => (
                  <div key={m.mode} className="kv-row">
                    <span className="k"><span className="sw" style={{ display: 'inline-block', width: 9, height: 9, background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 2, marginRight: 8 }} />{m.mode}</span>
                    <span className="v">{rupee(m.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card__h"><div className="t"><Icon name="chart" />GST summary</div></div>
          <div className="kv-row"><span className="k">Gross value (incl. GST)</span><span className="v">{rupee(gst.gross)}</span></div>
          <div className="kv-row"><span className="k">Taxable value</span><span className="v">{rupee(gst.taxable)}</span></div>
          <div className="kv-row"><span className="k">CGST (9%)</span><span className="v">{rupee(gst.cgst)}</span></div>
          <div className="kv-row"><span className="k">SGST (9%)</span><span className="v">{rupee(gst.sgst)}</span></div>
          <div className="kv-row"><span className="k">IGST</span><span className="v">{rupee(gst.igst)}</span></div>
          <div className="kv-row"><span className="k" style={{ fontWeight: 800, color: '#141C2E' }}>Total tax payable</span><span className="v" style={{ color: '#1B54C7' }}>{rupee(gst.total_tax)}</span></div>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
 * P&L TAB
 * -----------------------------------------------------------------------
 */
function PnlTab({ salonId, view, date, branchId, getAuthHeaders, canManage, onAdd }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const bp = branchId ? `&branch_id=${branchId}` : '';
        const res = await axios.get(`${API}/salons/${salonId}/reports/pnl?view=${view}&date=${date}${bp}`, { headers: getAuthHeaders() });
        setData(res.data);
      } catch (_) { toast.error('Failed to load P&L'); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, view, date, branchId]);
  if (!data) return <div className="empty">Loading…</div>;

  const revenue = data.revenue || 0;
  const expenses = data.expenses_total || 0;
  const profit = data.profit || 0;
  const margin = revenue ? Math.round((profit / revenue) * 100) : 0;

  return (
    <div data-testid="pnl-report">
      <div className="strip">
        <div className="sc"><div className="ci" style={{ background: '#EFF6E7', color: '#5A8A2E' }}><Icon name="trendup" /></div>
          <b>{rupee(revenue)}</b><span>Revenue</span></div>
        <div className="sc"><div className="ci" style={{ background: '#FDECEF', color: '#A61E4D' }}><Icon name="wallet" /></div>
          <b>{rupee(expenses)}</b><span>Expenses</span></div>
        <div className="sc"><div className="ci" style={{ background: '#EEF3FF', color: '#1B54C7' }}><Icon name="chart" /></div>
          <b style={{ color: profit >= 0 ? '#2E7D32' : '#C2255C' }}>{rupee(profit)}</b><span>Profit</span></div>
        <div className="sc"><div className="ci" style={{ background: '#FCF4E2', color: '#9A7314' }}><Icon name="gauge" /></div>
          <b>{margin}%</b><span>Margin</span></div>
        <div className="sc"><div className="ci" style={{ background: '#EFEBFB', color: '#7A5CD1' }}><Icon name="tag" /></div>
          <b>{data.expenses_by_category?.length || 0}</b><span>Expense heads</span></div>
      </div>

      <div className="card">
        <div className="card__h">
          <div className="t"><Icon name="wallet" />Expenses by category</div>
          {canManage && <button className="btn-ghost" onClick={onAdd} data-testid="pnl-add-btn"><Icon name="plus" />Add entry</button>}
        </div>
        <RankedList rows={(data.expenses_by_category || []).map((r) => ({ name: r.category, value: r.amount, sub: '' }))} money />
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
 * STAFF TAB — 4 sub-sections
 * -----------------------------------------------------------------------
 */
function StaffTab({ salonId, view, date, branchId, getAuthHeaders, canManage = true }) {
  const [sub, setSub] = useState('overview');
  const subs = [
    { id: 'overview',    l: 'Overview',    ico: 'grid' },
    { id: 'performance', l: 'Performance', ico: 'trendup' },
    { id: 'attendance',  l: 'Attendance',  ico: 'calendar' },
    { id: 'incentives',  l: 'Incentives',  ico: 'money' },
  ];
  return (
    <div>
      <div className="subtabs" style={{ marginBottom: 12 }} data-testid="staff-report-subtabs">
        {subs.map((t) => (
          <button key={t.id} className={`subtab ${sub === t.id ? 'on' : ''}`}
                  onClick={() => setSub(t.id)}
                  data-testid={`staff-report-tab-${t.id}`}>
            <Icon name={t.ico} />{t.l}
          </button>
        ))}
      </div>
      {sub === 'overview'    && <StaffOverviewSub salonId={salonId} view={view} date={date} branchId={branchId} getAuthHeaders={getAuthHeaders} />}
      {sub === 'performance' && <StaffPerformanceSub salonId={salonId} view={view} date={date} branchId={branchId} getAuthHeaders={getAuthHeaders} />}
      {sub === 'attendance'  && <StaffAttendanceSub salonId={salonId} date={date} branchId={branchId} getAuthHeaders={getAuthHeaders} />}
      {sub === 'incentives'  && <StaffIncentiveSub salonId={salonId} date={date} branchId={branchId} getAuthHeaders={getAuthHeaders} canManage={canManage} />}
    </div>
  );
}

/* -----------------------------------------------------------------------
 * CLIENTS TAB
 * -----------------------------------------------------------------------
 */
function ClientsTab({ salonId, view, date, branchId, getAuthHeaders }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const bp = branchId ? `&branch_id=${branchId}` : '';
        const res = await axios.get(`${API}/salons/${salonId}/reports/clients?view=${view}&date=${date}${bp}`, { headers: getAuthHeaders() });
        setData(res.data);
      } catch (_) { /* noop */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, view, date, branchId]);
  if (!data) return <div className="empty">Loading…</div>;

  const retention = data.unique_guests ? Math.round((data.returning_guests / data.unique_guests) * 100) : 0;
  const totalMix = (data.new_guests || 0) + (data.returning_guests || 0) || 1;

  return (
    <div data-testid="clients-report">
      <div className="strip">
        <div className="sc"><div className="ci" style={{ background: '#EEF3FF', color: '#1B54C7' }}><Icon name="users" /></div>
          <b>{data.unique_guests}</b><span>Unique guests</span></div>
        <div className="sc"><div className="ci" style={{ background: '#EFF6E7', color: '#5A8A2E' }}><Icon name="user" /></div>
          <b>{data.new_guests}</b><span>New guests</span><small style={{ color: '#6B7793' }}>{Math.round((data.new_guests / totalMix) * 100)}%</small></div>
        <div className="sc"><div className="ci" style={{ background: '#FCF4E2', color: '#9A7314' }}><Icon name="ret" /></div>
          <b>{data.returning_guests}</b><span>Returning</span><small style={{ color: '#6B7793' }}>{Math.round((data.returning_guests / totalMix) * 100)}%</small></div>
        <div className="sc"><div className="ci" style={{ background: '#E4F6F3', color: '#12A594' }}><Icon name="gauge" /></div>
          <b>{retention}%</b><span>Retention</span><small style={{ color: '#6B7793' }}>Returning ÷ unique</small></div>
        <div className="sc"><div className="ci" style={{ background: '#EFEBFB', color: '#7A5CD1' }}><Icon name="star" /></div>
          <b>{(data.top_spenders || []).length}</b><span>Top spenders</span><small style={{ color: '#6B7793' }}>Ranked below</small></div>
      </div>

      <div className="card">
        <div className="card__h"><div className="t"><Icon name="trendup" />Top spenders</div></div>
        {!(data.top_spenders || []).length ? <div className="empty">No paying customers in this window</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="rtable">
              <thead><tr><th>Guest</th><th>Phone</th><th>Visits</th><th className="r">Total spend</th></tr></thead>
              <tbody>
                {(data.top_spenders || []).map((r, i) => (
                  <tr key={r.phone + i}>
                    <td><span className="nm"><span className="av" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}>{(r.name || '?')[0]}</span>{r.name}</span></td>
                    <td>{r.phone}</td>
                    <td><span className="num">{r.visits}</span></td>
                    <td className="r"><span className="num">{rupee(r.spend)}</span></td>
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
 * MARKETING TAB
 * -----------------------------------------------------------------------
 */
function MarketingTab({ salonId, view, date, branchId, getAuthHeaders }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const bp = branchId ? `&branch_id=${branchId}` : '';
        const res = await axios.get(`${API}/salons/${salonId}/reports/marketing?view=${view}&date=${date}${bp}`, { headers: getAuthHeaders() });
        setData(res.data);
      } catch (_) { /* noop */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, view, date, branchId]);
  if (!data) return <div className="empty">Loading…</div>;
  const dRate = data.messages_sent ? Math.round((data.delivered / data.messages_sent) * 100) : 0;

  return (
    <div data-testid="marketing-report">
      <div className="strip">
        <div className="sc"><div className="ci" style={{ background: '#EEF3FF', color: '#1B54C7' }}><Icon name="chart" /></div>
          <b>{data.messages_sent}</b><span>Messages sent</span><small style={{ color: '#6B7793' }}>{data.delivered} delivered</small></div>
        <div className="sc"><div className="ci" style={{ background: '#EFF6E7', color: '#5A8A2E' }}><Icon name="gauge" /></div>
          <b>{dRate}%</b><span>Delivery rate</span></div>
        <div className="sc"><div className="ci" style={{ background: '#FCF4E2', color: '#9A7314' }}><Icon name="tag" /></div>
          <b>{data.coupon_redemptions}</b><span>Coupon redemptions</span></div>
        <div className="sc"><div className="ci" style={{ background: '#FDECEF', color: '#A61E4D' }}><Icon name="wallet" /></div>
          <b>{rupee(data.coupon_value)}</b><span>Coupon value</span><small style={{ color: '#6B7793' }}>Total discount</small></div>
        <div className="sc"><div className="ci" style={{ background: '#EFEBFB', color: '#7A5CD1' }}><Icon name="money" /></div>
          <b>{rupee(data.cost)}</b><span>Messaging cost</span></div>
      </div>

      <div className="card">
        <div className="card__h"><div className="t"><Icon name="chart" />Campaign performance</div></div>
        <div className="kv-row"><span className="k">Messages queued</span><span className="v">{data.messages_sent}</span></div>
        <div className="kv-row"><span className="k">Delivered</span><span className="v">{data.delivered}</span></div>
        <div className="kv-row"><span className="k">Coupon redemptions</span><span className="v">{data.coupon_redemptions}</span></div>
        <div className="kv-row"><span className="k">Discount value granted</span><span className="v">{rupee(data.coupon_value)}</span></div>
        <div className="kv-row"><span className="k">Total messaging spend</span><span className="v">{rupee(data.cost)}</span></div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
 * INVENTORY TAB
 * -----------------------------------------------------------------------
 */
function InventoryTab({ salonId, view, date, branchId, getAuthHeaders }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const bp = branchId ? `&branch_id=${branchId}` : '';
        const res = await axios.get(`${API}/salons/${salonId}/reports/inventory?view=${view}&date=${date}${bp}`, { headers: getAuthHeaders() });
        setData(res.data);
      } catch (_) { /* noop */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, view, date, branchId]);
  if (!data) return <div className="empty">Loading…</div>;

  const low = data.below_reorder || [];
  return (
    <div data-testid="inventory-report">
      <div className="strip">
        <div className="sc"><div className="ci" style={{ background: '#EEF3FF', color: '#1B54C7' }}><Icon name="box" /></div>
          <b>{rupee(data.on_hand_value)}</b><span>On-hand value</span></div>
        <div className="sc"><div className="ci" style={{ background: '#EFF6E7', color: '#5A8A2E' }}><Icon name="cart" /></div>
          <b>{rupee(data.purchases_value)}</b><span>Purchases</span><small style={{ color: '#6B7793' }}>In this window</small></div>
        <div className="sc"><div className="ci" style={{ background: '#FCF4E2', color: '#9A7314' }}><Icon name="scissors" /></div>
          <b>{rupee(data.consumed_value)}</b><span>Consumed</span><small style={{ color: '#6B7793' }}>Service + retail</small></div>
        <div className="sc"><div className="ci" style={{ background: '#FDECEF', color: '#A61E4D' }}><Icon name="alert" /></div>
          <b>{low.length}</b><span>Below reorder</span><small style={{ color: '#6B7793' }}>Needs restocking</small></div>
        <div className="sc"><div className="ci" style={{ background: '#EFEBFB', color: '#7A5CD1' }}><Icon name="restock" /></div>
          <b>{rupee(data.purchases_value - data.consumed_value)}</b><span>Net stock ∆</span></div>
      </div>

      <div className="card">
        <div className="card__h"><div className="t"><Icon name="alert" />Items below reorder level</div></div>
        {low.length === 0 ? <div className="empty">All items are healthy — no restock needed.</div> : (
          <table className="rtable">
            <thead><tr><th>Item</th><th>Current qty</th><th>Reorder at</th><th className="r">Status</th></tr></thead>
            <tbody>
              {low.map((r, i) => (
                <tr key={r.name + i}>
                  <td><span className="nm"><span className="av" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}><Icon name="box" size={12} /></span>{r.name}</span></td>
                  <td><span className="num">{r.qty}</span></td>
                  <td><span className="num">{r.reorder_level}</span></td>
                  <td className="r"><span className="pill r">Low</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
