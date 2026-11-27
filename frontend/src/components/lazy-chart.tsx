// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

const ChartSkeleton = () => <div className="h-full w-full animate-pulse rounded-lg bg-surface-2/60" />;

// recharts тянет за собой ~400 КБ кода; оборачиваем named-экспорты в next/dynamic,
// чтобы библиотека грузилась отдельным чанком только на страницах с графиками
// и только после гидрации.
export function lazyChart(name: string) {
  return dynamic(() => import('recharts').then((m) => m[name] as ComponentType<Record<string, unknown>>), {
    ssr: false,
    loading: ChartSkeleton,
  });
}
