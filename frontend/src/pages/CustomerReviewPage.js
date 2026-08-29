/**
 * CustomerReviewPage — public SalonHub review page.
 *
 * Opened from the "Write a review" button in the WhatsApp invoice template
 * (link = https://salonhub.in/review/{token_id}). Lets the customer rate the
 * completed service (1–5 stars) and leave a comment. Submits to
 * POST /api/reviews/submit, which stores it in db.ratings (source=salonhub) and
 * surfaces it in the salon's Marketing → Reputation section.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

function Stars({ value, onChange, readOnly = false, size = 44 }) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => !readOnly && onChange(n)}
          data-testid={`review-star-${n}`}
          style={{
            background: 'none', border: 'none', cursor: readOnly ? 'default' : 'pointer',
            padding: 0, lineHeight: 1, fontSize: size,
            color: n <= active ? '#F5A623' : '#DCD8E6', transition: 'color .12s, transform .12s',
            transform: !readOnly && n <= active ? 'scale(1.06)' : 'scale(1)',
          }}
          aria-label={`${n} star`}
        >★</button>
      ))}
    </div>
  );
}

export default function CustomerReviewPage() {
  const { tokenId } = useParams();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get(`${API}/reviews/booking/${tokenId}`);
      setInfo(res.data);
      if (res.data?.already_rated && res.data?.existing_rating) {
        setRating(res.data.existing_rating.rating || 0);
        setReview(res.data.existing_rating.review || '');
      }
    } catch (e) {
      setError(e?.response?.status === 404 ? 'This booking could not be found.' : 'Something went wrong loading your visit.');
    } finally { setLoading(false); }
  }, [tokenId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!rating) return;
    setSubmitting(true); setError('');
    try {
      await axios.post(`${API}/reviews/submit`, { token_id: tokenId, rating, review: review.trim() });
      setDone(true);
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Could not submit your review. Please try again.';
      if (String(msg).toLowerCase().includes('already')) { setDone(true); }
      else setError(msg);
    } finally { setSubmitting(false); }
  };

  const wrap = {
    minHeight: '100vh', background: 'linear-gradient(160deg,#F7F2FB 0%,#EFE9FB 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    fontFamily: 'Inter, system-ui, sans-serif',
  };
  const card = {
    width: '100%', maxWidth: 440, background: '#fff', borderRadius: 22,
    boxShadow: '0 18px 50px rgba(90,50,130,.15)', padding: '30px 26px', boxSizing: 'border-box',
  };

  if (loading) {
    return <div style={wrap}><div style={card}><p style={{ textAlign: 'center', color: '#8A8EA0', margin: 0 }}>Loading your visit…</p></div></div>;
  }
  if (error && !info) {
    return <div style={wrap}><div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
      <h2 style={{ margin: '0 0 6px', color: '#2B2B3A' }}>Oops</h2>
      <p style={{ color: '#8A8EA0', margin: 0 }}>{error}</p>
    </div></div>;
  }

  const alreadyRated = info?.already_rated;

  if (done || alreadyRated) {
    return <div style={wrap}><div style={{ ...card, textAlign: 'center' }} data-testid="review-thankyou">
      <div style={{ fontSize: 52, marginBottom: 6 }}>💜</div>
      <h2 style={{ margin: '0 0 6px', color: '#2B2B3A', fontSize: 22 }}>Thank you{done ? '!' : ''}</h2>
      <p style={{ color: '#8A8EA0', margin: '0 0 18px', fontSize: 14 }}>
        {done ? 'Your review has been shared with ' : 'You already reviewed your visit at '}
        <b style={{ color: '#6C4FE0' }}>{info?.salon_name}</b>.
      </p>
      <Stars value={rating} readOnly size={30} />
      {review && <p style={{ marginTop: 14, color: '#4A4A5A', fontStyle: 'italic', fontSize: 14 }}>{`"${review}"`}</p>}
      <p style={{ marginTop: 22, color: '#B7B3C6', fontSize: 12 }}>Powered by SalonHub</p>
    </div></div>;
  }

  return (
    <div style={wrap}>
      <div style={card} data-testid="review-page">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {info?.salon_logo
            ? <img src={info.salon_logo} alt={info?.salon_name} style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover', margin: '0 auto 10px', display: 'block' }} />
            : <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,#7C5CFC,#C6389E)', color: '#fff', fontSize: 28, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>{(info?.salon_name || 'S').charAt(0)}</div>}
          <h1 style={{ margin: '0 0 2px', fontSize: 20, color: '#2B2B3A' }}>{info?.salon_name}</h1>
          <p style={{ margin: 0, color: '#8A8EA0', fontSize: 13.5 }}>
            Hi {info?.customer_name}, how was your visit?
          </p>
        </div>

        {(info?.services?.length > 0 || info?.barber_name) && (
          <div style={{ background: '#F7F5FC', borderRadius: 14, padding: '12px 14px', marginBottom: 20, fontSize: 13 }}>
            {info?.services?.length > 0 && (
              <div style={{ color: '#4A4A5A' }}><b style={{ color: '#6C4FE0' }}>Services:</b> {info.services.join(', ')}</div>
            )}
            {info?.barber_name && (
              <div style={{ color: '#4A4A5A', marginTop: 4 }}><b style={{ color: '#6C4FE0' }}>Served by:</b> {info.barber_name}</div>
            )}
          </div>
        )}

        <p style={{ textAlign: 'center', color: '#8A8EA0', fontSize: 12.5, fontWeight: 700, margin: '0 0 10px', letterSpacing: '.3px' }}>TAP TO RATE</p>
        <Stars value={rating} onChange={setRating} />
        <p style={{ textAlign: 'center', height: 20, margin: '8px 0 16px', color: '#F5A623', fontWeight: 800, fontSize: 14 }}>{STAR_LABELS[rating]}</p>

        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Tell us what you loved (optional)…"
          data-testid="review-comment"
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E4E1F0', borderRadius: 12, padding: '12px 14px', fontSize: 14, resize: 'vertical', outline: 'none', color: '#2B2B3A', fontFamily: 'inherit' }}
        />

        {error && <p style={{ color: '#C33C5F', fontSize: 13, margin: '10px 0 0', textAlign: 'center' }}>{error}</p>}

        <button
          onClick={submit}
          disabled={!rating || submitting}
          data-testid="review-submit"
          style={{
            width: '100%', marginTop: 18, padding: '14px', borderRadius: 13, border: 'none',
            background: !rating ? '#D9D4E8' : 'linear-gradient(135deg,#7C5CFC,#C6389E)',
            color: '#fff', fontSize: 15.5, fontWeight: 800, cursor: !rating ? 'not-allowed' : 'pointer',
            boxShadow: !rating ? 'none' : '0 8px 20px rgba(124,92,252,.35)',
          }}
        >{submitting ? 'Submitting…' : 'Submit review'}</button>

        <p style={{ marginTop: 18, color: '#B7B3C6', fontSize: 12, textAlign: 'center' }}>Powered by SalonHub</p>
      </div>
    </div>
  );
}
