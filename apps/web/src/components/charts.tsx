'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@cashpilot/ui';

/** The chart is the only `ssr:false` island: lazy-loaded so Recharts stays out of the initial bundle. */
export const ForecastChart = dynamic(() => import('@cashpilot/ui/chart').then((m) => m.ForecastChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full" />,
});
