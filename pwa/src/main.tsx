import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {butterTheme} from '@hanger/shared/theme';
import {App} from './App';
import {AuthProvider} from './auth';
import {applyServerUrl} from './server';
import {applyToken} from './device';
import './styles.css';

// Before anything renders: a screen that mounts and immediately calls the
// server must already know where the server is, and who it is.
applyServerUrl();
applyToken();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    {/* Light regardless of the OS setting, same as the panel: butter's light
        palette is the signature look, and a shopper is judging colours against
        their own photo — a dark background shifts how the garment reads. */}
    <Theme theme={butterTheme} mode="light">
      <AuthProvider>
        <App />
      </AuthProvider>
    </Theme>
  </StrictMode>,
);

// The service worker is what makes this installable. Registered after load so
// it never competes with the first paint.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // No worker means no Add to Home Screen, and nothing else. Not worth
      // interrupting anyone over.
    });
  });
}
