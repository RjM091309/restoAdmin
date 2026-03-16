import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Search } from 'lucide-react';
import { type Branch } from '../partials/Header';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { Skeleton } from '../ui/Skeleton';
import { fetchCategoryReportApi, type ApiCategoryReportRow } from '../../services/analyticsService';

type CategoryReportProps = {
  selectedBranch: Branch | null;
  dateRange: {
    start: string;
    end: string;
  };
};

type CategoryReportRow = {
  id: string;
  goods: string;
  category: string;
  salesQty: number;
  totalSales: number;
  refundQty: number;
  refundAmount: number;
  discounts: number;
  netSales: number;
  unitCost: number;
  totalRevenue: number;
};

const MOCK_CATEGORY_REPORT_BASE: Omit<CategoryReportRow, 'id'>[] = [];

export const CategoryReport: React.FC<CategoryReportProps> = ({ selectedBranch, dateRange }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [rows, setRows] = useState<CategoryReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(true);

  const money = (value: number) =>
    `${t('common.currency_symbol')}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  useEffect(() => {
    const load = async () => {
      setReportLoading(true);
      const params = new URLSearchParams();
      if (dateRange.start) params.set('start_date', dateRange.start);
      if (dateRange.end) params.set('end_date', dateRange.end);
      if (selectedBranch && String(selectedBranch.id) !== 'all') {
        params.set('branch_id', String(selectedBranch.id));
      }
      try {
        const apiRows: ApiCategoryReportRow[] = await fetchCategoryReportApi(params);
        setRows(
          apiRows.map((row) => ({
            id: String(row.id),
            goods: row.category,
            category: row.category,
            salesQty: row.salesQty,
            totalSales: row.totalSales,
            refundQty: row.refundQty,
            refundAmount: row.refundAmount,
            discounts: row.discounts,
            netSales: row.netSales,
            unitCost: row.unitCost,
            totalRevenue: row.totalRevenue,
          }))
        );
      } catch (err) {
        console.error('Failed to load category report', err);
        setRows([]);
      } finally {
        setReportLoading(false);
      }
    };

    void load();
  }, [dateRange.start, dateRange.end, selectedBranch?.id]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => row.category.toLowerCase().includes(keyword));
  }, [rows, searchTerm]);

  const columns: ColumnDef<CategoryReportRow>[] = [
    {
      header: t('category_report.columns.category'),
      accessorKey: 'category',
      className: 'min-w-[200px] border-r border-gray-200',
    },
    {
      header: t('category_report.columns.sales_quantity'),
      render: (item) => item.salesQty.toLocaleString(),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('category_report.columns.total_sales'),
      render: (item) => money(item.totalSales),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('category_report.columns.refund_quantity'),
      render: (item) => item.refundQty.toLocaleString(),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('category_report.columns.refund_amount'),
      render: (item) => money(item.refundAmount),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('category_report.columns.discounts'),
      render: (item) => money(item.discounts),
      className: 'min-w-[120px] text-right',
    },
    {
      header: t('category_report.columns.net_sales'),
      render: (item) => money(item.netSales),
      className: 'min-w-[120px] text-right',
    },
    {
      header: t('category_report.columns.unit_cost'),
      render: (item) => money(item.unitCost),
      className: 'min-w-[110px] text-right',
    },
    {
      header: t('category_report.columns.total_revenue'),
      render: (item) => money(item.totalRevenue),
      className: 'min-w-[140px] text-right',
    },
  ];

  // --- Export Functions (CSV + PDF) ---
  const handleExportCsv = () => {
    const headers = [
      t('category_report.columns.category'),
      t('category_report.columns.sales_quantity'),
      t('category_report.columns.total_sales'),
      t('category_report.columns.refund_quantity'),
      t('category_report.columns.refund_amount'),
      t('category_report.columns.discounts'),
      t('category_report.columns.net_sales'),
      t('category_report.columns.unit_cost'),
      t('category_report.columns.total_revenue'),
    ];

    const escapeCell = (value: string) => {
      const needsQuotes = /[",\n]/.test(value);
      const safe = value.replace(/"/g, '""');
      return needsQuotes ? `"${safe}"` : safe;
    };

    const rowsForCsv = filteredRows.map((row) => [
      row.category,
      row.salesQty.toString(),
      row.totalSales.toString(),
      row.refundQty.toString(),
      row.refundAmount.toString(),
      row.discounts.toString(),
      row.netSales.toString(),
      row.unitCost.toString(),
      row.totalRevenue.toString(),
    ]);

    const csv = [
      headers.map(escapeCell).join(','),
      ...rowsForCsv.map((r) => r.map(escapeCell).join(',')),
    ].join('\n');

    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `category_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF('l', 'pt', 'a4');

    const headers = [
      t('category_report.columns.category'),
      t('category_report.columns.sales_quantity'),
      t('category_report.columns.total_sales'),
      t('category_report.columns.refund_quantity'),
      t('category_report.columns.refund_amount'),
      t('category_report.columns.discounts'),
      t('category_report.columns.net_sales'),
      t('category_report.columns.unit_cost'),
      t('category_report.columns.total_revenue'),
    ];

    const body = filteredRows.map((row) => [
      row.category,
      row.salesQty.toLocaleString(),
      money(row.totalSales),
      row.refundQty.toLocaleString(),
      money(row.refundAmount),
      money(row.discounts),
      money(row.netSales),
      money(row.unitCost),
      money(row.totalRevenue),
    ]);

    autoTable(doc, {
      head: [headers],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      margin: { top: 40 },
    });

    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `category_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.pdf`;

    doc.save(filename);
  };

  return (
    <div className="pt-6 space-y-4">
      <AnimatePresence mode="wait">
        {reportLoading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-10 w-80 rounded-xl" />
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden p-5">
              <Skeleton className="h-10 w-full rounded-lg mb-2" />
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg mb-1" />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={t('category_report.search_placeholder')}
                  className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleExportCsv} className="text-sm font-semibold text-green-700 hover:text-green-800 transition-colors flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  CSV
                </button>
                <button type="button" onClick={handleExportPdf} className="text-sm font-semibold text-red-700 hover:text-red-800 transition-colors flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><path d="M14 2v6h6"></path><path d="M9 12h1.5a1.5 1.5 0 0 1 0 3H9v-3z"></path><path d="M15 12h2"></path><path d="M15 15h2"></path></svg>
                  PDF
                </button>
              </div>
            </div>
            <DataTable data={filteredRows} columns={columns} keyExtractor={(item) => item.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

