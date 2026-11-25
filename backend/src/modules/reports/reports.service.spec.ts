import { BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';

describe('ReportsService traffic timeseries', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      userTraffic: { findMany: jest.fn(async () => []) },
      user: { findMany: jest.fn(async () => []) },
    };
  });

  const service = () => new ReportsService(prisma);
  const day = (offset: number) => new Date(Date.UTC(2026, 10, 25 + offset));

  it('builds daily buckets for the requested period with totals', async () => {
    prisma.userTraffic.findMany
      .mockResolvedValueOnce([
        { createdAt: day(0), bytesUp: 100n, bytesDown: 200n, userId: 'u1' },
        { createdAt: day(1), bytesUp: 50n, bytesDown: 50n, userId: 'u2' },
      ])
      .mockResolvedValueOnce([{ bytesUp: 100n, bytesDown: 100n }]);
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'u1', email: 'u1@example.com' }]);

    const result = await service().trafficTimeseries({ from: '2026-11-25', to: '2026-11-26' });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({ date: '2026-11-25', bytesUp: '100', bytesDown: '200', total: '300' });
    expect(result.summary).toMatchObject({ total: '400', previousTotal: '200' });
    expect(result.topUsers[0]).toMatchObject({ email: 'u1@example.com', bytes: '300' });
    expect(prisma.userTraffic.findMany.mock.calls[1][0].where.createdAt.lt).toEqual(day(0));
  });

  it('defaults to the last 30 days and rejects oversized or invalid ranges', async () => {
    await service().trafficTimeseries({});
    expect(prisma.userTraffic.findMany.mock.calls[0][0].where.createdAt.gte).toBeInstanceOf(Date);
    await expect(service().trafficTimeseries({ from: 'bad' })).rejects.toThrow(BadRequestException);
    await expect(service().trafficTimeseries({ from: '2025-01-01', to: '2026-12-31' })).rejects.toThrow('366 days');
    await expect(service().trafficTimeseries({ from: '2026-11-26', to: '2026-11-25' })).rejects.toThrow('to must be after from');
  });

  it('exports the same filtered data to CSV', async () => {
    prisma.userTraffic.findMany
      .mockResolvedValueOnce([{ createdAt: day(0), bytesUp: 10n, bytesDown: 20n, userId: null }])
      .mockResolvedValueOnce([]);
    const csv = await service().trafficTimeseriesCsv({ from: '2026-11-25', to: '2026-11-25' });
    expect(csv).toContain('"date","bytesUp","bytesDown","total"');
    expect(csv).toContain('"2026-11-25","10","20","30"');
  });
});
