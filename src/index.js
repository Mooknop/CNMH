import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
reportWebVitals();