import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Customer lands here after the Cashfree hosted checkout for a booking payment.
// The webhook usually settles the token before the redirect completes, but we
// poll the status endpoint for a few seconds in case it's slightly delayed.
export default function ServicePaymentCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ phase: 'verifying', tokenId: null, error: null });
  const attemptsRef = useRef(0);

  const orderId = params.get('order_id');

  const poll = useCallback(async () => {
    if (!orderId) {
      setState({ phase: 'error', tokenId: null, error: 'Missing order id in callback URL.' });
      return;
    }
    try {
      const res = await axios.get(`${API}/service-payments/status/${encodeURIComponent(orderId)}`);
      if (res.data?.paid) {
        try { localStorage.removeItem('salonhub_pending_service_payment'); } catch (e) { /* ignore */ }
        setState({ phase: 'success', tokenId: res.data.token_id || null, error: null });
        return;
      }
      attemptsRef.current += 1;
      if (attemptsRef.current < 10) {
        setTimeout(poll, 2000);
      } else {
        setState({ phase: 'pending', tokenId: res.data?.token_id || null, error: null });
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setState({ phase: 'error', tokenId: null, error: typeof detail === 'string' ? detail : 'Could not verify payment.' });
    }
  }, [orderId]);

  useEffect(() => { poll(); }, [poll]);

  const goToBooking = () => {
    let salonId = null;
    try {
      const stored = JSON.parse(localStorage.getItem('salonhub_pending_service_payment') || 'null');
      salonId = stored?.salon_id || null;
    } catch (e) { /* ignore */ }
    navigate(salonId ? `/salon/${salonId}/queue` : '/history');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center">
        {state.phase === 'verifying' && (
          <>
            <Loader2 className="w-12 h-12 text-gold animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground">Confirming your payment…</h1>
            <p className="text-sm text-muted-foreground mt-2">This only takes a moment.</p>
          </>
        )}

        {state.phase === 'success' && (
          <>
            <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground">Payment received</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Your booking is confirmed and paid. See you at the salon!
            </p>
            <Button onClick={goToBooking} className="w-full mt-6 bg-gold text-black hover:bg-gold/90">
              View my booking
            </Button>
          </>
        )}

        {state.phase === 'pending' && (
          <>
            <Loader2 className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground">Payment is processing</h1>
            <p className="text-sm text-muted-foreground mt-2">
              We haven't received final confirmation yet. If money was debited, your booking
              will update automatically within a few minutes.
            </p>
            <Button onClick={goToBooking} variant="outline" className="w-full mt-6">
              View my booking
            </Button>
          </>
        )}

        {state.phase === 'error' && (
          <>
            <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground">Couldn't confirm payment</h1>
            <p className="text-sm text-muted-foreground mt-2">{state.error}</p>
            <Button onClick={goToBooking} variant="outline" className="w-full mt-6">
              Back to my booking
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
