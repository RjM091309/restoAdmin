import React, { useMemo, useState } from 'react';
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

const money = (value: number) =>
  `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const [searchTerm, setSearchTerm] = useState('');

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
      header: 'Category',
      accessorKey: 'category',
      className: 'min-w-[200px] border-r border-gray-200',
    },
    {
      header: 'Sales quantity',
      render: (item) => item.salesQty.toLocaleString(),
      className: 'min-w-[130px] text-right',
    },
    {
      header: 'Total sales',
      render: (item) => money(item.totalSales),
      className: 'min-w-[130px] text-right',
    },
    {
      header: 'Refund quantity',
      render: (item) => item.refundQty.toLocaleString(),
      className: 'min-w-[130px] text-right',
    },
    {
      header: 'Refund amount',
      render: (item) => money(item.refundAmount),
      className: 'min-w-[130px] text-right',
    },
    {
      header: 'Discounts',
      render: (item) => money(item.discounts),
      className: 'min-w-[120px] text-right',
    },
    {
      header: 'Net sales',
      render: (item) => money(item.netSales),
      className: 'min-w-[120px] text-right',
    },
    {
      header: 'Unit cost',
      render: (item) => money(item.unitCost),
      className: 'min-w-[110px] text-right',
    },
    {
      header: 'Total Revenue',
      render: (item) => money(item.totalRevenue),
      className: 'min-w-[140px] text-right',
    },
  ];

  return (
    <div className="pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search category..."
            className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
          />
        </div>
        <button type="button" className="text-sm font-semibold text-green-700 hover:text-green-800 transition-colors">
          EXPORT
        </button>
      </div>
      <DataTable data={filteredRows} columns={columns} keyExtractor={(item) => item.id} />
    </div>
  );
};

