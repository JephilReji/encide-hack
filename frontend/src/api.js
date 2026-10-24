// Single shared API client. Endpoint paths and JSON fields follow INTEGRATION_CONTRACT.md exactly.
const BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('NETWORK_ERROR', `Cannot reach the Cliff Guard API at ${BASE}. Check that the backend is running.`, 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* handled below */ }
  if (!res.ok) {
    const err = data && data.error;
    throw new ApiError((err && err.code) || `HTTP_${res.status}`, (err && err.message) || `Request failed with status ${res.status}.`, res.status);
  }
  if (data === null) throw new ApiError('BAD_RESPONSE', 'The API returned a response that could not be read.', res.status);
  return data;
}

export const api = {
  baseUrl: BASE,
  health: () => request('/api/health'),
  getScenarios: () => request('/api/demo/scenarios'),
  getReadings: (scenarioId) => request(`/api/demo/readings?scenarioId=${encodeURIComponent(scenarioId)}`),
  getTariff: () => request('/api/tariff'),
  analyze: (scenarioId, tariffProfileId) => request('/api/analyze', { method: 'POST', body: { scenarioId, tariffProfileId } }),
  optimize: (payload) => request('/api/optimize', { method: 'POST', body: payload }),
  advice: (payload) => request('/api/advice', { method: 'POST', body: payload }),
};
