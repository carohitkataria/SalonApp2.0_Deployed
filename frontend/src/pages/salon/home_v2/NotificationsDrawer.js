/**
 * NotificationsDrawer.js — right-side drawer opened from the ribbon Bell.
 *
 * Shows the most recent salon notifications with:
 *  • "Mark all as read" (top-right)
 *  • "View all" → routes to /salon/dashboard?tab=notifications
 *  • Each row is clickable → shows details inside the drawer (in-place expand)
 *
 * Uses the existing /api/notifications endpoints:
 *   GET  /api/notifications/salon/{salon_id}
 *   PUT  /api/notifications/{id}/read
 *   PUT  /api/notifications/salon/{salon_id}/read-all
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.REACT_APP_BACKEND_URL) ||
  '';
const API = `${BACKEND_URL}/api`;

const IC = {
  bell:   () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>),
  x:      () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>),
  check:  () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>),
  chev:   () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>),
};

// Type-specific route resolver (mirrors SalonNotificationsPanel.getTargetTab)
function targetRouteFor(type) {
  switch (type) {
    case 'new_booking':
    case 'booking_cancelled':
    case 'booking_completed':
    case 'booking_rescheduled':
    case 'token_called':
      return '/salon/dashboard?tab=queue';
    case 'membership_pending':
    case 'membership_purchase':
    case 'membership_confirmed':
      return '/salon/dashboard?tab=memberships';
    case 'review_added':
      return '/salon/dashboard?tab=analytics';
    case 'payment_confirmed':
      return '/salon/dashboard?tab=financials';
    default:
      return null;
  }
}

function relativeTime(iso) {
  if (!iso) return '';
  try {
    const t = new Date(iso).getTime();
    const s = Math.max(1, Math.round((Date.now() - t) / 1000));
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400)return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  } catch (_) { return ''; }
}

const TYPE_LABEL = {
  new_booking: 'New booking',
  booking_cancelled: 'Booking cancelled',
  booking_completed: 'Booking completed',
  booking_rescheduled: 'Booking rescheduled',
  token_called: 'Token called',
  membership_pending: 'Membership pending',
  membership_purchase: 'Membership purchase',
  membership_confirmed: 'Membership confirmed',
  payment_confirmed: 'Payment confirmed',
  review_added: 'New review',
};

export default function NotificationsDrawer({ open, onClose, salonId, onCountUpdate }) {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const fetchNotifs = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API}/notifications/salon/${salonId}`);
      const list = r.data?.notifications || [];
      setNotifs(list);
      const unread = list.filter(n => !n.is_read).length;
      if (typeof onCountUpdate === 'function') onCountUpdate(unread);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[notifications] fetch failed', e?.message || e);
    } finally { setLoading(false); }
  }, [salonId, onCountUpdate]);

  useEffect(() => { if (open) fetchNotifs(); }, [open, fetchNotifs]);

  // ESC closes the drawer
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const markAsRead = async (id) => {
    try {
      await axios.put(`${API}/notifications/${id}/read`);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      const remaining = notifs.filter(n => n.id !== id && !n.is_read).length;
      if (typeof onCountUpdate === 'function') onCountUpdate(remaining);
    } catch (e) { /* non-fatal */ }
  };

  const markAllRead = async () => {
    try {
      await axios.put(`${API}/notifications/salon/${salonId}/read-all`);
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
      if (typeof onCountUpdate === 'function') onCountUpdate(0);
    } catch (e) { /* non-fatal */ }
  };

  const unreadCount = useMemo(() => notifs.filter(n => !n.is_read).length, [notifs]);

  const openDetails = (n) => {
    setExpandedId(prev => (prev === n.id ? null : n.id));
    if (!n.is_read) markAsRead(n.id);
  };

  const goToTarget = (n) => {
    const route = targetRouteFor(n.type);
    if (!route) return;
    if (!n.is_read) markAsRead(n.id);
    onClose?.();
    setTimeout(() => navigate(route), 30);
  };

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1200,
          background: 'rgba(15,12,30,0.28)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      />

      <aside
        role="dialog"
        aria-label="Notifications"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(420px, 92vw)', zIndex: 1210,
          background: '#fff',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(.22,.61,.36,1)',
          boxShadow: open ? '-24px 0 60px rgba(15,10,40,0.20)' : 'none',
          display: 'flex', flexDirection: 'column',
          color: '#211a3d',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', borderBottom: '1px solid #F0EEF7',
        }}>
          <span style={{ color: '#6B5FA6' }}><IC.bell /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>Notifications</div>
            <div style={{ fontSize: 11, color: '#8880a8' }}>
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </div>
          </div>
          <button
            type="button"
            data-testid="notif-drawer-mark-all-read"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            style={{
              fontSize: 11, fontWeight: 700, padding: '6px 10px',
              borderRadius: 8, border: 'none', cursor: unreadCount ? 'pointer' : 'not-allowed',
              background: unreadCount ? '#EFEAFB' : '#F3F0FA',
              color: unreadCount ? '#5847B0' : '#a89fc6',
            }}
          >Mark all as read</button>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#8880a8', padding: 4,
            }}
          ><IC.x /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {loading && notifs.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#8880a8', fontSize: 13 }}>Loading…</div>
          )}
          {!loading && notifs.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#8880a8' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>No notifications yet</div>
              <div style={{ fontSize: 12 }}>You&rsquo;re all caught up.</div>
            </div>
          )}
          {notifs.map((n) => {
            const isOpen = expandedId === n.id;
            const label = TYPE_LABEL[n.type] || (n.type || 'Notification').replace(/_/g, ' ');
            return (
              <div
                key={n.id}
                data-testid="notif-drawer-item"
                style={{
                  borderBottom: '1px solid #F5F3FA',
                  background: n.is_read ? '#fff' : '#FBF9FF',
                }}
              >
                <button
                  type="button"
                  onClick={() => openDetails(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    width: '100%', padding: '11px 16px',
                    background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <span style={{
                    width: 8, height: 8, marginTop: 6, borderRadius: '50%',
                    background: n.is_read ? '#D6D0EA' : '#6C4FE0', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', gap: 8, alignItems: 'baseline',
                      fontSize: 13, fontWeight: 700, color: '#2b2450',
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.title || label}
                      </span>
                      <span style={{
                        fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase',
                        color: '#7f77a6', fontWeight: 700,
                        padding: '1px 6px', borderRadius: 4, background: '#EEE9F8',
                        flexShrink: 0,
                      }}>{label}</span>
                    </div>
                    {n.message && (
                      <div style={{
                        fontSize: 12, color: '#5b527d', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: isOpen ? 'unset' : 2, WebkitBoxOrient: 'vertical',
                      }}>{n.message}</div>
                    )}
                    <div style={{
                      display: 'flex', gap: 10, marginTop: 4,
                      fontSize: 11, color: '#8880a8',
                    }}>
                      <span>{relativeTime(n.created_at)}</span>
                      {n.is_read && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#25b070' }}>
                          <IC.check /> Read
                        </span>
                      )}
                    </div>

                    {/* Expanded details */}
                    {isOpen && (
                      <div style={{
                        marginTop: 10, padding: '10px 12px',
                        background: '#F5F1FF', borderRadius: 10, fontSize: 12,
                        color: '#3b346a',
                      }}>
                        {n.data && Object.keys(n.data).length > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4 }}>
                            {Object.entries(n.data).slice(0, 8).map(([k, v]) => (
                              <React.Fragment key={k}>
                                <span style={{ color: '#8880a8', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                                <span style={{ fontWeight: 600, wordBreak: 'break-word' }}>{String(v)}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: '#8880a8' }}>No extra details.</div>
                        )}
                        {targetRouteFor(n.type) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); goToTarget(n); }}
                            style={{
                              marginTop: 9, padding: '6px 10px', fontSize: 11, fontWeight: 700,
                              background: '#6C4FE0', color: '#fff', border: 'none',
                              borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                            }}
                          >Open related page <IC.chev /></button>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer — View all */}
        <div style={{
          borderTop: '1px solid #F0EEF7', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10, background: '#FAFAFF',
        }}>
          <div style={{ fontSize: 11, color: '#8880a8', flex: 1 }}>
            Showing {notifs.length} most recent
          </div>
          <button
            type="button"
            data-testid="notif-drawer-view-all"
            onClick={() => { onClose?.(); setTimeout(() => navigate('/salon/dashboard?tab=notifications'), 30); }}
            style={{
              fontSize: 12, fontWeight: 700, padding: '7px 14px',
              background: '#6C4FE0', color: '#fff', border: 'none',
              borderRadius: 9, cursor: 'pointer',
            }}
          >View all</button>
        </div>
      </aside>
    </>
  );
}
