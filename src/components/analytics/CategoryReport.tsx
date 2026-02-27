import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { Search } from 'lucide-react';
import { type Branch } from '../partials/Header';
import { DataTable, type ColumnDef } from '../ui/DataTable';

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

const MOCK_CATEGORY_REPORT_BASE: Omit<CategoryReportRow, 'id'>[] = [
  { goods: 'Svc Dwanjangjjigae', category: 'Service', salesQty: 1416, totalSales: 0, refundQty: 0, refundAmount: 0, discounts: 0, netSales: 0, unitCost: 0, totalRevenue: 0 },
  { goods: 'Chamisul', category: 'DRINKS', salesQty: 1383, totalSales: 387240, refundQty: 3, refundAmount: 840, discounts: 224, netSales: 386176, unitCost: 0, totalRevenue: 386176 },
  { goods: 'I1 Iberico Kkot Moksal', category: 'I-Iberico PORK', salesQty: 1197, totalSales: 813960, refundQty: 0, refundAmount: 0, discounts: 2584, netSales: 811376, unitCost: 0, totalRevenue: 811376 },
  { goods: 'Basic Meat Setting 1', category: 'Basic meat set', salesQty: 1171, totalSales: 0, refundQty: 0, refundAmount: 0, discounts: 0, netSales: 0, unitCost: 0, totalRevenue: 0 },
  { goods: 'A8 Gonggibab (Rice)', category: 'A-ADDITIONAL', salesQty: 1046, totalSales: 52300, refundQty: 0, refundAmount: 0, discounts: 60, netSales: 52240, unitCost: 0, totalRevenue: 52240 },
  { goods: 'K1 Handon KKotsamgyeopsal', category: 'K-Aged Preium Pork', salesQty: 730, totalSales: 438000, refundQty: 0, refundAmount: 0, discounts: 1320, netSales: 436680, unitCost: 0, totalRevenue: 436680 },
  { goods: 'Coke', category: 'DRINKS', salesQty: 545, totalSales: 43600, refundQty: 1, refundAmount: 80, discounts: 0, netSales: 43520, unitCost: 0, totalRevenue: 43520 },
  { goods: 'San Miguel Light', category: 'DRINKS', salesQty: 513, totalSales: 61560, refundQty: 1, refundAmount: 120, discounts: 0, netSales: 61440, unitCost: 0, totalRevenue: 61440 },
  { goods: 'S1 Premium Set A (2Pax)', category: 'SET Meat', salesQty: 426, totalSales: 630480, refundQty: 0, refundAmount: 0, discounts: 0, netSales: 630480, unitCost: 0, totalRevenue: 630480 },
  { goods: 'Nalchial Jumeokbab 1', category: 'Nalchial Jumeokbab Set', salesQty: 424, totalSales: 0, refundQty: 0, refundAmount: 0, discounts: 0, netSales: 0, unitCost: 0, totalRevenue: 0 },
];

export const CategoryReport: React.FC<CategoryReportProps> = ({ selectedBranch, dateRange }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const money = (value: number) =>
    `${t('common.currency_symbol')}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rows = useMemo(() => {
    const branchMultiplierById: Record<string, number> = {
      all: 1,
      '1': 1,
      '2': 0.91,
      '3': 0.84,
    };
    const multiplier = branchMultiplierById[String(selectedBranch?.id || 'all')] || 0.88;

    return MOCK_CATEGORY_REPORT_BASE.map((row, index) => {
      const adjustedSalesQty = Math.max(0, Math.round(row.salesQty * multiplier));
      const adjustedTotalSales = Math.max(0, Math.round(row.totalSales * multiplier));
      const adjustedRefundAmount = Math.max(0, Math.round(row.refundAmount * multiplier));
      const adjustedDiscounts = Math.max(0, Math.round(row.discounts * multiplier));
      const adjustedNetSales = Math.max(0, adjustedTotalSales - adjustedRefundAmount - adjustedDiscounts);
      return {
        id: `${String(selectedBranch?.id || 'all')}-${index + 1}`,
        goods: row.goods,
        category: row.category,
        salesQty: adjustedSalesQty,
        totalSales: adjustedTotalSales,
        refundQty: row.refundQty,
        refundAmount: adjustedRefundAmount,
        discounts: adjustedDiscounts,
        netSales: adjustedNetSales,
        unitCost: row.unitCost,
        totalRevenue: adjustedNetSales,
      };
    });
  }, [selectedBranch?.id, dateRange.end, dateRange.start]);

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

  // --- Export Function ---
  const handleExport = () => {
    // 1. Create data rows for Excel
    const data = filteredRows.map(row => ({
      [t('category_report.columns.category')]: row.category,
      [t('category_report.columns.sales_quantity')]: row.salesQty.toLocaleString(),
      [t('category_report.columns.total_sales')]: money(row.totalSales),
      [t('category_report.columns.refund_quantity')]: row.refundQty.toLocaleString(),
      [t('category_report.columns.refund_amount')]: money(row.refundAmount),
      [t('category_report.columns.discounts')]: money(row.discounts),
      [t('category_report.columns.net_sales')]: money(row.netSales),
      [t('category_report.columns.unit_cost')]: money(row.unitCost),
      [t('category_report.columns.total_revenue')]: money(row.totalRevenue),
    }));

    // 2. Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 3. Set column widths
    worksheet['!cols'] = [
      { wch: 25 }, // Category
      { wch: 18 }, // Sales Quantity
      { wch: 18 }, // Total Sales
      { wch: 18 }, // Refund Quantity
      { wch: 18 }, // Refund Amount
      { wch: 18 }, // Discounts
      { wch: 18 }, // Net Sales
      { wch: 18 }, // Unit Cost
      { wch: 20 }, // Total Revenue
    ];

    // 4. Create workbook and add worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Category Report');

    // 5. Generate descriptive filename
    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `category_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.xlsx`;

    // 6. Download the file
    XLSX.writeFile(workbook, filename);
  };

  return (
    <div className="pt-6 space-y-4">
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
        <button type="button" onClick={handleExport} className="text-sm font-semibold text-green-700 hover:text-green-800 transition-colors flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          {t('category_report.export')}
        </button>
      </div>
      <DataTable data={filteredRows} columns={columns} keyExtractor={(item) => item.id} />
    </div>
  );
};

