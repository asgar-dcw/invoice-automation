import type { ClientRow, PaymentMethod, RunHistoryRecord, EmailConfigRecord } from '../types/invoice';

const SPREADSHEET_ID = '1GFZbTMRpLQngThlif3BeCtIMubBEZiS-ZDXepm_EtZ4';
const SHEET_NAME = 'read';
const API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY;

// Caching structure
const CACHE: Record<string, { data: unknown; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getSheetsBaseUrl(): string {
  return import.meta.env.DEV ? '/sheets' : 'https://sheets.googleapis.com';
}

export function clearSheetsCache(key: 'clients' | 'runHistory' | 'emailConfigs') {
  delete CACHE[key];
}

async function getCachedData<T>(key: string, forceRefresh: boolean, fetchFn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = CACHE[key];
  if (!forceRefresh && cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.data as T;
  }
  const data = await fetchFn();
  CACHE[key] = { data, timestamp: now };
  return data;
}

export async function fetchClients(forceRefresh = false): Promise<ClientRow[]> {
  return getCachedData('clients', forceRefresh, async () => {
    const cacheBuster = forceRefresh ? `&_cb=${Date.now()}` : '';
    const url = `${getSheetsBaseUrl()}/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}?key=${API_KEY}${cacheBuster}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch client configs: ${res.status} ${res.statusText}`);
    }

    const data: { values: string[][] } = await res.json();
    const rows = data.values;
    if (!rows || rows.length < 2) return [];

    const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const nameIdx = headers.indexOf('client_name');
    const emailIdx = headers.indexOf('ar_email');
    const paymentIdx = headers.indexOf('payment_method');
    const attachmentIdx = headers.indexOf('manual_attachment_required');

    return rows.slice(1).map((row) => {
      const rawMethod = (row[paymentIdx] ?? 'bank').trim().toLowerCase();
      let payment_method: PaymentMethod = 'bank';
      if (rawMethod === 'credit card' || rawMethod === 'creditcard' || rawMethod === 'cc' || rawMethod === 'credit_card') {
        payment_method = 'credit_card';
      } else if (rawMethod === 'both') {
        payment_method = 'both';
      }

      const manual_attachment = (row[attachmentIdx] ?? 'no').trim().toLowerCase();

      return {
        client_name: row[nameIdx] ?? '',
        ar_email: row[emailIdx] ?? '',
        payment_method,
        manual_attachment,
        selected: true,
      };
    });
  });
}

export async function fetchRunHistory(forceRefresh = false): Promise<RunHistoryRecord[]> {
  return getCachedData('runHistory', forceRefresh, async () => {
    const cacheBuster = forceRefresh ? `&_cb=${Date.now()}` : '';
    const url = `${getSheetsBaseUrl()}/v4/spreadsheets/${SPREADSHEET_ID}/values/runs?key=${API_KEY}${cacheBuster}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch run history: ${res.status} ${res.statusText}`);
    }

    const data: { values?: string[][] } = await res.json();
    const rows = data.values;
    if (!rows || rows.length < 2) return [];

    const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const dateIdx = headers.indexOf('date');
    const monthIdx = headers.indexOf('month');
    const triggeredIdx = headers.indexOf('triggered_by');
    const clientsIdx = headers.indexOf('clients_processed');
    const countIdx = headers.indexOf('client_count');
    const amountIdx = headers.indexOf('total_amount');
    const statusIdx = headers.indexOf('status');
    const execIdx = headers.indexOf('execution_id');

    const records: RunHistoryRecord[] = rows.slice(1).map((row) => ({
      date: row[dateIdx] ?? '',
      month: row[monthIdx] ?? '',
      triggered_by: row[triggeredIdx] ?? '',
      clients_processed: row[clientsIdx] ?? '',
      client_count: Number(row[countIdx] ?? 0),
      total_amount: Number(row[amountIdx] ?? 0),
      status: row[statusIdx] ?? '',
      execution_id: row[execIdx] ?? '',
    }));

    records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return records;
  });
}

export async function fetchEmailConfigs(forceRefresh = false): Promise<EmailConfigRecord[]> {
  return getCachedData('emailConfigs', forceRefresh, async () => {
    const cacheBuster = forceRefresh ? `&_cb=${Date.now()}` : '';
    const url = `${getSheetsBaseUrl()}/v4/spreadsheets/${SPREADSHEET_ID}/values/emails?key=${API_KEY}${cacheBuster}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch email configs: ${res.status} ${res.statusText}`);
    }

    const data: { values?: string[][] } = await res.json();
    const rows = data.values;
    if (!rows || rows.length < 2) return [];

    const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const companyIdx = headers.indexOf('company_name');
    const toIdx = headers.indexOf('to');
    const ccIdx = headers.indexOf('cc');
    const bccIdx = headers.indexOf('bcc');
    const subjectIdx = headers.indexOf('subject');
    const messageIdx = headers.indexOf('message');
    const attachmentIdx = headers.indexOf('manual_attachment');

    return rows.slice(1).map((row) => ({
      company_name: row[companyIdx] ?? '',
      to: row[toIdx] ?? '',
      cc: row[ccIdx] ?? '',
      bcc: row[bccIdx] ?? '',
      subject: row[subjectIdx] ?? '',
      message: row[messageIdx] ?? '',
      manual_attachment: row[attachmentIdx] ?? '',
    }));
  });
}

