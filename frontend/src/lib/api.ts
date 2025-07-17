import axios from 'axios';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export const authAPI = {
  async getCurrentUser() {
    const token = localStorage.getItem('access_token');
    const res = await axios.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  },
  async login({ email, password }: { email: string; password: string }) {
    const res = await axios.post(`${API_BASE}/auth/login`, { email, password });
    return res.data;
  },
  async register({ username, email, password, full_name }: { username: string; email: string; password: string; full_name: string }) {
    const res = await axios.post(`${API_BASE}/auth/register`, { username, email, password, full_name });
    return res.data;
  },
  async googleAuth(idToken: string) {
    const res = await axios.post(`${API_BASE}/auth/google`, { id_token: idToken });
    return res.data;
  },
};

export const userAPI = {
  async getUsersForDM() {
    const token = localStorage.getItem('access_token');
    const res = await axios.get(`${API_BASE}/messages/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  },
  async blockUser(userId: string) {
    const token = localStorage.getItem('access_token');
    const res = await axios.post(`${API_BASE}/users/${userId}/block`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  },
  async unblockUser(userId: string) {
    const token = localStorage.getItem('access_token');
    const res = await axios.delete(`${API_BASE}/users/${userId}/block`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  },
  async getBlockedUsers() {
    const token = localStorage.getItem('access_token');
    const res = await axios.get(`${API_BASE}/users/blocks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  },
}; 