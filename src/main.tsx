import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import './CSS/main.css';
import { captureVerificationLink } from './lib/verification-link';
import { capturePasswordSetup } from './lib/google';

captureVerificationLink();
capturePasswordSetup();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

