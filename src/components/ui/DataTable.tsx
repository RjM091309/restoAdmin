import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ColumnDef<T> {
  header: string;
  accessorKey?: keyof T;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (item: T) => string | number;
}

export function DataTable<T>({ data, columns, keyExtractor }: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [perPageOpen, setPerPageOpen] = useState(false);

  // Pagination logic
  const totalPages = Math.ceil(data.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = data.slice(startIndex, endIndex);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden w-full">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-brand-muted font-bold uppercase tracking-wider bg-gray-50/50">
              {columns.map((col, i) => (
                <th key={col.header} className={cn("px-6 py-4", col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {currentData.map((item) => (
              <tr key={keyExtractor(item)} className="hover:bg-brand-bg/50 transition-colors">
                {columns.map((col, i) => (
                  <td key={i} className={cn("px-6 py-4", col.className)}>
                    {col.render
                      ? col.render(item)
                      : col.accessorKey
                      ? (item[col.accessorKey] as React.ReactNode)
                      : null}
                  </td>
                ))}
              </tr>
            ))}
            {currentData.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-8 text-center text-brand-muted">
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Container */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white">
        <div className="flex items-center gap-4 text-sm text-brand-muted">
          <span>Show</span>
          <div className="relative">
            <button
              onClick={() => setPerPageOpen(!perPageOpen)}
              className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-brand-orange/30 transition-all text-brand-text font-medium min-w-[60px] justify-between"
            >
              {itemsPerPage}
              <ChevronDown
                size={14}
                className={cn("text-brand-muted transition-transform", perPageOpen && "rotate-180")}
              />
            </button>

            {perPageOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPerPageOpen(false)} />
                <div className="absolute bottom-full left-0 mb-1 w-full bg-white border border-gray-100 rounded-lg shadow-lg z-20 py-1 overflow-hidden">
                  {[50, 100, 150, 200].map((num) => (
                    <button
                      key={num}
                      onClick={() => {
                        setItemsPerPage(num);
                        setCurrentPage(1); // Reset to first page
                        setPerPageOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-sm hover:bg-brand-orange/5 transition-colors",
                        itemsPerPage === num
                          ? "text-brand-orange font-bold bg-brand-orange/5"
                          : "text-brand-text"
                      )}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <span>entries</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-brand-muted mr-4">
            Showing {data.length > 0 ? startIndex + 1 : 0} to {Math.min(endIndex, data.length)} of {data.length} entries
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || data.length === 0}
              className="p-1.5 rounded-lg text-brand-muted hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center font-medium transition-all",
                    currentPage === page
                      ? "bg-brand-orange text-white shadow-md shadow-brand-orange/20"
                      : "text-brand-muted hover:bg-gray-100 hover:text-brand-text"
                  )}
                >
                  {page}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || data.length === 0}
              className="p-1.5 rounded-lg text-brand-muted hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
