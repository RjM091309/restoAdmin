import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { Search, X } from 'lucide-react';
import { type Branch } from '../partials/Header';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { Skeleton } from '../ui/Skeleton';
import {
  fetchReceiptReportApi,
  fetchReceiptDetailApi,
  type ApiReceiptReportRow,
  type ApiReceiptDetail,
} from '../../services/analyticsService';

type ReceiptReportProps = {
  selectedBranch: Branch | null;
  dateRange: {
    start: string;
    end: string;
  };
};

type ReceiptReportRow = {
  id: string;
  receiptNumber: string;
  date: string;
  employee: string;
  customer: string;
  type: string;
  total: number;
};

type ReceiptLineItem = {
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
  note?: string;
};

type ReceiptDetail = {
  orderLabel: string;
  staff: string;
  pos: string;
  serviceType: string;
  paymentMethod: string;
  transactionNo: string;
  items: ReceiptLineItem[];
};

const MOCK_RECEIPT_BASE: Omit<ReceiptReportRow, 'id'>[] = [];

export const ReceiptReport: React.FC<ReceiptReportProps> = ({ selectedBranch, dateRange }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'sale' | 'refund'>('all');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptReportRow | null>(null);
  const [receiptDetail, setReceiptDetail] = useState<ReceiptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const money = (value: number) =>
    `${t('common.currency_symbol')}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const headerTextClass = 'text-[13px] font-medium whitespace-nowrap bg-white';
  const bodyTextClass = 'text-sm text-brand-text bg-white group-hover:bg-brand-bg/50';
  const receiptHeaderClass = 'text-[13px] font-medium whitespace-nowrap bg-violet-50';
  const receiptBodyClass = 'text-sm text-brand-text bg-violet-50 group-hover:bg-violet-100';

  const [rows, setRows] = useState<ReceiptReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setReportLoading(true);
      const params = new URLSearchParams();
      if (dateRange.start) params.set('start_date', dateRange.start);
      if (dateRange.end) params.set('end_date', dateRange.end);
      if (selectedBranch && String(selectedBranch.id) !== 'all') {
        params.set('branch_id', String(selectedBranch.id));
      }
      if (activeFilter !== 'all') {
        params.set('type', activeFilter);
      }
      try {
        const apiRows: ApiReceiptReportRow[] = await fetchReceiptReportApi(params);
        setRows(
          apiRows.map((row) => ({
            id: String(row.id),
            receiptNumber: row.receiptNumber,
            date: row.date,
            employee: row.employee,
            customer: row.customer,
            type: row.type,
            total: row.total,
          }))
        );
      } catch (err) {
        console.error('Failed to load receipt report', err);
        setRows([]);
      } finally {
        setReportLoading(false);
      }
    };

    void load();
  }, [dateRange.start, dateRange.end, selectedBranch?.id, activeFilter]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const byType = rows.filter((row) => {
      if (activeFilter === 'all') return true;
      return row.type.toLowerCase() === activeFilter;
    });
    if (!keyword) return byType;
    return byType.filter(
      (row) =>
        row.receiptNumber.toLowerCase().includes(keyword) ||
        row.employee.toLowerCase().includes(keyword) ||
        row.type.toLowerCase().includes(keyword)
    );
  }, [rows, searchTerm, activeFilter]);

  const allReceiptsCount = useMemo(
    () => rows.length,
    [rows]
  );
  const allReceiptsAmount = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.total || 0), 0),
    [rows]
  );
  const salesAmount = useMemo(
    () =>
      rows
        .filter((row) => row.type.toLowerCase() === 'sale')
        .reduce((sum, row) => sum + Number(row.total || 0), 0),
    [rows]
  );
  const refundAmountTotal = useMemo(
    () =>
      rows
        .filter((row) => row.type.toLowerCase() === 'refund')
        .reduce((sum, row) => sum + Number(row.total || 0), 0),
    [rows]
  );
  const activeDetail = useMemo(() => {
    if (!selectedReceipt || !receiptDetail) return null;
    return receiptDetail;
  }, [selectedReceipt, receiptDetail]);

  const columns: ColumnDef<ReceiptReportRow>[] = [
    {
      header: t('receipt_report.columns.receipt_number'),
      accessorKey: 'receiptNumber',
      className: 'min-w-[160px] border-r border-gray-200',
      headerClassName: receiptHeaderClass,
      cellClassName: receiptBodyClass,
    },
    {
      header: t('receipt_report.columns.date'),
      accessorKey: 'date',
      className: 'min-w-[200px]',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
    },
    {
      header: t('receipt_report.columns.employee'),
      accessorKey: 'employee',
      className: 'min-w-[140px]',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
    },
    {
      header: t('receipt_report.columns.customer'),
      accessorKey: 'customer',
      className: 'min-w-[130px]',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
    },
    {
      header: t('receipt_report.columns.type'),
      accessorKey: 'type',
      className: 'min-w-[110px]',
      headerClassName: headerTextClass,
      cellClassName: `${bodyTextClass} font-medium`,
      render: (item) => (item.type.toLowerCase() === 'refund' ? t('receipt_report.type_refund') : t('receipt_report.type_sale')),
    },
    {
      header: t('receipt_report.columns.total'),
      className: 'min-w-[130px] text-right',
      headerClassName: headerTextClass,
      cellClassName: `${bodyTextClass} text-right`,
      render: (item) => money(item.total),
    },
  ];

  // --- Export Function ---
  const handleExport = () => {
    // 1. Create data rows for Excel
    const data = filteredRows.map(row => {
      const typeLabel = row.type.toLowerCase() === 'refund' ? t('receipt_report.type_refund') : t('receipt_report.type_sale');
      return {
        [t('receipt_report.columns.receipt_number')]: row.receiptNumber,
        [t('receipt_report.columns.date')]: row.date,
        [t('receipt_report.columns.employee')]: row.employee,
        [t('receipt_report.columns.customer')]: row.customer,
        [t('receipt_report.columns.type')]: typeLabel,
        [t('receipt_report.columns.total')]: money(row.total),
      };
    });

    // 2. Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 3. Set column widths
    worksheet['!cols'] = [
      { wch: 18 }, // Receipt Number
      { wch: 20 }, // Date
      { wch: 20 }, // Employee
      { wch: 18 }, // Customer
      { wch: 15 }, // Type
      { wch: 18 }, // Total
    ];

    // 4. Create workbook and add worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Receipt Report');

    // 5. Generate descriptive filename
    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `receipt_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.xlsx`;

    // 6. Download the file
    XLSX.writeFile(workbook, filename);
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
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
                  placeholder={t('receipt_report.search_placeholder')}
                  className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                />
              </div>
              <button type="button" onClick={handleExport} className="text-sm font-semibold text-green-700 hover:text-green-800 transition-colors flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                {t('receipt_report.export')}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`text-left rounded-2xl px-5 py-4 border shadow-sm transition-colors ${activeFilter === 'all'
                  ? 'bg-brand-primary/5 border-brand-primary/40'
                  : 'bg-white border-gray-100 hover:bg-gray-50'
                  }`}
              >
                <p className="text-sm text-brand-muted mb-1">{t('receipt_report.filter_all_receipts')}</p>
                <p className="text-2xl font-bold text-brand-text">{allReceiptsCount.toLocaleString()}</p>
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('sale')}
                className={`text-left rounded-2xl px-5 py-4 border shadow-sm transition-colors ${activeFilter === 'sale'
                  ? 'bg-brand-primary/5 border-brand-primary/40'
                  : 'bg-white border-gray-100 hover:bg-gray-50'
                  }`}
              >
                <p className="text-sm text-brand-muted mb-1">{t('receipt_report.filter_sale')}</p>
                <p className="text-2xl font-bold text-brand-text">{money(salesAmount)}</p>
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('refund')}
                className={`text-left rounded-2xl px-5 py-4 border shadow-sm transition-colors ${activeFilter === 'refund'
                  ? 'bg-brand-primary/5 border-brand-primary/40'
                  : 'bg-white border-gray-100 hover:bg-gray-50'
                  }`}
              >
                <p className="text-sm text-brand-muted mb-1">{t('receipt_report.filter_refund_amount')}</p>
                <p className="text-2xl font-bold text-brand-text">{money(refundAmountTotal)}</p>
              </button>
            </div>
            <DataTable
        data={filteredRows}
        columns={columns}
        keyExtractor={(item) => item.id}
        onRowClick={async (row) => {
          setSelectedReceipt(row);
          setReceiptDetail(null);
          setDetailError(null);
          setDetailLoading(true);
          try {
            const detail: ApiReceiptDetail = await fetchReceiptDetailApi(row.id);
            setReceiptDetail({
              orderLabel: detail.orderLabel,
              staff: detail.staff,
              pos: detail.pos,
              serviceType: detail.serviceType,
              paymentMethod: detail.paymentMethod,
              transactionNo: detail.transactionNo,
              items: detail.items.map((item) => ({
                name: item.name,
                qty: item.qty,
                unitPrice: item.unitPrice,
                amount: item.amount,
                note: item.note ?? undefined,
              })),
            });
          } catch (error) {
            console.error('Failed to load receipt detail', error);
            setDetailError(t('receipt_report.detail_error'));
          } finally {
            setDetailLoading(false);
          }
        }}
      />
          </motion.div>
        )}
      </AnimatePresence>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {selectedReceipt && activeDetail && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSelectedReceipt(null)}
                  className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
                />
                <motion.aside
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-[70] flex flex-col"
                >
                  <div className="p-4 border-b border-gray-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedReceipt(null)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-brand-muted"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-5 text-brand-text">
                    <div className="text-center border-b border-gray-200 pb-3 pt-2">
                      <p className="text-[40px] leading-none tracking-tight">{money(selectedReceipt.total)}</p>
                      <p className="text-sm text-brand-muted mt-1">{t('receipt_report.detail_aggregate')}</p>
                    </div>

                    {!detailLoading && !activeDetail && (
                      <div className="py-6 text-center text-sm text-brand-muted">
                        {t('receipt_report.detail_no_items')}
                      </div>
                    )}

                    {detailLoading && (
                      <div className="py-6 text-center text-sm text-brand-muted">
                        {t('receipt_report.detail_loading')}
                      </div>
                    )}

                    {!detailLoading && activeDetail && (
                      <>
                        <div className="py-3 border-b border-gray-200 text-sm leading-6">
                          <p>{activeDetail.orderLabel}</p>
                          <p>{t('receipt_report.detail_staff')}: {activeDetail.staff}</p>
                          <p>{t('receipt_report.detail_pos')}: {activeDetail.pos}</p>
                        </div>

                        <div className="py-3 border-b border-gray-200">
                          <p className="text-sm font-semibold">{activeDetail.serviceType}</p>
                          <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                            {activeDetail.items.map((item, idx) => (
                              <div key={`${item.name}-${idx}`}>
                                <div className="flex items-center justify-between text-sm">
                                  <span>{item.name}</span>
                                  <span>{money(item.amount)}</span>
                                </div>
                                <p className="text-xs text-brand-muted">
                                  {item.qty} x {money(item.unitPrice)}
                                </p>
                                {item.note && <p className="text-xs italic text-brand-muted">{item.note}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="py-3 border-b border-gray-200 space-y-1.5">
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>{t('receipt_report.columns.total')}</span>
                        <span>{money(selectedReceipt.total)}</span>
                      </div>
                      {activeDetail && (
                        <div className="flex items-center justify-between text-sm">
                          <span>{activeDetail.paymentMethod}</span>
                          <span>{money(selectedReceipt.total)}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 flex items-center justify-between text-sm text-brand-muted">
                      <span>{selectedReceipt.date}</span>
                      <span>{activeDetail.transactionNo}</span>
                    </div>
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

