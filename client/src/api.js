import axios from 'axios';

// Create axios instance with base URL for production
const API_URL = process.env.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: API_URL,
});

export default api;
