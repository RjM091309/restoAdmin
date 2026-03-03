import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ColumnDef<T> {
  header: string;
  accessorKey?: keyof T;
  render?: (item: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (item: T) => string | number;
  onRowClick?: (item: T) => void;
}

export function DataTable<T>({ data, columns, keyExtractor, onRowClick }: DataTableProps<T>) {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [perPageOpen, setPerPageOpen] = useState(false);

  // Pagination logic
  const totalPages = Math.ceil(data.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = data.slice(startIndex, endIndex);

  // Build compact page list with ellipsis when there are many pages
  type PageItem =
    | { type: 'page'; page: number }
    | { type: 'ellipsis'; key: string };

  const pageItems: PageItem[] = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => ({
        type: 'page' as const,
        page: i + 1,
      }));
    }

    const items: PageItem[] = [];
    const addPage = (p: number) => items.push({ type: 'page', page: p });
    const addEllipsis = (key: string) =>
      items.push({ type: 'ellipsis', key });

    const firstPage = 1;
    const lastPage = totalPages;

    addPage(firstPage);

    const neighbours = 1; // pages to show on each side of current
    let start = Math.max(currentPage - neighbours, 2);
    let end = Math.min(currentPage + neighbours, lastPage - 1);

    // Adjust window when close to the start
    if (currentPage <= 3) {
      start = 2;
      end = 4;
    }

    // Adjust window when close to the end
    if (currentPage >= lastPage - 2) {
      start = lastPage - 3;
      end = lastPage - 1;
    }

    if (start > 2) {
      addEllipsis('left');
    }

    for (let p = start; p <= end; p += 1) {
      addPage(p);
    }

    if (end < lastPage - 1) {
      addEllipsis('right');
    }

    addPage(lastPage);

    return items;
  }, [currentPage, totalPages]);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden w-full">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white border-b border-gray-100">
              {columns.map((col, i) => (
                <th
                  key={col.header}
                  className={cn(
                    "px-6 py-4 text-[13px] font-medium whitespace-nowrap",
                    i === 0 ? "bg-violet-50 text-brand-text uppercase tracking-wider" : "text-brand-muted uppercase tracking-wider",
                    col.className,
                    col.headerClassName,
                    i === 0 && "border-r-[3px] border-white"
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {currentData.map((item) => (
              <tr
                key={keyExtractor(item)}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={cn(
                  "group transition-colors",
                  onRowClick ? "cursor-pointer" : ""
                )}
              >
                {columns.map((col, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-6 py-4 text-sm text-brand-text",
                      i === 0 ? "bg-violet-50 font-medium group-hover:bg-violet-100" : "bg-white group-hover:bg-brand-bg/50",
                      col.className,
                      col.cellClassName,
                      i === 0 && "border-r-[3px] border-white"
                    )}
                  >
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
                  {t('datatable.no_data')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Container */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white">
        <div className="flex items-center gap-4 text-sm text-brand-muted">
          <span>{t('datatable.show')}</span>
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
                        "w-full text-left px-3 py-1.5 text-sm hover:bg-brand-primary/5 transition-colors",
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
          <span>{t('datatable.entries')}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-brand-muted mr-4">
            {t('datatable.showing_info', {
              from: data.length > 0 ? startIndex + 1 : 0,
              to: Math.min(endIndex, data.length),
              total: data.length
            })}
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
              {pageItems.map((item) =>
                item.type === 'ellipsis' ? (
                  <span
                    key={item.key}
                    className="w-8 h-8 flex items-center justify-center text-xs text-brand-muted"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={item.page}
                    onClick={() => setCurrentPage(item.page)}
                    className={cn(
                      "min-w-8 h-8 px-2 rounded-lg flex items-center justify-center font-medium transition-all text-xs",
                      currentPage === item.page
                        ? "bg-brand-primary text-white shadow-md shadow-brand-primary/20"
                        : "text-brand-muted hover:bg-gray-100 hover:text-brand-text"
                    )}
                  >
                    {item.page}
                  </button>
                )
              )}
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
