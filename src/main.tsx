import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { adapterStore } from './app/adapterStore';
import './index.css';

// The adapter connects at boot (§8.0 exit criterion 2: the lamp cluster
// visibly walks connecting → ready because a snapshot is emitted at
// every step of the connect script).
adapterStore.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
