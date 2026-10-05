import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';

const AnimPreview = lazy(() => import('./ui/AnimPreview').then((m) => ({ default: m.AnimPreview })));
const preview = import.meta.env.DEV && location.search.includes('anim-preview');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {preview ? (
      <Suspense>
        <AnimPreview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
