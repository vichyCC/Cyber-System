const fallbackApiBaseUrl = '/api';

export const apiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || fallbackApiBaseUrl,
};

export function buildApiUrl(path: string) {
  const normalizedBaseUrl = apiConfig.baseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}
