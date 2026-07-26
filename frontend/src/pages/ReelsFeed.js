import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Play, Volume2, VolumeX, Store, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * ReelsFeed — TikTok-style vertical swipeable feed of salon videos.
 * Uses CSS scroll-snap + IntersectionObserver to auto-play the visible video.
 */
export default function ReelsFeed() {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef(null);
  const videoRefs = useRef({});
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API}/public/reels?limit=50`);
        setReels(res.data.reels || []);
      } catch (e) {
        toast.error('Failed to load reels');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Auto-play the video whose card is centered in the viewport
  useEffect(() => {
    if (!containerRef.current || reels.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number(entry.target.getAttribute('data-idx'));
          const vid = videoRefs.current[idx];
          if (!vid) return;
          if (entry.isIntersecting && entry.intersectionRatio > 0.55) {
            setActiveIdx(idx);
            vid.play().catch(() => {});
          } else {
            vid.pause();
            try { vid.currentTime = 0; } catch (e) { /* ignore */ }
          }
        });
      },
      { root: containerRef.current, threshold: [0.55] }
    );
    Object.entries(videoRefs.current).forEach(([, node]) => {
      if (node && node.parentElement) observer.observe(node.parentElement);
    });
    return () => observer.disconnect();
  }, [reels]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      Object.values(videoRefs.current).forEach((v) => {
        if (v) v.muted = next;
      });
      return next;
    });
  }, []);

  const goToSalon = (salonId) => {
    if (salonId) navigate(`/salon/${salonId}`);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-400">Loading reels…</p>
        </div>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white p-6">
        <div className="text-center max-w-sm">
          <div className="p-4 rounded-full bg-white/5 w-fit mx-auto mb-4">
            <Play className="w-8 h-8 text-gold" />
          </div>
          <p className="text-lg font-semibold mb-1">No reels yet</p>
          <p className="text-sm text-zinc-400">
            Salons haven&apos;t uploaded any videos to their gallery yet. Check back soon!
          </p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black overflow-y-scroll snap-y snap-mandatory z-40"
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      <style>{`
        .reels-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {reels.map((r, idx) => (
        <div
          key={r.id}
          data-idx={idx}
          className="reels-scroll relative snap-start h-screen w-full flex items-center justify-center overflow-hidden"
        >
          <video
            ref={(el) => { videoRefs.current[idx] = el; }}
            src={r.url}
            className="absolute inset-0 w-full h-full object-cover"
            loop
            playsInline
            muted={muted}
            preload={idx === activeIdx ? 'auto' : 'metadata'}
          />

          {/* Bottom gradient overlay */}
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />
          {/* Top gradient */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />

          {/* Top back button */}
          <button
            onClick={() => navigate(-1)}
            className="absolute top-4 left-4 z-10 p-2 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Right rail: mute + visit salon */}
          <div className="absolute right-4 bottom-32 z-10 flex flex-col items-center gap-4">
            <button
              onClick={toggleMute}
              className="p-3 rounded-full bg-white/10 backdrop-blur-sm text-white hover:bg-white/20"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button
              onClick={() => goToSalon(r.salon_id)}
              className="p-3 rounded-full bg-gold text-black hover:bg-gold/90 shadow-lg"
              title="Visit salon"
            >
              <Store className="w-5 h-5" />
            </button>
          </div>

          {/* Bottom salon strip */}
          <div className="absolute bottom-24 left-0 right-0 px-4 z-10 text-white">
            <div className="flex items-center gap-3">
              {r.salon_logo ? (
                <img src={r.salon_logo} alt={r.salon_name} className="w-11 h-11 rounded-full border-2 border-white/60 object-cover" />
              ) : (
                <div className="w-11 h-11 rounded-full bg-gold/30 border-2 border-white/60 flex items-center justify-center text-lg font-bold">
                  {(r.salon_name || '?').charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold">{r.salon_name || 'Salon'}</p>
                <button
                  onClick={() => goToSalon(r.salon_id)}
                  className="text-xs text-gold underline decoration-dotted"
                >
                  View salon &amp; book &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
