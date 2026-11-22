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
        ? updater({
            pageIndex: serverPagination.pageIndex,
            pageSize: serverPagination.pageSize,
          })
        : updater;
    serverPagination.onPageChange(next.pageIndex);
    serverPagination.onPageSizeChange?.(next.pageSize);
  };

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      ...(pagination ? { pagination } : {}),
    },
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
        <input
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder || t.search}
          className="w-full max-w-sm rounded border px-3 py-2 dark:bg-gray-800"
        />
      )}
      <div className="overflow-x-auto rounded border bg-white dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 dark:bg-gray-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="p-2 text-left">
                    {header.column.getCanSort() ? (
                      <button onClick={header.column.getToggleSortingHandler()} className="font-medium">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc'
                          ? ' ↑'
                          : header.column.getIsSorted() === 'desc'
                            ? ' ↓'
                            : ''}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4" colSpan={colCount}>
                  {t.loading}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-4" colSpan={colCount}>
                  {t.noData}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          {t.previous}
        </button>
        <span>
          {t.page} {pageIndex + 1} {t.of} {pageCount || 1}
        </span>
        <button
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          {t.next}
        </button>
        {serverPagination?.onPageSizeChange && (
          <label className="ml-auto flex items-center gap-2">
            {t.pageSize}
            <select
              value={serverPagination.pageSize}
              onChange={(e) => serverPagination.onPageSizeChange?.(Number(e.target.value))}
              className="rounded border px-2 py-1 dark:bg-gray-800"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
