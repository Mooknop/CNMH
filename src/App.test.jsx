import { render } from '@testing-library/react';
import App from './App';

// Basic smoke test - verify App renders without crashing
test('renders App component without crashing', () => {
  expect(() => render(<App />)).not.toThrow();
});
