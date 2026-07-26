import { Link, useLocation } from 'react-router-dom';
import { Home, History, Play } from 'lucide-react';

export default function BottomNav() {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const items = [
    { to: '/', icon: Home, label: 'Home', testId: 'nav-home' },
    { to: '/reels', icon: Play, label: 'Reels', testId: 'nav-reels' },
    { to: '/history', icon: History, label: 'History', testId: 'nav-history' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-charcoal border-t border-white/10 z-50">
      <div className="max-w-7xl mx-auto flex">
        {items.map((it) => {
          const Icon = it.icon;
          const active = isActive(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              data-testid={it.testId}
              className={`flex-1 flex flex-col items-center justify-center py-4 transition-colors ${
                active ? 'text-gold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Icon className="w-6 h-6 mb-1" />
              <span className="text-xs uppercase tracking-wider font-bold">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
