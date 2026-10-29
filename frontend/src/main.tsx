import { StrictMode } from 'react';
import { Buffer } from 'buffer';

// NEAR dependencies use Node Buffer APIs in the browser bundle.
const browserGlobal = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (!browserGlobal.Buffer) browserGlobal.Buffer = Buffer;
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
