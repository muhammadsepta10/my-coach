import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../data/db';
import { History } from './History';
import { Home } from './Home';
import { Library } from './Library';
import { Onboarding } from './Onboarding';
import { SettingsPage } from './SettingsPage';
import { Workout } from './Workout';

type Tab = 'home' | 'history' | 'library' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Hari Ini', icon: '🏋️' },
  { id: 'history', label: 'Progres', icon: '📈' },
  { id: 'library', label: 'Gerakan', icon: '📖' },
  { id: 'settings', label: 'Pengaturan', icon: '⚙️' },
];

export function App() {
  const settings = useLiveQuery(() => db.settings.get('settings'), [], null);
  const active = useLiveQuery(() => db.sessions.where('status').equals('in_progress').first(), [], null);
  const [tab, setTab] = useState<Tab>('home');

  if (settings === null || active === null) {
    return <div className="min-h-dvh grid place-items-center text-slate-500">Memuat…</div>;
  }
  if (!settings?.onboarded) return <Onboarding />;
  if (active) return <Workout session={active} settings={settings} />;

  return (
    <div className="min-h-dvh flex flex-col max-w-lg mx-auto">
      <main className="flex-1 px-4 pt-4 pb-24">
        {tab === 'home' && <Home settings={settings} />}
        {tab === 'history' && <History />}
        {tab === 'library' && <Library settings={settings} />}
        {tab === 'settings' && <SettingsPage settings={settings} />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 bg-slate-950/95 backdrop-blur border-t border-slate-800 safe-bottom">
        <div className="max-w-lg mx-auto grid grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-2 flex flex-col items-center text-xs ${tab === t.id ? 'text-sky-400' : 'text-slate-400'}`}
            >
              <span className="text-xl" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
