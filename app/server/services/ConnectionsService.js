import axios from 'axios';
import { formatUrlWithHost, resolveLoopbackHost } from '../../shared/network.js';

export class ConnectionsService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || formatUrlWithHost('http', resolveLoopbackHost(options.listenHost), 9095);
    this.secret = options.secret || '';
  }

  setListenHost(listenHost) {
    this.baseUrl = formatUrlWithHost('http', resolveLoopbackHost(listenHost), 9095);
    return this.baseUrl;
  }

  async getConnections() {
    const response = await axios.get(`${this.baseUrl}/connections`, {
      timeout: 5000,
      headers: this.secret ? { Authorization: `Bearer ${this.secret}` } : undefined
    });

    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.data?.connections)) return response.data.connections;
    return [];
  }
}
