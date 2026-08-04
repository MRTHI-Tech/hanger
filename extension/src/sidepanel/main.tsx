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
    <Theme theme={butterTheme}>
      <App />
    </Theme>
  </StrictMode>,
);
