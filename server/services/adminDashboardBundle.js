const CashReconciliationModel = require('../models/cashReconciliationModel');

const PYSERVER_BASE_URL = process.env.PYSERVER_BASE_URL || 'http://127.0.0.1:2100';
const BUNDLE_PYSERVER_TIMEOUT_MS = Number(process.env.BUNDLE_PYSERVER_TIMEOUT_MS || 15000);
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function fetchPyServer(path, params = {}, timeoutMs = BUNDLE_PYSERVER_TIMEOUT_MS) {
	const url = new URL(path, PYSERVER_BASE_URL);
	for (const [key, value] of Object.entries(params)) {
		if (value != null && String(value).trim() !== '') {
			url.searchParams.set(key, String(value));
		}
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url.toString(), { signal: controller.signal });
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new Error(`PyServer ${path} status ${res.status}: ${text.slice(0, 200)}`);
		}
		const json = await res.json().catch(() => null);
		if (!json || json.success === false) {
			throw new Error(json?.message || `PyServer ${path} error`);
		}
		return json;
	} finally {
		clearTimeout(timer);
	}
}

async function fetchPyServerOptional(path, params = {}, timeoutMs = BUNDLE_PYSERVER_TIMEOUT_MS) {
	try {
		return await fetchPyServer(path, params, timeoutMs);
	} catch (err) {
		const msg = err?.message || String(err);
		if (/aborted/i.test(msg)) {
			console.warn(`[adminDashboardBundle] PyServer slow (>${timeoutMs}ms): ${path}`);
		} else {
			console.warn(`[adminDashboardBundle] ${path}:`, msg);
		}
		return null;
	}
}

function buildExpenseMaps(rows) {
	const expenseMap = {};
	const expenseByBranch = {};
	const makeKey = (cat, name) => `${String(cat).trim().toLowerCase()}|${String(name).trim().toLowerCase()}`;

	for (const row of rows || []) {
		const bid = Number(row.branch_id);
		if (!Number.isFinite(bid)) continue;
		if (!expenseMap[bid]) expenseMap[bid] = {};
		const key = makeKey(row.exp_cat, row.exp_name);
		const amt = Number(row.total_amount || 0);
		expenseMap[bid][key] = (expenseMap[bid][key] || 0) + amt;
		expenseByBranch[bid] = (expenseByBranch[bid] || 0) + amt;
	}

	return { expenseMap, expenseByBranch };
}

