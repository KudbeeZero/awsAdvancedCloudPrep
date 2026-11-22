import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FirebaseProvider } from './context/AuthContext.tsx';
import { AudioPlayerProvider } from './context/AudioPlayerContext.tsx';
import './index.css';

const SW_UPDATE_THROTTLE_MS = 5 * 60 * 1000;
let lastSwCheckAt = Date.now();

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const maybeCheckForUpdate = () => {
      const now = Date.now();
      if (now - lastSwCheckAt < SW_UPDATE_THROTTLE_MS) return;
      lastSwCheckAt = now;
      void registration.update().catch(() => {
        // Ignore transient offline update check errors
      });
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        maybeCheckForUpdate();
      }
    });
    window.addEventListener('online', maybeCheckForUpdate);
  },
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <FirebaseProvider>
      <AudioPlayerProvider>
        <App />
      </AudioPlayerProvider>
    </FirebaseProvider>
  </ErrorBoundary>
);
