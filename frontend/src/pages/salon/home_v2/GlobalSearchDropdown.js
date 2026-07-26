/**
 * GlobalSearchDropdown.js — topbar-anchored search dropdown (Angel One style).
 *
 * Design goals (from continuation request screenshots):
 *   • Anchored under the topbar search input (NOT a full-screen modal)
 *   • Category chips at the top of the results (All / Guests / Services / …)
 *     — only chips with at least one hit are rendered
 *   • Empty-state = Recent Searches (localStorage) + Trending Services /
 *     Trending Products (backend `/search/trending`)
 *   • Placeholder: "Search for Anything [Ctrl + S]"
 *   • Ctrl/⌘+S focuses the input from anywhere; ESC clears + blurs
 *   • Fuzzy matching stays the same — the app just gets the raw
 *     backend response and slices by the selected category chip.
 *
 * The component owns its own input (topbar just renders <GlobalSearchDropdown />).
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.REACT_APP_BACKEND_URL) ||
  '';
const API = `${BACKEND_URL}/api`;

const RECENT_LS_KEY = 'salon_search_recent_v1';
const MAX_RECENT = 6;

// Static navigable app features (also searchable when user types).
const APP_FEATURES = [
  { id: 'home',            title: 'Home',          subtitle: 'Dashboard overview',    route: '/salon/dashboard?tab=home',            keywords: 'home dashboard overview main today kpi' },
  { id: 'queue',           title: 'Queue',         subtitle: 'Live token queue',       route: '/salon/dashboard?tab=queue',           keywords: 'queue tokens live bookings today waiting' },
  { id: 'staff',           title: 'Staff',         subtitle: 'Manage staff & barbers', route: '/salon/dashboard?tab=staff',           keywords: 'staff barber employee stylist team manage' },
  { id: 'services',        title: 'Services',      subtitle: 'Enable & price services',route: '/salon/dashboard?tab=services',        keywords: 'services haircut catalog offerings menu pricing' },
  { id: 'reports',         title: 'Reports',       subtitle: 'Financials + Analytics', route: '/salon/dashboard?tab=reports',         keywords: 'reports finance financials analytics revenue expense insights charts kpi targets' },
  { id: 'customer-master', title: 'Guests',        subtitle: 'Customer database',      route: '/salon/dashboard?tab=customer-master', keywords: 'guests customers clients members contacts crm' },
  { id: 'memberships',     title: 'Memberships',   subtitle: 'Plans & subscriptions',  route: '/salon/dashboard?tab=memberships',     keywords: 'memberships plans subscriptions vip loyalty' },
  { id: 'marketing',       title: 'Marketing',     subtitle: 'Campaigns & WhatsApp',   route: '/salon/dashboard?tab=marketing',       keywords: 'marketing campaigns whatsapp email sms templates dlt' },
  { id: 'inventory',       title: 'Stock',         subtitle: 'Inventory & retail',     route: '/salon/dashboard?tab=inventory',       keywords: 'stock inventory retail products supplies' },
  { id: 'notifications',   title: 'Notifications', subtitle: 'Recent alerts',          route: '/salon/dashboard?tab=notifications',   keywords: 'notifications alerts inbox bell messages' },
  { id: 'marketplace',     title: 'Shop',          subtitle: 'Order supplies',         route: '/salon/marketplace',                   keywords: 'shop store marketplace supplies buy order products' },
  { id: 'salon',           title: 'Settings',      subtitle: 'Salon profile',          route: '/salon/dashboard?tab=salon',           keywords: 'settings salon profile branding config preferences' },
];

// ---- fuzzy helpers (mirror backend) ------------------------------------
function _norm(s) { return (s == null ? '' : String(s)).toLowerCase(); }
function _compact(s) { return _norm(s).replace(/\s+/g, ''); }
function _match(text, qNorm, qTokens, qCompact) {
  if (!text) return false;
  const t = _norm(text);
  if (!qNorm) return false;
  if (t.indexOf(qNorm) !== -1) return true;
  if (qCompact && _compact(t).indexOf(qCompact) !== -1) return true;
  if (qTokens.length && qTokens.every(tok => t.indexOf(tok) !== -1)) return true;
  return false;
}

// ---- category chip metadata --------------------------------------------
const CATEGORIES = [
  { key: 'all',        label: 'All',         types: null },
  { key: 'feature',    label: 'Features',    types: ['feature'] },
  { key: 'customer',   label: 'Guests',      types: ['customer'] },
  { key: 'service',    label: 'Services',    types: ['service'] },
  { key: 'staff',      label: 'Staff',       types: ['staff'] },
  { key: 'membership', label: 'Memberships', types: ['membership'] },
  { key: 'product',    label: 'Products',    types: ['product'] },
];

// tiny icons
const IC = {
  search:  () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>),
  x:       () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>),
  clock:   () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>),
  fire:    () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2s2 3 2 6-2 4-2 4 4 1 4 5a4 4 0 0 1-8 0c0-3 2-5 2-5s-3-3-3-6 5-4 5-4z"/></svg>),
  user:    () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/></svg>),
  scissors:()=> (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>),
  badge:   () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="9" r="6"/><path d="M9 15l-3 6 3-1 2 2 2-6M15 15l3 6-3-1-2 2-2-6"/></svg>),
  shop:    () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h2l3 12h13l3-8H6"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>),
  chip:    () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M9 9h6v6H9z"/></svg>),
};
const ICON_FOR_TYPE = {
  customer: IC.user,
  service:  IC.scissors,
  staff:    IC.user,
  membership: IC.badge,
  product:  IC.shop,
  feature:  IC.chip,
};
const LABEL_FOR_TYPE = {
  customer: 'Guest',
  service:  'Service',
  staff:    'Staff',
  membership: 'Membership',
  product:  'Product',
  feature:  'Feature',
};

// -----------------------------------------------------------------------
export default function GlobalSearchDropdown({ salonId, getAuthHeaders }) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  const [focused, setFocused]         = useState(false);
  const [q, setQ]                     = useState('');
  const [remoteResults, setRemoteResults] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [chip, setChip]               = useState('all');
  const [highlight, setHighlight]     = useState(0);
  const [recent, setRecent]           = useState([]);
  const [trending, setTrending]       = useState({ services: [], products: [] });

  // Restore recent from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_LS_KEY);
      if (raw) setRecent(JSON.parse(raw) || []);
    } catch (_) { /* ignore */ }
  }, []);

  // Fetch trending once, and re-fetch when the salon changes
  useEffect(() => {
    if (!salonId) return undefined;
    let alive = true;
    (async () => {
      try {
        const headers = (typeof getAuthHeaders === 'function') ? (getAuthHeaders() || {}) : {};
        const r = await axios.get(`${API}/salons/${salonId}/search/trending`, { headers });
        if (!alive) return;
        setTrending({
          services: r.data?.trending_services || [],
          products: r.data?.trending_products || [],
        });
      } catch (_) { /* non-fatal */ }
    })();
    return () => { alive = false; };
  }, [salonId, getAuthHeaders]);

  // Ctrl/⌘+S focuses input (matches the Angel One shortcut). We also
  // keep ⌘K working for muscle-memory users.
  useEffect(() => {
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase();
      const withMod = e.metaKey || e.ctrlKey;
      if (withMod && (k === 's' || k === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (k === 'escape' && document.activeElement === inputRef.current) {
        setQ('');
        inputRef.current?.blur();
        setFocused(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onDoc = (e) => {
      if (!focused) return;
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [focused]);

  // Debounced backend search
  useEffect(() => {
    if (!q || q.trim().length < 2) { setRemoteResults([]); setLoading(false); return undefined; }
    if (!salonId) { setRemoteResults([]); return undefined; }
    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const headers = (typeof getAuthHeaders === 'function') ? (getAuthHeaders() || {}) : {};
        const r = await axios.get(
          `${API}/salons/${salonId}/search?q=${encodeURIComponent(q)}`,
          { headers, signal: controller.signal },
        );
        setRemoteResults(r.data?.results || []);
      } catch (e) {
        if (e.name !== 'CanceledError' && e.code !== 'ERR_CANCELED') {
          // eslint-disable-next-line no-console
          console.warn('[globalSearch]', e?.message || e);
        }
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, salonId, getAuthHeaders]);

  // Local app-feature matches (added into the same result list so category
  // chips filter uniformly).
  const featureResults = useMemo(() => {
    const qNorm = _norm(q).trim();
    if (qNorm.length < 2) return [];
    const qTokens = qNorm.split(/\s+/).filter(Boolean);
    const qCompact = qNorm.replace(/\s+/g, '');
    return APP_FEATURES
      .filter(f => _match(`${f.title} ${f.keywords}`, qNorm, qTokens, qCompact))
      .slice(0, 6)
      .map(f => ({ ...f, type: 'feature' }));
  }, [q]);

  const combined = useMemo(
    () => [...featureResults, ...remoteResults],
    [featureResults, remoteResults],
  );

  // Which category chips deserve to show up (only those with hits, plus All)
  const availableChips = useMemo(() => {
    if (!combined.length) return [];
    const present = new Set(combined.map(r => r.type));
    return CATEGORIES.filter(c => c.key === 'all' || c.types.some(t => present.has(t)));
  }, [combined]);

  const filtered = useMemo(() => {
    if (chip === 'all') return combined;
    const cat = CATEGORIES.find(c => c.key === chip);
    if (!cat?.types) return combined;
    return combined.filter(r => cat.types.includes(r.type));
  }, [combined, chip]);

  useEffect(() => { setHighlight(0); }, [q, chip]);

  // If the currently-selected chip disappears (e.g. user narrows query
  // until that type no longer has any hits) → jump back to "all".
  useEffect(() => {
    if (chip !== 'all' && availableChips.length && !availableChips.some(c => c.key === chip)) {
      setChip('all');
    }
  }, [availableChips, chip]);

  const pushRecent = useCallback((item) => {
    if (!item) return;
    const key = `${item.type}:${item.id}`;
    setRecent((prev) => {
      const next = [item, ...prev.filter(r => `${r.type}:${r.id}` !== key)].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_LS_KEY, JSON.stringify(next)); } catch (_) { /* ignore */ }
      return next;
    });
  }, []);

  const go = useCallback((item) => {
    if (!item?.route) return;
    pushRecent({
      type: item.type,
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      route: item.route,
    });
    setFocused(false);
    setQ('');
    setTimeout(() => navigate(item.route), 30);
  }, [navigate, pushRecent]);

  // Keyboard nav
  useEffect(() => {
    if (!focused) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[highlight];
        if (item) go(item);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, filtered, highlight, go]);

  const clearRecent = () => {
    setRecent([]);
    try { localStorage.removeItem(RECENT_LS_KEY); } catch (_) { /* ignore */ }
  };

  // ---- rendering helpers ----------------------------------------------
  const renderRow = (item, idx, extra) => {
    const Icon = ICON_FOR_TYPE[item.type] || IC.chip;
    const active = extra?.active;
    return (
      <button
        key={extra?.keyPrefix ? `${extra.keyPrefix}:${item.type}:${item.id}` : `${item.type}:${item.id}`}
        type="button"
        data-testid={`global-search-hit-${item.type}`}
        onMouseDown={(e) => e.preventDefault()}   // don't blur input
        onMouseEnter={() => extra?.setHighlight && extra.setHighlight(idx)}
        onClick={() => go(item)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '9px 14px', border: 'none',
          background: active ? '#F5F1FF' : 'transparent',
          color: '#211a3d', textAlign: 'left', cursor: 'pointer',
        }}
      >
        <span style={{
          width: 26, height: 26, borderRadius: 8, background: '#F3F0FA',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#6B5FA6', flexShrink: 0,
        }}><Icon /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <span>{item.title}</span>
            <span style={{
              marginLeft: 8, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
              color: '#7f77a6', fontWeight: 700,
              padding: '1px 6px', borderRadius: 4, background: '#EEE9F8',
              verticalAlign: 'middle',
            }}>{LABEL_FOR_TYPE[item.type] || ''}</span>
          </div>
          {item.subtitle && (
            <div style={{
              fontSize: 11, color: '#6B6489', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{item.subtitle}</div>
          )}
        </div>
      </button>
    );
  };

  const hasQuery = q.trim().length >= 2;

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%' }}>
      {/* Input row (visual matches original .searchbox but with a real input) */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', height: 36,
          border: `1px solid ${focused ? '#8073C8' : 'rgba(150,140,200,0.35)'}`,
          borderRadius: 10, background: '#fff',
          boxShadow: focused ? '0 0 0 3px rgba(128, 115, 200, 0.15)' : 'none',
          transition: 'all 0.15s ease',
          width: '100%',
        }}
      >
        <span style={{ color: '#6B5FA6' }}><IC.search /></span>
        <input
          ref={inputRef}
          type="text"
          data-testid="global-search-input"
          value={q}
          onChange={(e) => { setQ(e.target.value); setFocused(true); }}
          onFocus={() => setFocused(true)}
          placeholder="Search for Anything [Ctrl + S]"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13, color: '#211a3d',
          }}
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(''); inputRef.current?.focus(); }}
            title="Clear"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#8880a8', padding: 2, display: 'inline-flex',
            }}
          ><IC.x /></button>
        )}
      </div>

      {focused && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0,
            width: 'min(560px, max(100%, 420px))',
            maxHeight: 'min(70vh, 520px)', overflowY: 'auto',
            background: '#fff', borderRadius: 12,
            border: '1px solid rgba(150,140,200,0.28)',
            boxShadow: '0 24px 48px -18px rgba(15,10,40,0.35), 0 8px 20px -8px rgba(15,10,40,0.18)',
            zIndex: 1000,
          }}
        >
          {hasQuery ? (
            <>
              {/* Category chips */}
              {availableChips.length > 0 && (
                <div style={{
                  display: 'flex', gap: 6, padding: '10px 12px 6px',
                  borderBottom: '1px solid #F0EEF7', flexWrap: 'wrap',
                }}>
                  {availableChips.map((c) => {
                    const on = c.key === chip;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        data-testid={`global-search-chip-${c.key}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setChip(c.key)}
                        style={{
                          padding: '5px 12px', fontSize: 12, fontWeight: 600,
                          borderRadius: 999, cursor: 'pointer',
                          border: `1px solid ${on ? '#8073C8' : 'rgba(150,140,200,0.35)'}`,
                          background: on ? '#EFEAFB' : '#fff',
                          color: on ? '#5847B0' : '#5b527d',
                        }}
                      >{c.label}</button>
                    );
                  })}
                </div>
              )}

              {loading && filtered.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: '#8880a8', fontSize: 12 }}>Searching…</div>
              )}

              {!loading && filtered.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: '#8880a8', fontSize: 12 }}>
                  No matches for &ldquo;<strong>{q}</strong>&rdquo;.
                </div>
              )}

              {filtered.length > 0 && (
                <div style={{ padding: '4px 0 8px' }}>
                  {filtered.map((r, i) => renderRow(r, i, {
                    active: i === highlight,
                    setHighlight,
                  }))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Recent Searches */}
              {recent.length > 0 && (
                <div style={{ paddingTop: 6 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 14px 4px',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 700, color: '#48416b',
                    }}>
                      <IC.clock /> Recent Searches
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={clearRecent}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: '#8880a8', fontSize: 11,
                      }}
                    >Clear</button>
                  </div>
                  {recent.map((r, i) => renderRow(r, i, { keyPrefix: 'r' }))}
                </div>
              )}

              {/* Trending Services */}
              {trending.services.length > 0 && (
                <div style={{ paddingTop: 6 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px 4px', fontSize: 12, fontWeight: 700, color: '#48416b',
                  }}>
                    <IC.fire /> Trending Services
                  </div>
                  {trending.services.map((r, i) => renderRow(r, i, { keyPrefix: 't-svc' }))}
                </div>
              )}

              {/* Trending Products */}
              {trending.products.length > 0 && (
                <div style={{ paddingTop: 6, paddingBottom: 8 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px 4px', fontSize: 12, fontWeight: 700, color: '#48416b',
                  }}>
                    <IC.fire /> Trending Products
                  </div>
                  {trending.products.map((r, i) => renderRow(r, i, { keyPrefix: 't-prd' }))}
                </div>
              )}

              {recent.length === 0 && trending.services.length === 0 && trending.products.length === 0 && (
                <div style={{ padding: 22, textAlign: 'center', color: '#8880a8', fontSize: 12 }}>
                  Start typing to search customers, services, staff, memberships, products or app features.
                </div>
              )}
            </>
          )}

          {/* Footer hint */}
          <div style={{
            display: 'flex', gap: 12, padding: '8px 14px',
            borderTop: '1px solid #F0EEF7', color: '#a89fc6', fontSize: 10,
            background: '#FAFAFF',
          }}>
            <span>↑ ↓ Navigate</span>
            <span>↵ Open</span>
            <span>Ctrl+S Focus</span>
            <span style={{ marginLeft: 'auto' }}>Global search</span>
          </div>
        </div>
      )}
    </div>
  );
}
