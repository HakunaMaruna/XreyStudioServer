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
};

const DEFAULT_COLUMN_SIZE = 160;
const ROW_HEIGHT = 44;

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

  // Numbered pages with gaps, so long lists stay navigable without a scrollbar.
  const pageButtons = useMemo(() => {
    const total = Math.max(1, pageCount || 1);
    const current = Math.min(pageIndex, total - 1);
    if (total <= 7) return Array.from({ length: total }, (_, index) => index) as Array<number | 'gap'>;
    const items: Array<number | 'gap'> = [0];
    const start = Math.max(1, current - 1);
    const end = Math.min(total - 2, current + 1);
    if (start > 1) items.push('gap');
    for (let index = start; index <= end; index += 1) items.push(index);
    if (end < total - 2) items.push('gap');
    items.push(total - 1);
    return items;
  }, [pageCount, pageIndex]);

  const rangeStart = rows.length ? pageIndex * pageSize + 1 : 0;
  const rangeEnd = rows.length ? pageIndex * pageSize + rows.length : 0;

  const visibleDetailsFor = (rowId: string) => {
    const visibleCount = 3;
    if (expandedCards[rowId] || detailColumns.length <= visibleCount) return detailColumns;
    return detailColumns.slice(0, visibleCount);
  };

  return (
    <div className="space-y-3">
      {(!hideSearch || filters || actions) && (
        <div className="flex flex-wrap items-center gap-2">
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
      )}

      {/* Desktop table */}
      <div className="panel hidden overflow-hidden p-0 lg:block">
        <div
          className="overflow-auto overscroll-contain"
          style={{ maxHeight: `min(72dvh, ${Math.max(320, rows.length * ROW_HEIGHT + 120)}px)` }}
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
                      className="sticky top-0 z-10 border-b border-line bg-surface-2 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle"
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
                      <td key={`${column.id}-${cellIndex}`} className="px-3 py-3">
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
                  <tr key={row.id} className="group h-11 transition-colors even:bg-surface-2/25 hover:bg-surface-2/70">
                    {row.getVisibleCells().map((cell) => {
                      const meta = metaOf(cell.column);
                      const align = meta.align === 'right' ? 'text-right' : meta.align === 'center' ? 'text-center' : '';
                      const bare = isBareCell(cell.column);
                      return (
                        <td key={cell.id} className={cn('min-w-0 px-3 py-2.5 text-muted align-middle group-hover:text-fg', align)}>
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

      {/* Mobile cards */}
      <div className="space-y-2 lg:hidden">
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
              <article key={row.id} className="panel p-3.5">
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

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted">
        <span className="tabular-nums">
          <span className="font-medium text-fg">{rangeStart}–{rangeEnd}</span> {t.of}{' '}
          <span className="font-medium text-fg">{filteredCount}</span>
        </span>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-subtle max-sm:hidden">{t.pageSize}</span>
            <select
              value={pageSizeValue}
              onChange={(e) => changePageSize(Number(e.target.value))}
              className="field w-auto py-1"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size === 0 ? t.all : size}</option>
              ))}
            </select>
          </label>

          <nav className="flex items-center gap-1" aria-label={t.page}>
            <button
              type="button"
              onClick={() => goToPage(pageIndex - 1)}
              disabled={pageIndex <= 0}
              className="ui-touch-target grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-brand/40 hover:text-fg disabled:opacity-30"
              aria-label={t.previous}
            >
              <Icon name="chevronLeft" size={15} />
            </button>

            {pageButtons.map((item, index) =>
              item === 'gap' ? (
                <span key={`gap-${index}`} className="px-0.5 text-subtle" aria-hidden="true">…</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => goToPage(item)}
                  aria-current={item === pageIndex ? 'page' : undefined}
                  aria-label={`${t.page} ${item + 1}`}
                  className={cn(
                    'ui-touch-target grid h-8 min-w-8 place-items-center rounded-lg border px-2 tabular-nums transition-colors',
                    item === pageIndex
                      ? 'border-brand/40 bg-brand/15 font-semibold text-brand'
                      : 'border-line bg-surface text-muted hover:border-brand/40 hover:text-fg',
                  )}
                >
                  {item + 1}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() => goToPage(pageIndex + 1)}
              disabled={pageIndex >= (pageCount || 1) - 1}
              className="ui-touch-target grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-brand/40 hover:text-fg disabled:opacity-30"
              aria-label={t.next}
            >
              <Icon name="chevronRight" size={15} />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
