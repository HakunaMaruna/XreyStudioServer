'use client';
import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { useLang } from '../lib/i18n';
import { Icon } from './icons';
import { cn, EmptyState } from './ui';

export type ServerPagination = {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

type DataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  searchPlaceholder?: string;
  getRowId?: (row: T) => string;
  serverPagination?: ServerPagination;
  hideSearch?: boolean;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;
};

export default function DataTable<T>({
  data,
  columns,
  loading = false,
  searchPlaceholder,
  getRowId,
  serverPagination,
  hideSearch = false,
  sorting: controlledSorting,
  onSortingChange: controlledOnSortingChange,
  manualSorting = false,
}: DataTableProps<T>) {
  const { t } = useLang();
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const sorting = controlledSorting ?? internalSorting;

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    if (controlledOnSortingChange) controlledOnSortingChange(updater);
    else setInternalSorting(updater);
  };

  const pagination = serverPagination
    ? { pageIndex: serverPagination.pageIndex, pageSize: serverPagination.pageSize }
    : undefined;

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    if (!serverPagination) return;
    const next =
      typeof updater === 'function'
        ? updater({ pageIndex: serverPagination.pageIndex, pageSize: serverPagination.pageSize })
        : updater;
    serverPagination.onPageChange(next.pageIndex);
    serverPagination.onPageSizeChange?.(next.pageSize);
  };

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, ...(pagination ? { pagination } : {}) },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: setGlobalFilter,
    ...(serverPagination ? { onPaginationChange: handlePaginationChange } : {}),
    manualPagination: Boolean(serverPagination),
    manualSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(serverPagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    initialState: { pagination: { pageSize: 10 } },
    ...(getRowId ? { getRowId } : {}),
  });

  const rows = table.getRowModel().rows;
  const colCount = useMemo(() => columns.length, [columns]);
  const pageCount = serverPagination ? serverPagination.pageCount : table.getPageCount();
  const pageIndex = serverPagination ? serverPagination.pageIndex : table.getState().pagination.pageIndex;

  return (
    <div className="space-y-3">
      {!hideSearch && (
        <div className="relative max-w-sm">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder || t.search}
            className="form-control ps-5"
          />
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="table-responsive">
          <table className="table table-vcenter card-table">
            <thead>
              <tr>
                {table.getHeaderGroups().map((headerGroup) =>
                  headerGroup.headers.map((header) => (
                    <th key={header.id} className="text-uppercase text-muted">
                      {header.column.getCanSort() ? (
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          className="btn btn-sm btn-ghost text-uppercase text-muted"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className={cn('transition-transform', header.column.getIsSorted() ? 'text-brand' : 'text-subtle/50')}>
                            {header.column.getIsSorted() === 'asc' ? (
                              <Icon name="chevronDown" size={12} className="rotate-180" />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <Icon name="chevronDown" size={12} />
                            ) : (
                              <Icon name="sliders" size={12} />
                            )}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="py-5 text-center text-muted" colSpan={colCount}>
                    <div className="flex items-center justify-center gap-2 text-xs text-muted">
                      <Icon name="refresh" size={15} className="animate-spin text-brand" />
                      {t.loading}
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="p-0" colSpan={colCount}>
                    <EmptyState title={t.noData} description="Try adjusting your filters or create a new record." />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="animate-fade-in">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="text-muted">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-1 text-xs text-muted">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="btn btn-sm btn-outline-secondary"
            aria-label={t.previous}
          >
            <Icon name="chevronLeft" size={15} />
          </button>
          <span className="px-2 tabular-nums">
            {t.page} <span className="font-medium text-fg">{pageIndex + 1}</span> {t.of} {pageCount || 1}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="btn btn-sm btn-outline-secondary"
            aria-label={t.next}
          >
            <Icon name="chevronRight" size={15} />
          </button>
        </div>
        {serverPagination?.onPageSizeChange && (
          <label className="ml-auto flex items-center gap-2">
            <span className="text-subtle">{t.pageSize}</span>
            <select
              value={serverPagination.pageSize}
              onChange={(e) => serverPagination.onPageSizeChange?.(Number(e.target.value))}
              className="form-select w-auto"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
