(() => {
  'use strict';
  let token = '';
  const byId = (id) => document.getElementById(id);
  const connection = byId('connection');
  const error = byId('error');

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || `HTTP ${response.status}`);
    return body;
  }

  function card(label, value) {
    const node = document.createElement('article'); node.className = 'card';
    const strong = document.createElement('strong'); strong.textContent = String(value);
    const span = document.createElement('span'); span.textContent = label;
    node.append(strong, span); return node;
  }

  function cell(row, value, className) {
    const node = document.createElement('td'); node.textContent = value ?? '—';
    if (className) node.className = className; row.append(node); return node;
  }

  async function retry(id) {
    await api(`/v1/fiscal-invoices/${encodeURIComponent(id)}/retry`, { method: 'POST', body: '{}' });
    await refresh();
  }

  function renderDocuments(items) {
    const body = byId('documents'); body.replaceChildren();
    if (!items.length) { const row = document.createElement('tr'); const node = cell(row, 'No matching documents', 'empty'); node.colSpan = 6; body.append(row); return; }
    for (const item of items) {
      const row = document.createElement('tr');
      cell(row, item.id.slice(0, 8)); cell(row, item.status, `status ${item.status}`);
      cell(row, [item.businessPremiseId, item.electronicDeviceId, item.invoiceSequence].filter(Boolean).join('/'));
      cell(row, item.issueLocalTime); cell(row, new Date(item.updatedAt).toLocaleString());
      const action = cell(row, '');
      if (['MANUAL_REVIEW', 'RETRY_PENDING', 'ISSUED_WITHOUT_EOR'].includes(item.status)) {
        const button = document.createElement('button'); button.className = 'secondary'; button.textContent = 'Retry';
        button.addEventListener('click', () => retry(item.id).catch(showError)); action.append(button);
      }
      body.append(row);
    }
  }

  function showError(reason) { error.textContent = reason instanceof Error ? reason.message : 'Request failed'; }

  async function refresh() {
    error.textContent = '';
    const status = byId('status').value;
    const [summary, listing] = await Promise.all([api('/v1/operator/summary'), api(`/v1/operator/documents?limit=100${status ? `&status=${encodeURIComponent(status)}` : ''}`)]);
    const cards = byId('summary'); cards.replaceChildren(
      card('Manual review', summary.documentsByStatus.MANUAL_REVIEW || 0),
      card('Issued without EOR', summary.documentsByStatus.ISSUED_WITHOUT_EOR || 0),
      card('Active outbox jobs', summary.activeOutboxJobs),
      card('Worker heartbeat', summary.workerLastSeenAt ? new Date(summary.workerLastSeenAt).toLocaleTimeString() : 'Missing'),
      card('Confirmed', summary.documentsByStatus.CONFIRMED || 0)
    );
    renderDocuments(listing.documents); connection.textContent = 'Connected'; connection.classList.add('online');
  }

  byId('connect-form').addEventListener('submit', (event) => { event.preventDefault(); token = byId('token').value; byId('token').value = ''; refresh().catch(showError); });
  byId('status').addEventListener('change', () => { if (token) refresh().catch(showError); });
})();