function branchExpensesFromMap(branchId, expenseByBranch, expenseMap) {
	const fromBranch = expenseByBranch[branchId];
	if (fromBranch != null) return fromBranch;
	const branchMap = expenseMap[branchId];
	if (!branchMap) return 0;
	return Object.values(branchMap).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function buildSummary({ branchId, branchCards, totalExpenses }) {
	if (branchId != null && branchCards.length > 0) {
		const branch = branchCards.find((b) => String(b.id) === String(branchId));
		if (branch) {
			const totalSales = Number(branch.totalSales) || 0;
			const expenses = Number(branch.totalExpenses) || 0;
			return {
				totalSales,
				totalExpenses: expenses,
				totalRevenue: totalSales - expenses,
			};
		}
	}

	const totalSales = branchCards.reduce((s, b) => s + (Number(b.totalSales) || 0), 0);
	const expenses = Number(totalExpenses) || 0;
	return {
		totalSales,
		totalExpenses: expenses,
		totalRevenue: totalSales - expenses,
	};
}

function buildMonthlyTrendFromDaily(dailySales, dailyExpenses, byDate, start, end) {
	const salesByDate = new Map();
	const expensesByDom = Array(31).fill(0);

	for (const row of dailySales || []) {
		const date = String(row.sale_date ?? '').slice(0, 10);
		if (!date || date < start || date > end) continue;
		const net = Number(row.net_sales ?? 0);
		const recon = Number(byDate?.[date] ?? 0);
		salesByDate.set(date, (salesByDate.get(date) ?? 0) + net + recon);
	}

	for (const [date, amt] of Object.entries(byDate || {})) {
		if (date < start || date > end) continue;
		if (!salesByDate.has(date)) salesByDate.set(date, Number(amt) || 0);
	}

	for (const row of dailyExpenses || []) {
		const date = String(row.expense_date ?? '').slice(0, 10);
		if (!date || date < start || date > end) continue;
		const dom = new Date(`${date}T12:00:00`).getDate();
		if (dom >= 1 && dom <= 31) {
			expensesByDom[dom - 1] += Number(row.total_expense ?? 0);
		}
	}

	const salesByDom = Array(31).fill(0);
	for (const [date, val] of salesByDate) {
		const dom = new Date(`${date}T12:00:00`).getDate();
		if (dom >= 1 && dom <= 31) salesByDom[dom - 1] += val;
	}

	return Array.from({ length: 31 }, (_, idx) => ({
		name: String(idx + 1),
		totalSales: salesByDom[idx],
		totalExpenses: expensesByDom[idx],
	}));
}

async function buildBranchChartsForAll(branchCards, start_date, end_date) {
	const branchChartsById = {};
	const branches = branchCards || [];

	async function loadBranchChart(branch) {
		const branchId = branch.id;
		const hasActivity =
			(Number(branch.totalSales) || 0) > 0 || (Number(branch.totalExpenses) || 0) > 0;
		if (!hasActivity) {
			branchChartsById[String(branchId)] = { trendMonthly: [], topProducts: [] };
			return;
		}

		const pyParams = { start_date, end_date, branch_id: String(branchId) };
		const [dailySalesRes, dailyExpensesRes, topSellingRes, recon] = await Promise.all([
			fetchPyServerOptional('/api/analytics/daily-sales', pyParams),
			fetchPyServerOptional('/api/analytics/daily-expenses', pyParams),
			fetchPyServerOptional('/api/analytics/top-selling', { ...pyParams, limit: '5' }),
			CashReconciliationModel.aggregatesForRange(branchId, start_date, end_date).catch(() => ({
				total: 0,
				byDate: {},
			})),
		]);

		const dailySales = dailySalesRes?.data?.data || [];
		const dailyExpenses = dailyExpensesRes?.data?.data || [];
		const topSelling = topSellingRes?.data?.data || [];
		const byDate = recon?.byDate && typeof recon.byDate === 'object' ? recon.byDate : {};

		branchChartsById[String(branchId)] = {
			trendMonthly: buildMonthlyTrendFromDaily(
				dailySales,
				dailyExpenses,
				byDate,
				start_date,
				end_date,
			),
			topProducts: (topSelling || []).slice(0, 5).map((item) => ({
				name: item.MENU_NAME || '',
				sales: item.total_quantity,
			})),
		};
	}

	const queue = [...branches];
	const workerCount = Math.min(4, Math.max(1, queue.length));
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (queue.length > 0) {
				const branch = queue.shift();
				if (branch) await loadBranchChart(branch);
			}
		}),
	);

	return branchChartsById;
}

/**
 * Single server-side bundle for admin dashboard (summary + branch cards + charts data).
 */
