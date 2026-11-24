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
import { useUiMode } from '../lib/ui-mode';
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
  const ui = useUiMode();
  const lte = ui === 'adminlte';
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
    <div className={lte ? '' : 'space-y-3'}>
      {!hideSearch && (
        <div className={lte ? 'mb-3' : 'relative max-w-sm'}>
          {!lte && <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />}
          <input
            aria-label={searchPlaceholder || t.search}
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder || t.search}
            className={lte ? 'form-control' : 'field pl-9'}
          />
        </div>
      )}

      <div className={lte ? 'card' : 'panel overflow-hidden p-0'}>
        <p className={lte ? 'small text-muted border-bottom px-3 py-2 d-md-none' : 'border-b border-line px-4 py-2 text-[11px] text-subtle md:hidden'}>{t.scrollHint}</p>
        <div className={lte ? 'table-responsive' : 'overflow-x-auto'}>
          <table className={lte ? 'table table-striped table-hover w-100 mb-0' : 'w-full text-left text-sm'}>
            <thead>
              <tr className={lte ? '' : 'border-b border-line bg-surface-2/70'}>
                {table.getHeaderGroups().map((headerGroup) =>
                  headerGroup.headers.map((header) => (
                    <th key={header.id} className={lte ? 'text-uppercase small' : 'whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle'}>
                      {header.column.getCanSort() ? (
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          className={lte ? 'btn btn-link btn-sm p-0 text-decoration-none' : 'inline-flex items-center gap-1.5 transition-colors hover:text-fg'}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className={lte ? '' : cn('transition-transform', header.column.getIsSorted() ? 'text-brand' : 'text-subtle/50')}>
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
            <tbody className={lte ? '' : 'divide-y divide-line/70'}>
              {loading ? (
                <tr>
                  <td className="px-4 py-10" colSpan={colCount}>
                    <div className="flex items-center justify-center gap-2 text-xs text-muted">
                      <Icon name="refresh" size={15} className="animate-spin text-brand" />
                      {t.loading}
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4" colSpan={colCount}>
                    <EmptyState title={t.noData} description="Try adjusting your filters or create a new record." />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={lte ? '' : 'animate-fade-in group transition-colors hover:bg-surface-2/60'}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={lte ? 'text-nowrap' : 'whitespace-nowrap px-4 py-3 text-[13px] text-muted group-hover:text-fg'}>
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

      <div className={lte ? 'd-flex flex-wrap align-items-center gap-2 small text-muted mt-2' : 'flex flex-wrap items-center gap-3 px-1 text-xs text-muted'}>
        <div className={lte ? 'btn-group' : 'flex items-center gap-1.5'}>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className={lte ? 'btn btn-sm btn-outline-secondary' : 'grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-brand/40 hover:text-fg disabled:opacity-30'}
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
            className={lte ? 'btn btn-sm btn-outline-secondary' : 'grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-brand/40 hover:text-fg disabled:opacity-30'}
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
              className={lte ? 'form-select form-select-sm w-auto' : 'field w-auto py-1'}
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
