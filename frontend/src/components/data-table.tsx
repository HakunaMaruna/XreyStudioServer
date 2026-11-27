// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useMemo, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type Column,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { useLang } from '../lib/i18n';
import { Icon } from './icons';
import { cn, EmptyState, PaginationBar } from './ui';

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
  /** Total row count on the server, used for the footer counter. */
  total?: number;
  hideSearch?: boolean;
  /** Extra controls shown next to the search field (filters, scope selects). */
  filters?: ReactNode;
  /** Primary actions pinned to the right of the toolbar, like a list "Create" button. */
  actions?: ReactNode;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;
  /** Stretch the scroll area to the viewport so more rows fit without page scroll. */
  fillHeight?: boolean;
};

const DEFAULT_COLUMN_SIZE = 160;
const ROW_HEIGHT = 38;

function metaOf<T>(column: Column<T>) {
  return column.columnDef.meta ?? {};
}

/** Actions and selection never need a data column's width. */
function columnWidth<T>(column: Column<T>): number {
  if (column.columnDef.size) return column.columnDef.size;
  if (column.id === 'select') return 44;
  if (column.id === 'actions') return 140;
  return DEFAULT_COLUMN_SIZE;
}

function isBareCell<T>(column: Column<T>): boolean {
  return Boolean(metaOf(column).noTruncate) || column.id === 'actions' || column.id === 'select';
}

function headerLabel<T>(column: Column<T>): string {
  return typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;
}

function cellTitle<T>(cell: Cell<T, unknown>): string | undefined {
  const value = cell.getValue();
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return undefined;
}

