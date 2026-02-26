import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { type Branch } from '../partials/Header';
import { DataTable, type ColumnDef } from '../ui/DataTable';

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

const money = (value: number) =>
  `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MOCK_RECEIPT_BASE: Omit<ReceiptReportRow, 'id'>[] = [
  { receiptNumber: '1-37301', date: '26 Feb 2026 14:06', employee: 'Operator', customer: '—', type: 'sale', total: 1860 },
  { receiptNumber: '1-37300', date: '26 Feb 2026 14:04', employee: 'Operator', customer: '—', type: 'sale', total: 1900 },
  { receiptNumber: '1-37299', date: '26 Feb 2026 13:54', employee: 'Operator', customer: '—', type: 'sale', total: 380 },
  { receiptNumber: '1-37298', date: '26 Feb 2026 13:30', employee: 'Operator', customer: '—', type: 'sale', total: 3040 },
  { receiptNumber: '1-37297', date: '26 Feb 2026 13:03', employee: 'Operator', customer: '—', type: 'sale', total: 5240 },
  { receiptNumber: '1-37296', date: '26 Feb 2026 12:10', employee: 'Operator', customer: '—', type: 'sale', total: 1480 },
  { receiptNumber: '1-37295', date: '26 Feb 2026 09:33', employee: 'Operator', customer: '—', type: 'refund', total: 6700 },
  { receiptNumber: '1-37294', date: '26 Feb 2026 09:00', employee: 'Operator', customer: '—', type: 'refund', total: 8030 },
  { receiptNumber: '1-37293', date: '26 Feb 2026 07:33', employee: 'Operator', customer: '—', type: 'sale', total: 32900 },
  { receiptNumber: '1-37292', date: '26 Feb 2026 07:27', employee: 'Operator', customer: '—', type: 'sale', total: 380 },
];

const MOCK_RECEIPT_DETAIL_MAP: Record<string, ReceiptDetail> = {
  '1-37300': {
    orderLabel: 'order: Table 9',
    staff: 'Operator',
    pos: 'POS 1',
    serviceType: 'Dine in',
    paymentMethod: 'Gcash',
    transactionNo: '№ 1-37300',
    items: [
      { name: 'Basic Meat Setting 1', qty: 1, unitPrice: 0, amount: 0 },
      { name: 'B1 Galbi살', qty: 1, unitPrice: 800, amount: 800 },
      { name: 'B2 LA Galbi', qty: 1, unitPrice: 950, amount: 950 },
      { name: 'A2 Gyeran jjim(steam egg)', qty: 1, unitPrice: 150, amount: 150, note: 'No salt just pepper' },
    ],
  },
};

export const ReceiptReport: React.FC<ReceiptReportProps> = ({ selectedBranch, dateRange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'sale' | 'refund'>('all');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptReportRow | null>(null);
  const headerTextClass = 'text-[13px] font-medium whitespace-nowrap bg-white';
  const bodyTextClass = 'text-sm text-brand-text bg-white group-hover:bg-brand-bg/50';
  const receiptHeaderClass = 'text-[13px] font-medium whitespace-nowrap bg-violet-50';
  const receiptBodyClass = 'text-sm text-brand-text bg-violet-50 group-hover:bg-violet-100';

  const rows = useMemo(() => {
    const branchMultiplierById: Record<string, number> = {
      all: 1,
      '1': 1,
      '2': 0.91,
      '3': 0.84,
    };
    const multiplier = branchMultiplierById[String(selectedBranch?.id || 'all')] || 0.88;

    return MOCK_RECEIPT_BASE.map((row, index) => ({
      id: `${String(selectedBranch?.id || 'all')}-${index + 1}`,
      receiptNumber: row.receiptNumber,
      date: row.date,
      employee: row.employee,
      customer: row.customer,
      type: row.type,
      total: Number((row.total * multiplier).toFixed(2)),
    }));
  }, [selectedBranch?.id, dateRange.end, dateRange.start]);

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
    if (!selectedReceipt) return null;
    const byNumber = MOCK_RECEIPT_DETAIL_MAP[selectedReceipt.receiptNumber];
    if (byNumber) return byNumber;
    return {
      orderLabel: 'order: Table 1',
      staff: selectedReceipt.employee,
      pos: 'POS 1',
      serviceType: 'Dine in',
      paymentMethod: 'Cash',
      transactionNo: `№ ${selectedReceipt.receiptNumber}`,
      items: [
        {
          name: 'Sample Item',
          qty: 1,
          unitPrice: selectedReceipt.total,
          amount: selectedReceipt.total,
        },
      ],
    } as ReceiptDetail;
  }, [selectedReceipt]);

  const columns: ColumnDef<ReceiptReportRow>[] = [
    {
      header: 'Receipt number',
      accessorKey: 'receiptNumber',
      className: 'min-w-[160px] border-r border-gray-200',
      headerClassName: receiptHeaderClass,
      cellClassName: receiptBodyClass,
    },
    {
      header: 'date',
      accessorKey: 'date',
      className: 'min-w-[200px]',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
    },
    {
      header: 'employee',
      accessorKey: 'employee',
      className: 'min-w-[140px]',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
    },
    {
      header: 'customer',
      accessorKey: 'customer',
      className: 'min-w-[130px]',
      headerClassName: headerTextClass,
      cellClassName: bodyTextClass,
    },
    {
      header: 'type',
      accessorKey: 'type',
      className: 'min-w-[110px]',
      headerClassName: headerTextClass,
      cellClassName: `${bodyTextClass} font-medium`,
    },
    {
      header: 'total',
      className: 'min-w-[130px] text-right',
      headerClassName: headerTextClass,
      cellClassName: `${bodyTextClass} text-right`,
      render: (item) => money(item.total),
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
            placeholder="Search receipt number..."
            className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
          />
        </div>
        <button type="button" className="text-sm font-semibold text-green-700 hover:text-green-800 transition-colors">
          EXPORT
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`text-left rounded-2xl px-5 py-4 border shadow-sm transition-colors ${
            activeFilter === 'all'
              ? 'bg-brand-primary/5 border-brand-primary/40'
              : 'bg-white border-gray-100 hover:bg-gray-50'
          }`}
        >
          <p className="text-sm text-brand-muted mb-1">All Receipts</p>
          <p className="text-2xl font-bold text-brand-text">{allReceiptsCount.toLocaleString()}</p>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('sale')}
          className={`text-left rounded-2xl px-5 py-4 border shadow-sm transition-colors ${
            activeFilter === 'sale'
              ? 'bg-brand-primary/5 border-brand-primary/40'
              : 'bg-white border-gray-100 hover:bg-gray-50'
          }`}
        >
          <p className="text-sm text-brand-muted mb-1">Sale</p>
          <p className="text-2xl font-bold text-brand-text">{money(salesAmount)}</p>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('refund')}
          className={`text-left rounded-2xl px-5 py-4 border shadow-sm transition-colors ${
            activeFilter === 'refund'
              ? 'bg-brand-primary/5 border-brand-primary/40'
              : 'bg-white border-gray-100 hover:bg-gray-50'
          }`}
        >
          <p className="text-sm text-brand-muted mb-1">Refund Amount</p>
          <p className="text-2xl font-bold text-brand-text">{money(refundAmountTotal)}</p>
        </button>
      </div>
      <DataTable
        data={filteredRows}
        columns={columns}
        keyExtractor={(item) => item.id}
        onRowClick={(row) => setSelectedReceipt(row)}
      />
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
                      <p className="text-sm text-brand-muted mt-1">aggregate</p>
                    </div>

                    <div className="py-3 border-b border-gray-200 text-sm leading-6">
                      <p>{activeDetail.orderLabel}</p>
                      <p>Staff : {activeDetail.staff}</p>
                      <p>POS: {activeDetail.pos}</p>
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

                    <div className="py-3 border-b border-gray-200 space-y-1.5">
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>total</span>
                        <span>{money(selectedReceipt.total)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>{activeDetail.paymentMethod}</span>
                        <span>{money(selectedReceipt.total)}</span>
                      </div>
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

