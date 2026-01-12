/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Application Entry Point
 *
 * This is the main entry point for the SafeChat React application.
 * It initializes the React root and renders the application into the DOM.
 *
 * Setup:
 * - Creates React 18 root using createRoot
 * - Wraps app in StrictMode for development checks
 * - Imports global CSS styles
 *
 * StrictMode Benefits:
 * - Identifies components with unsafe lifecycles
 * - Warns about legacy string ref API usage
 * - Warns about deprecated findDOMNode usage
 * - Detects unexpected side effects
 * - Detects legacy context API
 *
 * Note: StrictMode causes components to render twice in development
 * to detect side effects. This is intentional and doesn't affect production.
 *
 * @module index
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';  // Global styles including Tailwind CSS
import App from './App';

// ═══════════════════════════════════════════════════════════════════════════════
// APPLICATION INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create React 18 root and render the application.
 *
 * The root is attached to the #root element defined in public/index.html.
 * StrictMode is enabled to catch potential issues during development.
 */
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