export default function DataTable<T>({
  data,
  columns,
  loading = false,
  searchPlaceholder,
  getRowId,
  serverPagination,
  total,
  hideSearch = false,
  filters,
  actions,
  sorting: controlledSorting,
  onSortingChange: controlledOnSortingChange,
  manualSorting = false,
  fillHeight = false,
}: DataTableProps<T>) {
  const { t } = useLang();
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [showAllRows, setShowAllRows] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
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
    if (next.pageIndex !== serverPagination.pageIndex) serverPagination.onPageChange(next.pageIndex);
    if (next.pageSize !== serverPagination.pageSize) serverPagination.onPageSizeChange?.(next.pageSize);
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
    initialState: { pagination: { pageSize: 20 } },
    ...(getRowId ? { getRowId } : {}),
  });

  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const colCount = visibleColumns.length;
  const pageCount = serverPagination ? serverPagination.pageCount : table.getPageCount();
  const pageIndex = serverPagination ? serverPagination.pageIndex : table.getState().pagination.pageIndex;
  const pageSize = serverPagination ? serverPagination.pageSize : table.getState().pagination.pageSize;
  const filteredCount = serverPagination ? (total ?? data.length) : table.getFilteredRowModel().rows.length;

  const sizing = useMemo(() => {
    const total = visibleColumns.reduce((sum, column) => sum + columnWidth(column), 0) || 1;
    return { total, widths: visibleColumns.map((column) => (columnWidth(column) / total) * 100) };
  }, [visibleColumns]);

  const selectColumn = visibleColumns.find((column) => column.id === 'select');
  const actionsColumn = visibleColumns.find((column) => column.id === 'actions');
  const cardColumns = visibleColumns.filter((column) => {
    if (column.id === 'select' || column.id === 'actions') return false;
    return !metaOf(column).mobileHidden;
  });
  const primaryColumn = cardColumns[0];
  const detailColumns = cardColumns.slice(1);

  const changePageSize = (size: number) => {
    if (serverPagination) {
      serverPagination.onPageSizeChange?.(size);
      return;
    }
    setShowAllRows(size === 0);
    table.setPageSize(size === 0 ? Math.max(table.getFilteredRowModel().rows.length, 1) : size);
  };

  // Only client-side tables can render everything at once; server pages keep fixed limits.
  const pageSizeOptions = serverPagination ? [10, 20, 50, 100] : [20, 50, 100, 0];
  const pageSizeValue = serverPagination ? pageSize : showAllRows ? 0 : pageSize;

  const goToPage = (index: number) => {
    const lastIndex = Math.max(0, (pageCount || 1) - 1);
    const next = Math.min(Math.max(0, index), lastIndex);
    if (serverPagination) serverPagination.onPageChange(next);
    else table.setPageIndex(next);
  };

  const visibleDetailsFor = (rowId: string) => {
    const visibleCount = 3;
    if (expandedCards[rowId] || detailColumns.length <= visibleCount) return detailColumns;
    return detailColumns.slice(0, visibleCount);
  };

  return (
    <div className="space-y-3">
      <div className="panel overflow-hidden">
        <div className={cn('flex flex-wrap items-center gap-2 border-b border-line p-2.5', hideSearch && !filters && !actions && 'hidden')}>
          {!hideSearch && (
            <div className="relative w-full min-w-[180px] max-w-xs flex-1 sm:flex-none sm:w-72">
              <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                aria-label={searchPlaceholder || t.search}
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder || t.search}
                className="field pl-9"
              />
            </div>
          )}
          {filters}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
        <div
          className="overflow-auto overscroll-contain"
          style={fillHeight
            ? { height: 'calc(100dvh - 230px)', maxHeight: 'none' }
            : { maxHeight: `min(72dvh, ${Math.max(320, rows.length * ROW_HEIGHT + 96)}px)` }}
          tabIndex={0}
          role="region"
          aria-label="table"
        >
          <table className="w-full table-fixed border-collapse text-left text-[13px]" style={{ minWidth: 640 }}>
            <colgroup>
              {visibleColumns.map((column, index) => (
                <col key={column.id} style={{ width: `${sizing.widths[index].toFixed(3)}%` }} />
              ))}
            </colgroup>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="sticky top-0 z-10 border-b border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-muted"
                    >
                      {header.column.getCanSort() ? (
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex max-w-full items-center gap-1.5 truncate transition-colors hover:text-fg"
                        >
                          <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                          <span className={cn('shrink-0 transition-transform', header.column.getIsSorted() ? 'text-brand' : 'text-subtle/50')}>
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
                        <span className="block truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-line/70">
              {loading ? (
                Array.from({ length: 6 }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`}>
                    {visibleColumns.map((column, cellIndex) => (
                      <td key={`${column.id}-${cellIndex}`} className="px-3 py-2">
                        <div
                          className="h-3 animate-pulse rounded bg-surface-3"
                          style={{ width: cellIndex === 0 ? '55%' : `${68 + ((rowIndex + cellIndex) % 3) * 11}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4" colSpan={colCount}>
                    <EmptyState title={t.noData} description="Измените фильтры или создайте новую запись." />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="group h-[38px] transition-colors hover:bg-surface-2/70">
                    {row.getVisibleCells().map((cell) => {
                      const meta = metaOf(cell.column);
                      const align = meta.align === 'right' ? 'text-right' : meta.align === 'center' ? 'text-center' : '';
                      const bare = isBareCell(cell.column);
                      return (
                        <td key={cell.id} className={cn('min-w-0 px-3 py-2 text-muted align-middle group-hover:text-fg', align)}>
                          <div
                            className={cn('min-w-0', !bare && 'truncate')}
                            title={bare ? undefined : cellTitle(cell)}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={`card-skeleton-${index}`} className="panel space-y-3 p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 animate-pulse rounded-xl bg-surface-3" />
                <div className="h-3 w-2/5 animate-pulse rounded bg-surface-3" />
              </div>
              <div className="h-3 w-3/5 animate-pulse rounded bg-surface-3" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="panel">
            <EmptyState title={t.noData} description="Измените фильтры или создайте новую запись." />
          </div>
        ) : (
          rows.map((row) => {
            const cells = new Map(row.getVisibleCells().map((cell) => [cell.column.id, cell]));
            const selectCell = selectColumn ? cells.get('select') : undefined;
            const actionsCell = actionsColumn ? cells.get('actions') : undefined;
            const primaryCell = primaryColumn ? cells.get(primaryColumn.id) : undefined;
            return (
              <article key={row.id} className="panel p-3">
                <div className="flex items-start gap-2.5">
                  {selectCell && (
                    <div className="pt-1">{flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}</div>
                  )}
                  {primaryCell && (
                    <div className="min-w-0 flex-1 text-[13px] text-fg">
                      {flexRender(primaryCell.column.columnDef.cell, primaryCell.getContext())}
                    </div>
                  )}
                  {actionsCell && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}
                    </div>
                  )}
                </div>
                {detailColumns.length > 0 && (
                  <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-3 gap-y-1.5 border-t border-line/70 pt-2.5 text-[11px]">
                    {visibleDetailsFor(row.id).map((column) => {
                      const cell = cells.get(column.id);
                      if (!cell) return null;
                      const align = metaOf(column).align === 'right' ? 'justify-end' : '';
                      return (
                        <div key={column.id} className="contents">
                          <dt className="truncate text-subtle">{headerLabel(column)}</dt>
                          <dd className={cn('flex min-w-0 items-center gap-1 text-fg', align)}>
                            <div className="min-w-0 truncate">
                              {flexRender(column.columnDef.cell, cell.getContext())}
                            </div>
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
                {detailColumns.length > 3 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCards((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                    }
                    aria-expanded={Boolean(expandedCards[row.id])}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand"
                  >
                    {expandedCards[row.id]
                      ? t.hideExtraFields
                      : `${t.showAllFields} (+${detailColumns.length - 3})`}
                    <Icon
                      name="chevronDown"
                      size={12}
                      className={expandedCards[row.id] ? 'rotate-180' : ''}
                    />
                  </button>
                )}
              </article>
            );
          })
        )}
      </div>

      <PaginationBar
        pageIndex={pageIndex}
        pageCount={pageCount}
        total={filteredCount}
        rowsOnPage={rows.length}
        pageSize={pageSizeValue}
        pageSizeOptions={pageSizeOptions}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
        className="px-1"
      />
    </div>
  );
}
