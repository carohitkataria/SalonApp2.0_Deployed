/**
 * OrdersDrawer — right-side drawer that shows recent shop orders with
 * tracking, cancel, return, replace and "raise concern" actions. Opens from:
 *   1) the right ribbon (globally, without leaving the current page), and
 *   2) the single "Orders" button on the Shop page.
 *
 * A "View all orders" button navigates to /salon/dashboard?tab=shop&view=orders
 * which renders the full Orders history page inline within Shop (keeping the
 * left rail visible).
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { injectZenCss, Icon, rupee } from './opsTheme';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STEP_LABELS = ['Placed', 'Packed', 'Shipped', 'In transit', 'Delivered'];
const STEP_KEYS = ['placed', 'processing', 'shipped', 'in_transit', 'delivered'];

export default function OrdersDrawer({ open, onClose, getAuthHeaders }) {
  useEffect(() => { injectZenCss(); }, []);
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionFor, setActionFor] = useState(null); // { orderId, type }
  const [note, setNote] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/salon/store/orders`, { headers: getAuthHeaders() });
      setOrders(res.data?.orders || res.data || []);
    } catch (_) {
      toast.error('Could not load orders');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open]);

  const recent = useMemo(() => (orders || []).slice(0, 6), [orders]);

  const doCancel = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      await axios.post(`${API}/salon/store/orders/${orderId}/cancel`, {}, { headers: getAuthHeaders() });
      toast.success('Order cancelled');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Cancel failed'); }
  };

  const submitAction = async () => {
    if (!actionFor) return;
    const { orderId, type } = actionFor;
    try {
      await axios.post(
        `${API}/salon/store/orders/${orderId}/${type}`,
        { note, type },
        { headers: getAuthHeaders() }
      );
      toast.success('Request submitted');
    } catch (e) {
      // Fallback to /concern endpoint
      try {
        await axios.post(
          `${API}/salon/store/orders/${orderId}/concern`,
          { type, note },
          { headers: getAuthHeaders() }
        );
        toast.success('Request submitted');
      } catch (_) {
        toast.error(e?.response?.data?.detail || 'Could not submit');
        return;
      }
    }
    setActionFor(null); setNote('');
    load();
  };

  const openViewAll = () => {
    onClose?.();
    navigate('/salon/dashboard?tab=shop&view=orders');
  };

  if (!open) return null;

  return (
    <div className="zen">
      <div className="z-overlay" onClick={onClose} />
      <aside className="z-drawer wide" style={{ zIndex: 2000 }}>
        <div className="z-drawer-h">
          <div className="dico"><Icon name="truck" size={20} /></div>
          <div>
            <div className="eyebrow">Shop</div>
            <h3>Order tracking</h3>
            <p>Latest supplier orders, delivery status &amp; quick actions.</p>
          </div>
          <button className="z-drawer-close" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="z-drawer-body">
          {loading ? (
            <div className="z-empty">Loading orders…</div>
          ) : recent.length === 0 ? (
            <div className="z-empty">
              <Icon name="bag" size={40} /><br />
              No orders yet.<br />
              <div style={{ fontSize: 12.5, color: 'var(--z-muted-2)', marginTop: 4 }}>
                Place an order from the Shop to see it here.
              </div>
            </div>
          ) : recent.map((o) => (
            <OrderMini
              key={o.id}
              order={o}
              onCancel={() => doCancel(o.id)}
              onAction={(type) => { setActionFor({ orderId: o.id, type }); setNote(''); }}
              onOpenDetails={openViewAll}
            />
          ))}

          {actionFor && (
            <>
              <div className="z-overlay" onClick={() => setActionFor(null)} style={{ zIndex: 2100 }} />
              <div
                className="z-card"
                style={{
                  position: 'fixed', inset: 'auto 0 0 0', maxWidth: 460, margin: '0 auto',
                  padding: 16, borderRadius: '16px 16px 0 0', zIndex: 2200, right: 20, bottom: 20, left: 'auto'
                }}
              >
                <div className="z-dsec" style={{ marginTop: 0 }}>
                  {actionFor.type === 'return' ? 'Return items'
                    : actionFor.type === 'replacement' ? 'Request replacement'
                    : 'Raise a concern'}
                </div>
                <div className="z-field">
                  <label>Reason / details</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Tell us what went wrong…"
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="z-btn z-btn--ghost" style={{ flex: 1 }} onClick={() => setActionFor(null)}>
                    Cancel
                  </button>
                  <button className="z-btn z-btn--pri" style={{ flex: 2 }} onClick={submitAction}>
                    <Icon name="save" /> Submit request
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="z-drawer-foot" style={{ display: 'flex', gap: 10 }}>
          <button className="z-btn z-btn--ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>
          <button
            className="z-btn z-btn--pri"
            style={{ flex: 2 }}
            onClick={openViewAll}
            data-testid="orders-drawer-view-all"
          >
            <Icon name="eye" /> View all orders (Details)
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ---------------- Compact order row inside the drawer ---------------- */
function OrderMini({ order, onCancel, onAction, onOpenDetails }) {
  const idx = STEP_KEYS.indexOf(order.status);
  const cancelled = order.status === 'cancelled';
  const delivered = order.status === 'delivered';
  const activeCancelable = ['placed', 'processing'].includes(order.status);
  const shortId = (order.id || '').slice(0, 8).toUpperCase();

  return (
    <div className="z-order-card" style={{ marginBottom: 12 }}>
      <div className="z-order-top" style={{ padding: '12px 14px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Order #{shortId}</div>
          <div style={{ fontSize: 11.5, color: 'var(--z-muted)' }}>
            {(order.items?.length || 0)} items · {new Date(order.created_at || order.date).toLocaleDateString()}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: 'var(--z-primary)' }}>
            {rupee(order.total_amount)}
          </div>
          <span className={`z-pill ${cancelled ? 'z-pill--bad' : delivered ? 'z-pill--ok' : 'z-pill--blue'}`}>
            {(order.status || 'placed').replace('_', ' ')}
          </span>
        </div>
      </div>

      {!cancelled && (
        <div style={{ padding: '4px 14px 0' }}>
          <div className="z-track" style={{ margin: '10px 0 4px' }}>
            {STEP_LABELS.map((lbl, i) => (
              <div key={lbl} className={`z-track-step ${i < idx ? 'done' : ''} ${i === idx ? 'active' : ''}`}>
                <div className="dot"><Icon name={i <= idx ? 'check' : 'clock'} size={11} /></div>
                <div className="lbl" style={{ fontSize: 10.5 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="z-order-foot" style={{ padding: '10px 14px', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {activeCancelable && (
            <button className="z-btn z-btn--danger z-btn--sm" onClick={onCancel}>
              <Icon name="x" /> Cancel
            </button>
          )}
          {delivered && (
            <>
              <button className="z-btn z-btn--soft z-btn--sm" onClick={() => onAction('return')}>
                <Icon name="ret" /> Return
              </button>
              <button className="z-btn z-btn--soft z-btn--sm" onClick={() => onAction('replacement')}>
                <Icon name="restock" /> Replace
              </button>
            </>
          )}
          <button className="z-btn z-btn--ghost z-btn--sm" onClick={() => onAction('concern')}>
            <Icon name="alert" /> Concern
          </button>
        </div>
        <button className="z-btn z-btn--ghost z-btn--sm" onClick={onOpenDetails}>
          Details <Icon name="chevR" />
        </button>
      </div>
    </div>
  );
}
