const CRYPTO_API_TOKEN = process.env.CRYPTO_API_TOKEN;
const CRYPTO_API_URL = 'https://pay.crypt.bot/api';

async function cryptoRequest(method, params = {}) {
  const url = new URL(`${CRYPTO_API_URL}/${method}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const res = await fetch(url, {
    headers: { 'Crypto-Pay-API-Token': CRYPTO_API_TOKEN }
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Crypto API error');
  return data.result;
}

export async function createCryptoInvoice(tier, userId) {
  const amount = tier === 2 ? '2.0' : '1.0';
  const description = tier === 2
    ? '⭐ Premium Полный — 30 дней'
    : '📦 Premium Базовый — 30 дней';

  const invoice = await cryptoRequest('createInvoice', {
    currency_type: 'crypto',
    asset: 'USDT',
    amount,
    description,
    payload: JSON.stringify({ userId, tier }),
    expires_in: 1800
  });

  return invoice;
}

export async function checkCryptoInvoice(invoiceId) {
  const invoices = await cryptoRequest('getInvoices', {
    invoice_ids: String(invoiceId)
  });
  return invoices[0] || null;
}

export async function getExchangeRates() {
  return await cryptoRequest('getExchangeRates');
}

export async function getBalance() {
  return await cryptoRequest('getBalance');
}
