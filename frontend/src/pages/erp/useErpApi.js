import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BASE = 'http://localhost:4103/api/erp';

export function useErpList(endpoint, defaultParams = {}) {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);

  const fetch = useCallback(async (pg = page, params = defaultParams) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${BASE}/${endpoint}`, { params: { page: pg, limit: 20, ...params } });
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: pg, totalPages: 1, total: 0 });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetch(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, pagination, loading, error, page, setPage, refresh: () => fetch(page) };
}

export async function erpGet(endpoint, id) {
  const res = await axios.get(`${BASE}/${endpoint}/${id}`);
  return res.data.data;
}

export async function erpCreate(endpoint, body) {
  const res = await axios.post(`${BASE}/${endpoint}`, body);
  return res.data.data;
}

export async function erpUpdate(endpoint, id, body) {
  const res = await axios.put(`${BASE}/${endpoint}/${id}`, body);
  return res.data.data;
}

export async function erpDelete(endpoint, id) {
  const res = await axios.delete(`${BASE}/${endpoint}/${id}`);
  return res.data.data;
}

export async function erpAi(endpoint, verb, body = {}) {
  const res = await axios.post(`${BASE}/${endpoint}/ai/${verb}`, body);
  return res.data;
}
