import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {butterTheme} from '../themes/butter/butterTheme';
import {App} from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    {/* Light regardless of the OS setting: butter's light palette is the
        signature look, and a shopper is judging colours against their own
        photo — a dark panel shifts how the garment reads. */}
    <Theme theme={butterTheme} mode="light">
      <App />
    </Theme>
  </StrictMode>,
);
