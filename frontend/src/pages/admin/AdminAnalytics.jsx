import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileSpreadsheet, Info, Loader2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { TrendChart } from '../../components/TrendChart';
import { BarChart, ShareBars } from '../../components/BarChart';
import { usePagination } from '../../hooks/usePagination';
import { ResetFiltersButton } from '../../components/AdminListControls';
import { formatDate } from '../../utils/date';
import { buildCsv, buildXlsx, downloadFile, CSV_MIME, XLSX_MIME } from '../../utils/exportReport';
import './Admin.css';
import './AdminAnalytics.css';

// IMPORTANT: this page only DISPLAYS what GET /admin/analytics/financial
// returns. Every total, average, split and profit figure is computed in the
// backend (financialAnalyticsService.js) — the browser never does price math.

const PAGE_SIZE = 20;

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
];

const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const BUCKET_LABELS = {
  collected: 'Collected',
  cod_pending: 'COD pending',
  awaiting_payment: 'Awaiting payment',
  refunded: 'Refund initiated',
  rto: 'RTO / returned',
  cancelled: 'Cancelled',
  expired: 'Expired',
};
const BUCKET_PILL = {
  collected: 'pill-active',
  cod_pending: 'pill-warning',
  awaiting_payment: 'pill-warning',
  refunded: 'pill-danger',
  rto: 'pill-danger',
  cancelled: 'pill-inactive',
  expired: 'pill-inactive',
};

