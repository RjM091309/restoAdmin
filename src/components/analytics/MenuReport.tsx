import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { Search } from 'lucide-react';
import { type Branch } from '../partials/Header';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { fetchMenuReportApi, type ApiMenuReportRow } from '../../services/analyticsService';

type MenuReportProps = {
  selectedBranch: Branch | null;
  dateRange: {
    start: string;
    end: string;
  };
};

type MenuReportRow = {
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

const MOCK_MENU_REPORT_BASE: Omit<MenuReportRow, 'id'>[] = [];

export const MenuReport: React.FC<MenuReportProps> = ({ selectedBranch, dateRange }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [rows, setRows] = useState<MenuReportRow[]>([]);

  const money = (value: number) =>
    `${t('common.currency_symbol')}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  useEffect(() => {
    const load = async () => {
      const params = new URLSearchParams();
      if (dateRange.start) params.set('start_date', dateRange.start);
      if (dateRange.end) params.set('end_date', dateRange.end);
      if (selectedBranch && String(selectedBranch.id) !== 'all') {
        params.set('branch_id', String(selectedBranch.id));
      }
      try {
        const apiRows: ApiMenuReportRow[] = await fetchMenuReportApi(params);
        setRows(
          apiRows.map((row) => ({
            id: String(row.id),
            goods: row.goods,
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
        console.error('Failed to load menu report', err);
        setRows([]);
      }
    };

    void load();
  }, [dateRange.start, dateRange.end, selectedBranch?.id]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      row.goods.toLowerCase().includes(keyword) || row.category.toLowerCase().includes(keyword)
    );
  }, [rows, searchTerm]);

  const columns: ColumnDef<MenuReportRow>[] = [
    {
      header: t('menu_report.columns.goods'),
      accessorKey: 'goods',
      className: 'min-w-[180px] border-r border-gray-200',
    },
    {
      header: t('menu_report.columns.category'),
      accessorKey: 'category',
      className: 'min-w-[170px]',
    },
    {
      header: t('menu_report.columns.sales_quantity'),
      render: (item) => item.salesQty.toLocaleString(),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('menu_report.columns.total_sales'),
      render: (item) => money(item.totalSales),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('menu_report.columns.refund_quantity'),
      render: (item) => item.refundQty.toLocaleString(),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('menu_report.columns.refund_amount'),
      render: (item) => money(item.refundAmount),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('menu_report.columns.discounts'),
      render: (item) => money(item.discounts),
      className: 'min-w-[120px] text-right',
    },
    {
      header: t('menu_report.columns.net_sales'),
      render: (item) => money(item.netSales),
      className: 'min-w-[120px] text-right',
    },
    {
      header: t('menu_report.columns.unit_cost'),
      render: (item) => money(item.unitCost),
      className: 'min-w-[110px] text-right',
    },
    {
      header: t('menu_report.columns.total_revenue'),
      render: (item) => money(item.totalRevenue),
      className: 'min-w-[140px] text-right',
    },
  ];

  // --- Export Function ---
  const handleExport = () => {
    // 1. Create data rows for Excel
    const data = filteredRows.map(row => ({
      [t('menu_report.columns.goods')]: row.goods,
      [t('menu_report.columns.category')]: row.category,
      [t('menu_report.columns.sales_quantity')]: row.salesQty.toLocaleString(),
      [t('menu_report.columns.total_sales')]: money(row.totalSales),
      [t('menu_report.columns.refund_quantity')]: row.refundQty.toLocaleString(),
      [t('menu_report.columns.refund_amount')]: money(row.refundAmount),
      [t('menu_report.columns.discounts')]: money(row.discounts),
      [t('menu_report.columns.net_sales')]: money(row.netSales),
      [t('menu_report.columns.unit_cost')]: money(row.unitCost),
      [t('menu_report.columns.total_revenue')]: money(row.totalRevenue),
    }));

    // 2. Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 3. Set column widths
    worksheet['!cols'] = [
      { wch: 30 }, // Goods
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu Report');

    // 5. Generate descriptive filename
    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `menu_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.xlsx`;

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
            placeholder={t('menu_report.search_placeholder')}
            className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
          />
        </div>
        <button type="button" onClick={handleExport} className="text-sm font-semibold text-green-700 hover:text-green-800 transition-colors flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          {t('menu_report.export')}
        </button>
      </div>
      <DataTable data={filteredRows} columns={columns} keyExtractor={(item) => item.id} />
    </div>
  );
};
