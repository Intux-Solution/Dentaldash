// src/hooks/useTurnos.js
// Fetches calendar events from n8n and normalizes them

import { useState, useCallback, useEffect } from 'react';
import { URL_CALENDAR_EVENTS } from '../config/n8n';
import { apiFetch } from '../utils/api';
import { normalizeTurno } from '../utils/appointments';

export function useTurnos(fromDate = null, toDate = null) {
  const [turnos, setTurnos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTurnos = useCallback(async (from = null, to = null) => {
    setLoading(true);
    setError('');

    try {
      // Build from/to ISO range
      let fromISO, toISO;
      if (from && to) {
        const parseYMD = (s) => {
          if (!s) return null;
          const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          return new Date(s);
        };

        let startDate = parseYMD(from);
        let endDate = parseYMD(to);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        if (startDate > endDate) {
          const tmp = startDate;
          startDate = endDate;
          endDate = tmp;
        }
        fromISO = startDate.toISOString();
        toISO = endDate.toISOString();
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        nextWeek.setHours(23, 59, 59, 999);
        fromISO = today.toISOString();
        toISO = nextWeek.toISOString();
      }

      const timeZone = 'America/Argentina/Buenos_Aires';
      const url = `${URL_CALENDAR_EVENTS}?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}&timeZone=${encodeURIComponent(timeZone)}`;

      const response = await apiFetch(url);
      if (!response.ok) {
        // Algunos backends devuelven 400 cuando no hay eventos
        if (response.status === 400) {
          setTurnos([]);
          setError('');
          return;
        }
        let detail = '';
        try {
          const errJson = await response.json();
          detail = errJson?.message || '';
        } catch {}
        throw new Error(`Error ${response.status}: ${detail || response.statusText}`);
      }

      const data = await response.json();
      const events = data.events || [];
      const normalized = Array.isArray(events) ? events.map(normalizeTurno) : [];
      const visible = normalized.filter(ev => (ev?.status || '').toLowerCase() !== 'cancelled' && (ev?.status || '').toLowerCase() !== 'canceled');
      setTurnos(visible);
    } catch (err) {
      setError('No se pudieron cargar los turnos: ' + err.message);
      setTurnos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTurnos = useCallback((newFromDate = null, newToDate = null) => {
    const from = newFromDate || fromDate;
    const to = newToDate || toDate;
    fetchTurnos(from, to);
  }, [fetchTurnos, fromDate, toDate]);

  useEffect(() => {
    fetchTurnos(fromDate, toDate);
  }, [fetchTurnos, fromDate, toDate]);

  // Escuchar eventos globales para refrescar o eliminar localmente
  useEffect(() => {
    const handleRefresh = () => fetchTurnos(fromDate, toDate);
    const handleDeleted = (e) => {
      const id = e && e.detail && e.detail.id;
      if (!id) return;
      setTurnos((prev) => prev.filter((ev) => (ev?.id || ev?.eventId || ev?._id) !== id));
    };
    window.addEventListener('turnos:refresh', handleRefresh);
    window.addEventListener('turnos:deleted', handleDeleted);
    return () => {
      window.removeEventListener('turnos:refresh', handleRefresh);
      window.removeEventListener('turnos:deleted', handleDeleted);
    };
  }, [fetchTurnos, fromDate, toDate]);

  // Refrescar automáticamente después de cualquier webhook mutador relacionado a turnos/calendario
  useEffect(() => {
    const handleWebhookMutation = (e) => {
      const method = String(e?.detail?.method || '').toUpperCase();
      if (method === 'GET') return;
      const url = String(e?.detail?.url || '');
      const touchesTurnos = !url || /appointment|turno|calendar/i.test(url);
      if (!touchesTurnos) return;
      fetchTurnos(fromDate, toDate);
    };

    window.addEventListener('webhook:mutated', handleWebhookMutation);
    return () => window.removeEventListener('webhook:mutated', handleWebhookMutation);
  }, [fetchTurnos, fromDate, toDate]);

  return { turnos, loading, error, refreshTurnos, fetchTurnos };
}
