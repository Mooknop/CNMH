import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Get the root element
const rootElement = document.getElementById('root');

// Make sure the root element exists
if (!rootElement) {
  console.error('Root element not found in the DOM!');
} else {
  // Create a React root
  const root = createRoot(rootElement);
  
  // Render your app
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

