import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';
import { ensureDinReference } from '@/lib/dinReference';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

console.log('Starting Narcotics Ledger app...');

// Warm the CDSA/DPD DIN reference so every quantity can be converted to total units.
void ensureDinReference();

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('Root element not found!');
    document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: Root element not found</div>';
  } else {
    console.log('Root element found, mounting React app...');
    createRoot(rootElement).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </StrictMode>
    );
  }
} catch (error) {
  console.error('Error mounting React app:', error);
  document.body.innerHTML = `<div style="padding: 20px; color: red;">Error: ${error}</div>`;
}
