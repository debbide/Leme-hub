import axios from 'axios';

import { formatUrlWithHost, resolveLoopbackHost } from '../../shared/network.js';

export class ClashApiService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || formatUrlWithHost('http', resolveLoopbackHost(options.listenHost), 9095);
    this.secret = options.secret || '';
  }

  setListenHost(listenHost) {
    this.baseUrl = formatUrlWithHost('http', resolveLoopbackHost(listenHost), 9095);
    return this.baseUrl;
  }

  getHeaders() {
    return this.secret ? { Authorization: `Bearer ${this.secret}` } : undefined;
  }

  async getProxies() {
    const response = await axios.get(`${this.baseUrl}/proxies`, {
      timeout: 5000,
      headers: this.getHeaders()
    });
    return response.data || {};
  }

  async setSelector(groupTag, outboundTag) {
    const response = await axios.put(`${this.baseUrl}/proxies/${encodeURIComponent(groupTag)}`, {
      name: outboundTag
    }, {
      timeout: 5000,
      headers: this.getHeaders()
    });
    return response.data || {};
  }

  async waitUntilReady(timeoutMs = 5000) {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < timeoutMs) {
      try {
        await this.getProxies();
        return true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    throw new Error('Timed out waiting for clash api to become ready');
  }
}
