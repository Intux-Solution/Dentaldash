// src/utils/api.js
import { getAuthToken } from './auth';

export const apiFetch = async (url, options = {}) => {
  const apiKey = process.env.REACT_APP_API_KEY;
  const headers = { ...(options.headers || {}) };
  const method = (options.method || 'GET').toUpperCase();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  // Default content-type only for non-GET JSON requests where not provided
  if (!isFormData && method !== 'GET' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Attach JWT if present
  const token = getAuthToken();
  if (token && token !== 'temp_token') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Attach API Key if configured
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(url, { ...options, headers });

  // Avisar globalmente cuando un webhook muta datos (POST/PUT/PATCH/DELETE)
  const isMutation = response.ok && method !== 'GET';
  const looksLikeWebhook = typeof url === 'string' && url.includes('/webhook/');
  if (typeof window !== 'undefined' && isMutation && looksLikeWebhook) {
    try {
      window.dispatchEvent(
        new CustomEvent('webhook:mutated', {
          detail: { url, method, status: response.status }
        })
      );
    } catch {
      // Silenciar en entornos donde window no esté disponible
    }
  }

  return response;
};

export default { apiFetch };