// Dates here are IST calendar days (the store's timezone) — the same basis
// the backend buckets orders by.
const IST_OFFSET_MS = 330 * 60 * 1000;
function istDateOf(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function shiftDay(dateString, days) {
  const t = new Date(`${dateString}T00:00:00Z`).getTime() + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function presetRange(id) {
  const today = istDateOf(Date.now());
  if (id === 'today') return { from: today, to: today };
  if (id === 'yesterday') {
    const y = shiftDay(today, -1);
    return { from: y, to: y };
  }
  if (id === 'last7') return { from: shiftDay(today, -6), to: today };
  if (id === 'last30') return { from: shiftDay(today, -29), to: today };
  if (id === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return null;
}

function inr(value) {
  if (value === null || value === undefined) return '—';
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(value) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

const BASIS_LABEL = { actual: 'Actual', estimated: 'Estimated', unavailable: 'Unavailable' };
const BASIS_PILL = { actual: 'pill-active', estimated: 'pill-warning', unavailable: 'pill-inactive' };

function BasisTag({ basis }) {
  if (!basis) return null;
  return <span className={`pill ${BASIS_PILL[basis] || 'pill-inactive'} analytics-basis`}>{BASIS_LABEL[basis] || basis}</span>;
}

function Tile({ label, value, sub, basis, tone }) {
  return (
    <div className={`stat-tile analytics-tile ${tone ? `analytics-tile-${tone}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">
        {label} <BasisTag basis={basis} />
      </div>
      {sub && <div className="analytics-sub">{sub}</div>}
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="analytics-section">
      <div className="analytics-section-head">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, basis, strong, note }) {
  return (
    <div className={`analytics-row ${strong ? 'analytics-row-strong' : ''}`}>
      <span>
        {label} <BasisTag basis={basis} />
        {note && <em className="analytics-note">{note}</em>}
      </span>
      <span>{value}</span>
    </div>
  );
}

// Flattens the backend report into sheet rows — display values only.
function buildSheets(report) {
  const { summary, paymentBreakdown, shipping, taxDiscounts, profit, orders, meta } = report;
  const line = (section, metric, value, basis = '', note = '') => [section, metric, value ?? '', basis, note];
  const summaryRows = [
    ['Section', 'Metric', 'Value', 'Basis', 'Note'],
    line('Report', 'Date basis', meta.dateBasis),
    line('Report', 'Orders in filter', summary.orderCount),
    line('Revenue', 'Gross sales', summary.grossSales),
    line('Revenue', 'Net revenue (collected)', summary.netRevenue),
    line('Revenue', 'Paid / collected orders', summary.paidOrders),
    line('Revenue', 'Pending online payments', summary.pendingPayments.amount, '', `${summary.pendingPayments.orders} orders`),
    line('Revenue', 'Pending COD collection', summary.pendingCod.amount, '', `${summary.pendingCod.orders} orders`),
    line('Revenue', 'Refunds initiated', summary.refunds.amount, '', `${summary.refunds.orders} orders`),
    line('Revenue', 'Cancelled', summary.cancelled.amount, '', `${summary.cancelled.orders} orders`),
    line('Revenue', 'RTO / returned', summary.rto.amount, '', `${summary.rto.orders} orders`),
    line('COD', 'Orders', paymentBreakdown.cod.orders),
    line('COD', 'Gross sales', paymentBreakdown.cod.grossSales),
    line('COD', 'Collected', paymentBreakdown.cod.collected),
    line('COD', 'Pending collection', paymentBreakdown.cod.pending),
    line('Prepaid (PayU)', 'Orders', paymentBreakdown.online.orders),
    line('Prepaid (PayU)', 'Gross sales', paymentBreakdown.online.grossSales),
    line('Prepaid (PayU)', 'Collected', paymentBreakdown.online.collected),
    line('Prepaid (PayU)', 'Pending payment', paymentBreakdown.online.pending),
    line('Prepaid (PayU)', 'Refunds', paymentBreakdown.online.refunds),
    line('Prepaid (PayU)', 'Payment gateway fees', paymentBreakdown.online.gatewayFees.amount, paymentBreakdown.online.gatewayFees.basis, paymentBreakdown.online.gatewayFees.note),
    line('Shipping', 'Customer-paid shipping', shipping.customerPaid),
    line('Shipping', 'Free-shipping orders', shipping.freeShippingOrders),
    line('Shipping', 'Free-shipping cost', shipping.freeShippingCost.amount, shipping.freeShippingCost.basis),
    line('Shipping', 'Courier cost (quoted)', shipping.courierCost.amount, shipping.courierCost.basis, shipping.courierCost.note),
    line('Shipping', 'COD fees collected', shipping.codFeesCollected),
    line('Shipping', 'RTO orders', shipping.rto.orders),
    line('Shipping', 'RTO charges', shipping.rto.charges.amount, shipping.rto.charges.basis),
    line('Tax & discounts', 'GST collected', taxDiscounts.gstCollected),
    line('Tax & discounts', 'GST on pending COD', taxDiscounts.gstOnPendingCod),
    line('Tax & discounts', 'Coupon discounts', taxDiscounts.couponDiscounts.amount),
    line('Tax & discounts', 'Prepaid discounts', taxDiscounts.prepaidDiscounts.amount),
    line('Profit', 'Revenue ex-GST', profit.revenueExGst, profit.basis),
    line('Profit', 'COGS', profit.cogs.amount, profit.cogs.basis),
    line('Profit', 'Payment gateway fees', profit.gatewayFees, 'estimated'),
    line('Profit', 'Courier cost', profit.courierCost, 'estimated'),
    line('Profit', 'RTO charges', profit.rtoCharges, 'estimated'),
    line('Profit', 'Estimated net profit', profit.netProfit, profit.basis, `Covers ${profit.eligibleOrders} of ${profit.saleOrders} orders (${profit.coveragePct ?? '—'}%)`),
    line('Profit', 'Realized profit (collected only)', profit.realizedProfit, profit.basis),
  ];

  const orderHeader = [
    'Order', 'Placed (IST)', 'Customer', 'Method', 'State', 'Order status', 'Subtotal', 'Discount', 'GST',
    'Shipping', 'COD charge', 'Prepaid discount', 'Total', 'Collected', 'Pending', 'Refund',
    'COGS', 'COGS basis', 'Gateway fee', 'Courier cost', 'RTO charge', 'Net profit', 'Profit basis',
  ];
  const orderRows = orders.map((o) => [
    o.orderId, o.date, o.customerName || '', o.paymentMethod === 'Online' ? 'Prepaid (PayU)' : 'COD',
    BUCKET_LABELS[o.bucket] || o.bucket, o.status, o.subtotal, o.discountAmount, o.gstAmount,
    o.shipping, o.codCharge, o.prepaidDiscount, o.total, o.collectedAmount, o.pendingAmount, o.refundAmount,
    o.cogs.amount, o.cogs.basis, o.gatewayFee.amount, o.courier.amount, o.rtoCharge.amount,
    o.profit.net, o.profit.eligible ? 'Estimated' : 'Excluded (cost data missing)',
  ]);
  return [
    { name: 'Summary', rows: summaryRows },
    { name: 'Orders', rows: [orderHeader, ...orderRows] },
  ];
}

export function AdminAnalytics() {
  const { showToast } = useToast();
  const initial = presetRange('last30');
  const [preset, setPreset] = useState('last30');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState('');
  const [bucket, setBucket] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feeInput, setFeeInput] = useState('');
  const [savingFee, setSavingFee] = useState(false);

  function load() {
    setLoading(true);
    return adminService
      .financialAnalytics({ from, to, paymentMethod, status, bucket })
      .then((data) => {
        setReport(data);
        setError(null);
        setFeeInput(data.meta.assumptions.paymentGatewayFeePercent ?? '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, paymentMethod, status, bucket]);

  function choosePreset(id) {
    setPreset(id);
    const range = presetRange(id);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
  }

  // Back to the screen's opening view: last 30 days, nothing filtered.
  function resetFilters() {
    choosePreset('last30');
    setPaymentMethod('');
    setStatus('');
    setBucket('');
  }
  const filtersChanged = preset !== 'last30' || Boolean(paymentMethod || status || bucket);

  const { page, setPage, totalPages, pageItems, total, rangeStart, rangeEnd } = usePagination(
    report?.orders || [],
    PAGE_SIZE
  );

  const revenueSeries = useMemo(
    () => (report?.series || []).map((d) => ({ label: formatDate(d.date), value: d.grossSales })),
    [report]
  );
  const profitSeries = useMemo(
    () => (report?.series || []).map((d) => ({ label: formatDate(d.date), value: d.profit })),
    [report]
  );

  async function saveFee(e) {
    e.preventDefault();
    const value = feeInput === '' ? null : Number(feeInput);
    if (value !== null && (Number.isNaN(value) || value < 0 || value > 20)) {
      showToast('Enter a fee between 0 and 20 (%).', 'error');
      return;
    }
    setSavingFee(true);
    try {
      await adminService.updateSettings({ finance: { paymentGatewayFeePercent: value } });
      showToast('Finance assumptions saved', 'success');
      await load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingFee(false);
    }
  }

  function exportCsv() {
    const sheets = buildSheets(report);
    const rows = [...sheets[0].rows, [], ...sheets[1].rows];
    downloadFile(buildCsv(rows), `financial-report-${from}_to_${to}.csv`, CSV_MIME);
  }
  function exportXlsx() {
    downloadFile(buildXlsx(buildSheets(report)), `financial-report-${from}_to_${to}.xlsx`, XLSX_MIME);
  }

  if (error && !report) return <ErrorState message={error} onRetry={load} />;
  if (!report) return <Loader label="Loading financial analytics…" />;

  const { summary, paymentBreakdown, shipping, taxDiscounts, profit, meta } = report;
  const fees = paymentBreakdown.online.gatewayFees;
  const noProfitData = profit.eligibleOrders === 0;

  const gaps = [];
  if (fees.basis === 'unavailable') gaps.push('Payment gateway fee % is not set — fees and profit on prepaid orders are excluded until you add it below.');
  if (profit.missing.cogsOrders > 0) gaps.push(`Product cost is missing for ${profit.missing.cogsOrders} order(s) — add a "Your Cost Price" to each product's selling options.`);
  gaps.push('Courier cost uses the rate quoted at checkout, not the amount Shiprocket actually billed.');
  gaps.push('Payment fees are an estimate from your assumed %, not PayU settlement data.');
  gaps.push('Refunds are full-amount only and shown as "initiated" (a confirmed state is not recorded).');

  return (
    <div className={`analytics-page ${loading ? 'analytics-loading' : ''}`}>
      <div className="admin-page-header">
        <h1>Pricing &amp; Financial Analytics</h1>
        <div className="analytics-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv}>
            <Download size={14} /> CSV
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={exportXlsx}>
            <FileSpreadsheet size={14} /> Excel (.xlsx)
          </button>
        </div>
      </div>

      <div className="analytics-filters">
        <div className="analytics-presets" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`analytics-chip ${preset === p.id ? 'active' : ''}`}
              onClick={() => choosePreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="admin-filters">
          <input
            type="date"
            value={from}
            max={to || undefined}
            aria-label="From date"
            onChange={(e) => {
              setPreset('custom');
              setFrom(e.target.value);
            }}
          />
          <input
            type="date"
            value={to}
            min={from || undefined}
            aria-label="To date"
            onChange={(e) => {
              setPreset('custom');
              setTo(e.target.value);
            }}
          />
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label="Payment method">
            <option value="">COD &amp; Prepaid</option>
            <option value="COD">COD only</option>
            <option value="Online">Prepaid (PayU) only</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Order status">
            <option value="">All order statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Payment state">
            <option value="">All payment states</option>
            {Object.entries(BUCKET_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          {loading && <Loader2 size={16} className="btn-spinner" aria-label="Updating" />}
          <ResetFiltersButton visible={filtersChanged} onClick={resetFilters} />
        </div>
        <p className="analytics-basis-note">
          {meta.totalMatching} order(s) · dates are {meta.dateBasis}, {meta.timezone}
        </p>
      </div>

      {error && <p className="field-error">{error}</p>}

      <div className="admin-alert-banner analytics-gaps">
        <Info size={18} />
        <ul>
          {gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>

      {summary.orderCount === 0 ? (
        <EmptyState title="No orders match these filters" message="Try a wider date range or clear a filter." />
      ) : (
        <>
          <Section title="Revenue" hint="Gross sales = placed orders that were not cancelled or expired. Net revenue = money actually collected.">
            <div className="stat-grid">
              <Tile label="Gross sales" value={inr(summary.grossSales)} sub={`${summary.saleOrders} orders`} />
              <Tile label="Net revenue" value={inr(summary.netRevenue)} sub="Collected (prepaid paid + COD delivered)" tone="good" />
              <Tile label="Paid / collected orders" value={summary.paidOrders} />
              <Tile label="Pending payments" value={inr(summary.pendingPayments.amount)} sub={`${summary.pendingPayments.orders} online orders awaiting payment`} />
              <Tile label="Pending COD collection" value={inr(summary.pendingCod.amount)} sub={`${summary.pendingCod.orders} undelivered COD orders`} />
              <Tile label="Refunds initiated" value={inr(summary.refunds.amount)} sub={`${summary.refunds.orders} orders`} tone="bad" />
              <Tile label="RTO / returned" value={inr(summary.rto.amount)} sub={`${summary.rto.orders} orders`} />
              <Tile label="Cancelled / expired" value={inr(summary.cancelledOrExpired.amount)} sub={`${summary.cancelled.orders} cancelled · ${summary.expired.orders} expired`} />
            </div>
          </Section>

          <Section title="Payment breakdown" hint="COD and prepaid are separate sets of orders — nothing is counted in both.">
            <div className="analytics-two-col">
              <div className="analytics-card">
                <h3>Cash on delivery</h3>
                <Row label="Orders" value={paymentBreakdown.cod.orders} />
                <Row label="Gross sales" value={inr(paymentBreakdown.cod.grossSales)} />
                <Row label="Collected (delivered)" value={inr(paymentBreakdown.cod.collected)} />
                <Row label="Pending collection" value={inr(paymentBreakdown.cod.pending)} />
              </div>
              <div className="analytics-card">
                <h3>Prepaid (PayU)</h3>
                <Row label="Orders" value={paymentBreakdown.online.orders} />
                <Row label="Gross sales" value={inr(paymentBreakdown.online.grossSales)} />
                <Row label="Collected" value={inr(paymentBreakdown.online.collected)} />
                <Row label="Awaiting payment" value={inr(paymentBreakdown.online.pending)} />
                <Row label="Refunds initiated" value={inr(paymentBreakdown.online.refunds)} />
                <Row label="Payment fees" value={inr(fees.amount)} basis={fees.basis} note={fees.note} />
              </div>
            </div>
          </Section>

          <Section title="Shipping costs">
            <div className="stat-grid">
              <Tile label="Customer-paid shipping" value={inr(shipping.customerPaid)} />
              <Tile
                label="Courier cost"
                value={inr(shipping.courierCost.amount)}
                basis={shipping.courierCost.basis}
                sub={`${pct(shipping.courierCost.quotedCoveragePct)} of orders have a stored quote`}
              />
              <Tile
                label="Free-shipping cost"
                value={inr(shipping.freeShippingCost.amount)}
                basis={shipping.freeShippingCost.basis}
                sub={`${shipping.freeShippingOrders} free-shipping orders`}
              />
              <Tile label="COD fees collected" value={inr(shipping.codFeesCollected)} />
              <Tile label="Courier COD fees" value="—" basis="unavailable" sub="Not recorded" />
              <Tile
                label="RTO charges"
                value={inr(shipping.rto.charges.amount)}
                basis={shipping.rto.charges.basis}
                sub={`${shipping.rto.orders} RTO orders`}
              />
            </div>
          </Section>

          <Section title="Tax & discounts">
            <div className="stat-grid">
              <Tile label="GST collected" value={inr(taxDiscounts.gstCollected)} sub="On collected orders" />
              <Tile label="GST on pending COD" value={inr(taxDiscounts.gstOnPendingCod)} />
              <Tile label="Coupon discounts" value={inr(taxDiscounts.couponDiscounts.amount)} sub={`${taxDiscounts.couponDiscounts.orders} orders`} />
              <Tile label="Prepaid discounts" value={inr(taxDiscounts.prepaidDiscounts.amount)} sub={`${taxDiscounts.prepaidDiscounts.orders} orders`} />
              <Tile label="COD charges" value={inr(taxDiscounts.codCharges)} sub="Charged to customers" />
            </div>
          </Section>

          <Section
            title="Profit analysis"
            hint={`Estimated. Based on ${profit.eligibleOrders} of ${profit.saleOrders} orders (${pct(profit.coveragePct)}) — only orders where every cost is known.`}
          >
            <div className="analytics-two-col">
              <div className="analytics-card">
                <h3>Waterfall</h3>
                {noProfitData ? (
                  <p className="analytics-empty-profit">
                    Profit can't be estimated yet — no order has every cost known. Add "Your Cost Price" to your products' selling options and set the PayU fee % below.
                  </p>
                ) : (
                  <>
                  <Row label="Revenue (ex-GST)" value={inr(profit.revenueExGst)} />
                  <Row label="Product cost (COGS)" value={inr(profit.cogs.amount)} basis={profit.cogs.basis} />
                  <Row label="Payment gateway fees" value={inr(profit.gatewayFees)} basis="estimated" />
                  <Row label="Courier cost" value={inr(profit.courierCost)} basis="estimated" />
                  <Row label="RTO charges" value={inr(profit.rtoCharges)} basis="estimated" />
                  <Row label="Estimated net profit" value={inr(profit.netProfit)} basis={profit.basis} strong />
                  <Row label="Realized (collected only)" value={inr(profit.realizedProfit)} basis={profit.basis} />
  
                  </>
                )}
                <p className="analytics-footnote">
                  Refunded revenue not counted as income: {inr(profit.refundedRevenueLost)}. GST is a pass-through and excluded.
                </p>
              </div>
              <div className="analytics-card">
                <h3>Data completeness</h3>
                <Row label="Orders with full cost data" value={`${profit.eligibleOrders} / ${profit.saleOrders}`} />
                <Row label="Missing product cost" value={`${profit.missing.cogsOrders} orders`} />
                <Row label="Missing gateway fee %" value={`${profit.missing.gatewayFeeOrders} orders`} />
                <form className="analytics-assumptions" onSubmit={saveFee}>
                  <label htmlFor="feePercent">PayU fee assumption (% of order total)</label>
                  <div className="analytics-assumptions-row">
                    <input
                      id="feePercent"
                      type="number"
                      min="0"
                      max="20"
                      step="0.01"
                      placeholder="e.g. 2"
                      value={feeInput}
                      onChange={(e) => setFeeInput(e.target.value)}
                    />
                    <button type="submit" className="btn btn-outline btn-sm" disabled={savingFee}>
                      {savingFee ? <Loader2 size={14} className="btn-spinner" /> : 'Save'}
                    </button>
                  </div>
                  <p className="analytics-footnote">Admin-only. Used only to estimate fees; leave blank to treat fees as unavailable.</p>
                </form>
              </div>
            </div>
          </Section>

          <Section title="Charts">
            <div className="analytics-two-col">
              <div className="analytics-card">
                <h3>Gross sales per day</h3>
                <TrendChart data={revenueSeries} formatValue={inr} />
              </div>
              <div className="analytics-card">
                <h3>Estimated profit per day</h3>
                {noProfitData ? (
                  <p className="analytics-empty-profit">Not enough cost data yet.</p>
                ) : (
                  <BarChart data={profitSeries} formatValue={inr} />
                )}
              </div>
              <div className="analytics-card">
                <h3>COD vs prepaid (gross sales)</h3>
                <ShareBars
                  rows={[
                    { label: 'Cash on delivery', value: paymentBreakdown.cod.grossSales, display: inr(paymentBreakdown.cod.grossSales) },
                    { label: 'Prepaid (PayU)', value: paymentBreakdown.online.grossSales, display: inr(paymentBreakdown.online.grossSales) },
                  ]}
                />
              </div>
              <div className="analytics-card">
                <h3>Where the money goes</h3>
                {noProfitData ? (
                  <p className="analytics-empty-profit">Not enough cost data yet.</p>
                ) : (
                  <ShareBars
                    rows={[
                      { label: 'Product cost', value: profit.cogs.amount, display: inr(profit.cogs.amount) },
                      { label: 'Courier cost', value: profit.courierCost, display: inr(profit.courierCost) },
                      { label: 'Gateway fees', value: profit.gatewayFees, display: inr(profit.gatewayFees) },
                      { label: 'RTO charges', value: profit.rtoCharges, display: inr(profit.rtoCharges) },
                    ]}
                  />
                )}
              </div>
            </div>
          </Section>

          <Section title="Orders" hint={meta.truncated ? `Showing the latest ${report.orders.length} of ${meta.totalMatching} orders (exports contain the same rows).` : undefined}>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Placed</th>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Method</th>
                    <th>State</th>
                    <th>Total</th>
                    <th>GST</th>
                    <th>Shipping</th>
                    <th>Discount</th>
                    <th>COGS</th>
                    <th>Fee</th>
                    <th>Courier</th>
                    <th>Net profit</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((o) => (
                    <tr key={o.orderId}>
                      <td>{formatDate(o.createdAt)}</td>
                      <td>
                        <Link to={`/admin/orders/${o.orderId}`}>{o.shortId}</Link>
                      </td>
                      <td>{o.customerName || '—'}</td>
                      <td>{o.paymentMethod === 'Online' ? 'Prepaid' : 'COD'}</td>
                      <td>
                        <span className={`pill ${BUCKET_PILL[o.bucket] || 'pill-inactive'}`}>{BUCKET_LABELS[o.bucket] || o.bucket}</span>
                      </td>
                      <td>{inr(o.total)}</td>
                      <td>{inr(o.gstAmount)}</td>
                      <td>{inr(o.shipping)}</td>
                      <td>{inr(o.discountTotal)}</td>
                      <td title={o.cogs.basis}>{inr(o.cogs.applied ? o.cogs.amount : 0)}</td>
                      <td>{inr(o.gatewayFee.amount)}</td>
                      <td>{inr(o.courier.amount)}</td>
                      <td>{o.profit.eligible ? inr(o.profit.net) : <span className="analytics-excluded" title="Cost data missing">n/a</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                total={total}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                itemLabel="orders"
              />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
