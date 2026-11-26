import type { RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // Presentation hints consumed by components/data-table.tsx.
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Hide this column from the mobile card layout. */
    mobileHidden?: boolean;
    /** Cell renders its own layout, so the table must not clip it. */
    noTruncate?: boolean;
    align?: 'left' | 'right' | 'center';
  }
}
