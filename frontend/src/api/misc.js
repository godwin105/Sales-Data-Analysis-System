import { api } from './client';

export const dashboardApi = {
  load: () => api.get('/api/dashboard'),
};

export const insightsApi = {
  load: () => api.get('/api/insights'),
};

export const reportsApi = {
  preview: (params) => api.get('/api/reports/preview', { params }),
  // download returns a binary blob — we use fetch separately to handle the file download
  downloadUrl: (params) => {
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const qs = new URLSearchParams(params).toString();
    return `${baseURL}/api/reports/download?${qs}`;
  },
  // For programmatic download with auth header
  download: (params) =>
    api.get('/api/reports/download', { params, responseType: 'blob' }),
};
