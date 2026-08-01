/**
 * Phase 12 — Supplier Order Detail page.
 *
 * Shows the order line items, the buyer's shipping address, the status
 * timeline and exposes the lifecycle action buttons (Confirm / Ship / Deliver)
 * based on current order_status.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Truck, CheckCircle2, Package, Boxes, IndianRupee,
  Phone, MapPin, ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import SupplierLayout from '@/components/supplier/SupplierLayout';
import { useSupplierAuth } from '@/contexts/SupplierAuthContext';
import { StatusPill } from './SupplierOrdersPage';
import { extractErrorMessage } from '@/utils/apiError';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function SupplierOrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { token } = useSupplierAuth();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [shipNote, setShipNote] = useState('');
  const [deliverNote, setDeliverNote] = useState('');
  const [deliverPaymentMode, setDeliverPaymentMode] = useState('');

  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/supplier/orders/${orderId}`, { headers: authHeaders });
      setOrder(r.data);
    } catch (e) {
      toast.error(extractErrorMessage(e, 'Order not found'));
      navigate('/supplier/orders');
    } finally { setLoading(false); }
  }, [authHeaders, orderId, navigate]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleConfirm = async () => {
    setActing(true);
    try {
      await axios.post(`${API}/supplier/orders/${orderId}/confirm`, {}, { headers: authHeaders });
      toast.success('Order acknowledged');
      fetchOrder();
    } catch (e) {
      toast.error(extractErrorMessage(e, 'Failed to acknowledge'));
    } finally { setActing(false); }
  };

  const handleShip = async () => {
    setActing(true);
    try {
      await axios.post(`${API}/supplier/orders/${orderId}/ship`, {
        tracking_number: trackingNumber || undefined,
        carrier: carrier || undefined,
        note: shipNote || undefined,
      }, { headers: authHeaders });
      toast.success('Order marked as shipped');
      setShipModalOpen(false);
      setTrackingNumber(''); setCarrier(''); setShipNote('');
      fetchOrder();
    } catch (e) {
      toast.error(extractErrorMessage(e, 'Failed to ship'));
    } finally { setActing(false); }
  };

  const handleDeliver = async () => {
    setActing(true);
    try {
      await axios.post(`${API}/supplier/orders/${orderId}/deliver`, {
        note: deliverNote || undefined,
        payment_mode: deliverPaymentMode || undefined,
      }, { headers: authHeaders });
      toast.success('Order marked as delivered');
      setDeliverNote(''); setDeliverPaymentMode('');
      fetchOrder();
    } catch (e) {
      toast.error(extractErrorMessage(e, 'Failed to deliver'));
    } finally { setActing(false); }
  };

  if (loading || !order) {
    return (
      <SupplierLayout>
        <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin inline mr-2" /> Loading…</div>
      </SupplierLayout>
    );
  }

  const canShip = order.order_status === 'confirmed';
  const canDeliver = ['shipped', 'confirmed'].includes(order.order_status);

  return (
    <SupplierLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/supplier/orders')} data-testid="supplier-order-back-btn">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <div className="text-lg font-extrabold">Order #{order.id.slice(0, 8)}</div>
            <div className="text-xs text-muted-foreground">Placed {new Date(order.created_at).toLocaleString()}</div>
          </div>
          <div className="ml-auto"><StatusPill status={order.order_status} /></div>
        </div>

        <div className="grid grid-cols-12 gap-5">
          <section className="col-span-12 lg:col-span-8 space-y-4">
            <div className="border border-border rounded-xl p-4 bg-card">
              <div className="text-sm font-bold mb-3 flex items-center gap-2"><Boxes className="w-4 h-4" /> Items</div>
              <div className="divide-y divide-border">
                {(order.items || []).map(it => (
                  <div key={it.product_id} className="py-3 flex items-start gap-3" data-testid={`supplier-order-item-${it.product_id}`}>
                    <div className="w-12 h-12 bg-muted rounded overflow-hidden flex items-center justify-center flex-shrink-0">
                      {it.image_url ? <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" /> : <Boxes className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{it.brand}</div>
                      <div className="text-sm font-semibold">{it.name}</div>
                      <div className="text-xs text-muted-foreground">Qty {it.qty} × {fmt(it.selling_price)}</div>
                    </div>
                    <div className="text-sm font-bold">{fmt(it.line_total)}</div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-3 mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(order.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span>{fmt(order.gst_amount)}</span></div>
                <div className="flex justify-between font-bold pt-1 border-t border-border">
                  <span>Total</span>
                  <span className="flex items-center"><IndianRupee className="w-4 h-4" />{Number(order.total_amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div className="border border-border rounded-xl p-4 bg-card">
              <div className="text-sm font-bold mb-3 flex items-center gap-2"><ClipboardCheck className="w-4 h-4" /> Status timeline</div>
              <div className="space-y-3">
                {(order.status_history || []).slice().reverse().map((h, idx) => (
                  <div key={`${h.timestamp || ''}-${idx}`} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-xs font-bold capitalize">{(h.status || '').replace('_', ' ')}</div>
                      <div className="text-xs text-muted-foreground">{h.note}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(h.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Concerns raised by the salon (Issue 5) */}
            {Array.isArray(order.concerns) && order.concerns.length > 0 && (
              <div className="border border-amber-500/40 rounded-xl p-4 bg-amber-500/5">
                <div className="text-sm font-bold mb-3 flex items-center gap-2 text-amber-600">
                  <ClipboardCheck className="w-4 h-4" /> Concerns raised ({order.concerns.length})
                </div>
                <div className="space-y-3">
                  {order.concerns.map((c) => (
                    <div key={c.id} className="border border-border rounded-lg p-3 bg-card">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase">{c.type}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">
                          {c.status || 'open'}
                        </span>
                      </div>
                      <div className="text-sm mt-1 text-foreground/90">{c.note}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="col-span-12 lg:col-span-4 space-y-4">
            <div className="border border-border rounded-xl p-4 bg-card">
              <div className="text-sm font-bold mb-2">Buyer</div>
              <div className="text-xs space-y-0.5">
                <div className="font-semibold">{order.salon_name || '—'}</div>
                <div className="text-muted-foreground">{order.shipping_address?.name}</div>
                <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {order.shipping_address?.phone}</div>
                <div className="flex items-start gap-1">
                  <MapPin className="w-3 h-3 mt-0.5" />
                  <div>
                    {order.shipping_address?.line1}{order.shipping_address?.line2 ? `, ${order.shipping_address.line2}` : ''}<br />
                    {order.shipping_address?.city}, {order.shipping_address?.state} {order.shipping_address?.pincode}
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-border rounded-xl p-4 bg-card">
              <div className="text-sm font-bold mb-2">Payment</div>
              <div className="text-xs space-y-1">
                <div>Mode: <span className="font-bold uppercase">{order.payment_mode}</span></div>
                <div>Status: <span className="font-bold uppercase">{order.payment_status}</span></div>
                {order.cashfree_order_id && <div className="text-muted-foreground">Ref: {order.cashfree_order_id}</div>}
              </div>
            </div>

            <div className="space-y-2">
              {canShip && (
                <Button className="w-full" onClick={() => setShipModalOpen(true)} disabled={acting} data-testid="supplier-action-ship">
                  <Truck className="w-4 h-4 mr-2" /> Mark as shipped
                </Button>
              )}
              {canDeliver && (
                <div className="space-y-2 border border-border rounded-xl p-3">
                  <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Payment mode collected</Label>
                  <select
                    value={deliverPaymentMode}
                    onChange={(e) => setDeliverPaymentMode(e.target.value)}
                    className="w-full text-sm bg-card border border-border rounded-md px-3 py-2"
                    data-testid="supplier-deliver-payment-mode"
                  >
                    <option value="">— unchanged ({order.payment_mode || '—'}) —</option>
                    {['cash', 'upi', 'card', 'bank_transfer', 'cod', 'cashfree', 'other'].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Delivery note (optional)</Label>
                  <Textarea value={deliverNote} onChange={(e) => setDeliverNote(e.target.value)} placeholder="Handed over to manager…" data-testid="supplier-deliver-note" />
                  <Button variant="default" className="w-full" onClick={handleDeliver} disabled={acting} data-testid="supplier-action-deliver">
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as delivered
                  </Button>
                </div>
              )}
              {order.order_status === 'confirmed' && (
                <Button variant="outline" className="w-full" onClick={handleConfirm} disabled={acting} data-testid="supplier-action-confirm">
                  Acknowledge order
                </Button>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Ship modal */}
      {shipModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShipModalOpen(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold">Mark as shipped</div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Tracking number</Label>
              <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="(optional)" data-testid="supplier-ship-tracking" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Carrier</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. Bluedart, DTDC" data-testid="supplier-ship-carrier" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Internal note (optional)</Label>
              <Textarea value={shipNote} onChange={(e) => setShipNote(e.target.value)} data-testid="supplier-ship-note" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShipModalOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleShip} disabled={acting} data-testid="supplier-ship-submit">
                {acting ? 'Saving…' : 'Confirm shipment'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SupplierLayout>
  );
}
