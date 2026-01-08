import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Get or create session ID
function getSessionId() {
  let sessionId = localStorage.getItem('safechat_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('safechat_session_id', sessionId);
  }
  return sessionId;
}

// Add session ID to all requests
api.interceptors.request.use((config) => {
  config.headers['X-Session-Id'] = getSessionId();
  return config;
});

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error
      const message = error.response.data?.message || 'An error occurred';
      error.message = message;
    } else if (error.request) {
      // Request made but no response
      error.message = 'Unable to connect to server';
    }
    return Promise.reject(error);
  }
);

export { api, getSessionId, API_URL };
