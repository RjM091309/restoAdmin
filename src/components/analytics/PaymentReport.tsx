import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { Search } from 'lucide-react';
import { type Branch } from '../partials/Header';
import { DataTable, type ColumnDef } from '../ui/DataTable';

type PaymentReportProps = {
  selectedBranch: Branch | null;
  dateRange: {
    start: string;
    end: string;
  };
};

type PaymentReportRow = {
  id: string;
  paymentMethod: string;
  paymentTransaction: number;
  paymentAmount: number;
  refundTransaction: number;
  refundAmount: number;
  netAmount: number;
};

const MOCK_PAYMENT_REPORT_BASE: Omit<PaymentReportRow, 'id'>[] = [
  { paymentMethod: 'Gcash', paymentTransaction: 247, paymentAmount: 841544, refundTransaction: 0, refundAmount: 0, netAmount: 841544 },
  { paymentMethod: 'Debt', paymentTransaction: 3, paymentAmount: 17120, refundTransaction: 0, refundAmount: 0, netAmount: 17120 },
  { paymentMethod: 'Cash', paymentTransaction: 1261, paymentAmount: 4659163.2, refundTransaction: 5, refundAmount: 1310, netAmount: 4657853.2 },
];

export const PaymentReport: React.FC<PaymentReportProps> = ({ selectedBranch, dateRange }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const money = (value: number) =>
    `${t('common.currency_symbol')}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const headerTextClass = 'text-[13px] font-medium whitespace-nowrap bg-white';
  const bodyTextClass = 'text-sm text-brand-text bg-white group-hover:bg-brand-bg/50';
  const methodHeaderClass = 'text-[13px] font-medium whitespace-nowrap bg-violet-50';
  const methodBodyClass = 'text-sm text-brand-text font-medium bg-violet-50 group-hover:bg-violet-100';

  const rows = useMemo(() => {
    const branchMultiplierById: Record<string, number> = {
      all: 1,
      '1': 1,
      '2': 0.91,
      '3': 0.84,
    };
    const multiplier = branchMultiplierById[String(selectedBranch?.id || 'all')] || 0.88;

    const computedRows = MOCK_PAYMENT_REPORT_BASE.map((row, index) => {
      const paymentTransaction = Math.max(0, Math.round(row.paymentTransaction * multiplier));
      const paymentAmount = Math.max(0, Number((row.paymentAmount * multiplier).toFixed(2)));
      const refundTransaction = Math.max(0, Math.round(row.refundTransaction * multiplier));
      const refundAmount = Math.max(0, Number((row.refundAmount * multiplier).toFixed(2)));
      const netAmount = Math.max(0, Number((paymentAmount - refundAmount).toFixed(2)));
      return {
        id: `${String(selectedBranch?.id || 'all')}-${index + 1}`,
        paymentMethod: row.paymentMethod,
        paymentTransaction,
        paymentAmount,
        refundTransaction,
        refundAmount,
        netAmount,
      };
    });

    const total = computedRows.reduce(
      (acc, row) => ({
        paymentTransaction: acc.paymentTransaction + row.paymentTransaction,
        paymentAmount: Number((acc.paymentAmount + row.paymentAmount).toFixed(2)),
        refundTransaction: acc.refundTransaction + row.refundTransaction,
        refundAmount: Number((acc.refundAmount + row.refundAmount).toFixed(2)),
        netAmount: Number((acc.netAmount + row.netAmount).toFixed(2)),
      }),
      { paymentTransaction: 0, paymentAmount: 0, refundTransaction: 0, refundAmount: 0, netAmount: 0 }
    );

    return [
      ...computedRows,
      {
        id: `${String(selectedBranch?.id || 'all')}-total`,
        paymentMethod: 'total',
        paymentTransaction: total.paymentTransaction,
        paymentAmount: total.paymentAmount,
        refundTransaction: total.refundTransaction,
        refundAmount: total.refundAmount,
        netAmount: total.netAmount,
      },
    ];
  }, [selectedBranch?.id, dateRange.end, dateRange.start]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => row.paymentMethod.toLowerCase().includes(keyword));
  }, [rows, searchTerm]);

  const columns: ColumnDef<PaymentReportRow>[] = [
    {
      header: t('payment_report.columns.payment_method'),
      accessorKey: 'paymentMethod',
      className: 'min-w-[220px] border-r border-gray-200',
      headerClassName: methodHeaderClass,
      cellClassName: methodBodyClass,
      render: (item) => (
        <span className={item.paymentMethod.toLowerCase() === 'total' ? 'font-bold' : ''}>
          {item.paymentMethod.toLowerCase() === 'total' ? t('payment_report.total') : item.paymentMethod}
        </span>
      ),
    },
    {
      header: t('payment_report.columns.payment_transaction'),
      className: 'min-w-[170px] text-right',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
      render: (item) => (
        <span className={item.paymentMethod.toLowerCase() === 'total' ? 'font-bold' : ''}>
          {item.paymentTransaction.toLocaleString()}
        </span>
      ),
    },
    {
      header: t('payment_report.columns.payment_amount'),
      className: 'min-w-[170px] text-right',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
      render: (item) => (
        <span className={item.paymentMethod.toLowerCase() === 'total' ? 'font-bold' : ''}>
          {money(item.paymentAmount)}
        </span>
      ),
    },
    {
      header: t('payment_report.columns.refund_transaction'),
      className: 'min-w-[170px] text-right',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
      render: (item) => (
        <span className={item.paymentMethod.toLowerCase() === 'total' ? 'font-bold' : ''}>
          {item.refundTransaction.toLocaleString()}
        </span>
      ),
    },
    {
      header: t('payment_report.columns.refund_amount'),
      className: 'min-w-[150px] text-right',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
      render: (item) => (
        <span className={item.paymentMethod.toLowerCase() === 'total' ? 'font-bold' : ''}>
          {money(item.refundAmount)}
        </span>
      ),
    },
    {
      header: t('payment_report.columns.net_amount'),
      className: 'min-w-[150px] text-right',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
      render: (item) => (
        <span className={item.paymentMethod.toLowerCase() === 'total' ? 'font-bold' : ''}>
          {money(item.netAmount)}
        </span>
      ),
    },
  ];

  // --- Export Function ---
  const handleExport = () => {
    // 1. Create data rows for Excel
    const data = filteredRows.map(row => {
      const pmLabel = row.paymentMethod.toLowerCase() === 'total' ? t('payment_report.total') : row.paymentMethod;
      return {
        [t('payment_report.columns.payment_method')]: pmLabel,
        [t('payment_report.columns.payment_transaction')]: row.paymentTransaction.toLocaleString(),
        [t('payment_report.columns.payment_amount')]: money(row.paymentAmount),
        [t('payment_report.columns.refund_transaction')]: row.refundTransaction.toLocaleString(),
        [t('payment_report.columns.refund_amount')]: money(row.refundAmount),
        [t('payment_report.columns.net_amount')]: money(row.netAmount),
      };
    });

    // 2. Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 3. Set column widths
    worksheet['!cols'] = [
      { wch: 25 }, // Payment Method
      { wch: 20 }, // Payment Transaction
      { wch: 20 }, // Payment Amount
      { wch: 20 }, // Refund Transaction
      { wch: 20 }, // Refund Amount
      { wch: 20 }, // Net Amount
    ];

    // 4. Create workbook and add worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payment Report');

    // 5. Generate descriptive filename
    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `payment_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.xlsx`;

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
            placeholder={t('payment_report.search_placeholder')}
            className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
          />
        </div>
        <button type="button" onClick={handleExport} className="text-sm font-semibold text-green-700 hover:text-green-800 transition-colors flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          {t('payment_report.export')}
        </button>
      </div>
      <DataTable data={filteredRows} columns={columns} keyExtractor={(item) => item.id} />
    </div>
  );
};