async function buildAdminDashboardBundle({
	start_date,
	end_date,
	branchId = null,
	period = 'monthly',
	include_branch_charts = false,
}) {
	const pyParams = { start_date, end_date };
	if (branchId != null && String(branchId).trim() !== '') {
		pyParams.branch_id = String(branchId);
	}

	const branchSalesParams = { start_date, end_date };
	const trendParams = { ...pyParams, period: String(period || 'monthly') };

	// Single parallel wave — faster wall-clock than sequential phases.
	const [
		branchSalesRes,
		expenseSummaryRes,
		topSellingRes,
		expenseBreakdownRes,
		dailySalesRes,
		trendRes,
		reconByBranch,
		reconAll,
	] = await Promise.all([
		fetchPyServerOptional('/api/analytics/branch-sales', branchSalesParams),
		fetchPyServerOptional('/api/analytics/expense-summary', pyParams),
		fetchPyServerOptional('/api/analytics/top-selling', { ...pyParams, limit: '5' }),
		fetchPyServerOptional('/api/analytics/expense-breakdown', pyParams),
		fetchPyServerOptional('/api/analytics/daily-sales', pyParams),
		fetchPyServerOptional('/api/analytics/performance-trend', trendParams),
		CashReconciliationModel.totalsByBranchForRange(start_date, end_date).catch(() => ({})),
		CashReconciliationModel.aggregatesForRange(null, start_date, end_date).catch(() => ({
			total: 0,
			byDate: {},
		})),
	]);

	const branchSales = branchSalesRes?.data?.data || [];
	const topSelling = topSellingRes?.data?.data || [];
	const dailySales = dailySalesRes?.data?.data || [];
	const expenseBreakdown = expenseBreakdownRes?.data?.data || [];
	const expenseSummary = expenseSummaryRes?.data || { total_expense: 0 };

	const { expenseMap, expenseByBranch } = buildExpenseMaps(expenseBreakdown);

	const branchCardsData = (branchSales || []).map((b) => {
		const posBase = Number(b.total_sales || 0);
		const reconTotal = Number(reconByBranch[b.branch_id] ?? 0) || 0;
		return {
			id: b.branch_id,
			name: b.branch_name,
			totalSales: posBase + reconTotal,
			reportSalesPos: posBase,
			reconTotal,
			totalExpenses: expenseByBranch[b.branch_id] || 0,
			totalOrders: b.order_count,
		};
	});

	const branchRevenueDistribution = (branchSales || []).map((b) => ({
		name: b.branch_name,
		value: b.total_sales,
	}));

	const topProductsData = (topSelling || []).slice(0, 5).map((item) => ({
		name: item.MENU_NAME || '',
		sales: item.total_quantity,
	}));

	const comparePeriodReconAll = Number(reconAll?.total) || 0;

	const trendData = (trendRes?.data?.data || []).map((r) => ({
		name: String(r.name ?? ''),
		totalSales: Number(r.totalSales || 0),
		totalExpenses: Number(r.totalExpenses || 0),
		...(r.sale_date ? { date: String(r.sale_date).slice(0, 10) } : {}),
	}));

	// Retry trend alone if the parallel wave timed out.
	let finalTrendData = trendData;
	if (finalTrendData.length === 0) {
		const retryRes = await fetchPyServerOptional(
			'/api/analytics/performance-trend',
			trendParams,
			BUNDLE_PYSERVER_TIMEOUT_MS * 2,
		);
		finalTrendData = (retryRes?.data?.data || []).map((r) => ({
			name: String(r.name ?? ''),
			totalSales: Number(r.totalSales || 0),
			totalExpenses: Number(r.totalExpenses || 0),
			...(r.sale_date ? { date: String(r.sale_date).slice(0, 10) } : {}),
		}));
	}

	const scopedBranchId =
		branchId != null && String(branchId).trim() !== '' ? Number(branchId) : null;
	const summary = buildSummary({
		branchId: Number.isFinite(scopedBranchId) ? scopedBranchId : null,
		branchCards: branchCardsData,
		totalExpenses: Number(expenseSummary?.total_expense) || 0,
	});

	const branchChartsById = include_branch_charts
		? await buildBranchChartsForAll(branchCardsData, start_date, end_date)
		: {};

	return {
		summary,
		branchCardsData,
		branchRevenueDistribution,
		topProductsData,
		dailySalesForCards: dailySales,
		expenseCategoryByBranch: expenseMap,
		comparePeriodReconAll,
		trendData: finalTrendData,
		trendPeriod: String(period || 'monthly'),
		branchChartsById,
	};
}

module.exports = { buildAdminDashboardBundle };
