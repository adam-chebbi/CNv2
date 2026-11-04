import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { Router } from './lib/router';
import { SiteInfoProvider } from './lib/siteInfo';
import { ThemeProvider } from './lib/theme';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SiteInfoProvider>
        <Router>
          <App />
        </Router>
      </SiteInfoProvider>
    </ThemeProvider>
  </StrictMode>
);
