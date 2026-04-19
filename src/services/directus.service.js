const { DIRECTUS_URL, DIRECTUS_TOKEN } = require('../config/env');
const { logger } = require('../utils/logger');
const { httpError } = require('../utils/httpError');

class DirectusService {
  constructor() {
    this.baseUrl = DIRECTUS_URL ? DIRECTUS_URL.replace(/\/$/, '') : null;
    this.token = DIRECTUS_TOKEN;
  }

  get isConfigured() {
    return !!this.baseUrl;
  }

  async fetch(path, options = {}) {
    if (!this.baseUrl) {
      throw httpError(503, 'Content service is not configured (Directus)', 'SERVICE_UNAVAILABLE');
    }

    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        logger.error(`Directus API error: ${response.status} ${response.statusText}`, { url, data });
        throw httpError(response.status, data.errors?.[0]?.message || 'CMS Error', 'CMS_ERROR');
      }

      return await response.json();
    } catch (error) {
      if (error.statusCode) throw error;
      logger.error('Directus Connection Error', { error: error.message, url });
      throw httpError(503, 'Failed to connect to content service', 'CMS_CONNECTION_FAILED');
    }
  }

  async getItems(collection, query = {}) {
    const params = new URLSearchParams();
    
    if (query.fields) params.append('fields', Array.isArray(query.fields) ? query.fields.join(',') : query.fields);
    if (query.filter) params.append('filter', JSON.stringify(query.filter));
    if (query.sort) params.append('sort', Array.isArray(query.sort) ? query.sort.join(',') : query.sort);
    if (query.limit) params.append('limit', query.limit);
    if (query.offset) params.append('offset', query.offset);
    if (query.meta) params.append('meta', query.meta);
    if (query.deep) params.append('deep', JSON.stringify(query.deep));

    const queryString = params.toString();
    const path = `/items/${collection}${queryString ? `?${queryString}` : ''}`;
    
    const result = await this.fetch(path);
    return result.data;
  }

  async getItemById(collection, id, query = {}) {
    const params = new URLSearchParams();
    if (query.fields) params.append('fields', Array.isArray(query.fields) ? query.fields.join(',') : query.fields);
    
    const queryString = params.toString();
    const path = `/items/${collection}/${id}${queryString ? `?${queryString}` : ''}`;
    
    const result = await this.fetch(path);
    return result.data;
  }

  getFileUrl(fileId) {
    if (!fileId || !this.baseUrl) return null;
    return `${this.baseUrl}/assets/${fileId}`;
  }
}

module.exports = new DirectusService();
