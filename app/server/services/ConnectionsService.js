import axios from 'axios';

export class ConnectionsService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://127.0.0.1:9095';
    this.secret = options.secret || '';
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
