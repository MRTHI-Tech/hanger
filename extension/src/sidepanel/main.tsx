import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {butterTheme} from '@hanger/shared/theme';
import {applyStoredAccent} from '@hanger/shared/theme/accents';
import {App} from './App';
import {AuthProvider, RequireSignIn} from './auth';
import './styles.css';

// Before the first paint: an accent applied after mount is a visible flash of
// blue on every load for anyone who chose otherwise.
applyStoredAccent();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    {/* Light regardless of the OS setting: butter's light palette is the
        signature look, and a shopper is judging colours against their own
        photo — a dark panel shifts how the garment reads. */}
    <Theme theme={butterTheme} mode="light">
      <AuthProvider>
        <RequireSignIn>
          <App />
        </RequireSignIn>
      </AuthProvider>
    </Theme>
  </StrictMode>,
);
