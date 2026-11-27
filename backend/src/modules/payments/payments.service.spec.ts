// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { NotificationEvent } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService webhook', () => {
  const secret = 'whsec_test';
  const payload = Buffer.from(
    JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'p1' } },
    }),
  );
  const prisma: any = {
    payment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const notifications: any = { emit: jest.fn() };
  let service: PaymentsService;

  const sign = (timestamp: number, body: Buffer) =>
    `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex')}`;

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    jest.clearAllMocks();
    prisma.payment.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'pending',
      amount: 10,
      currency: 'usd',
    });
    prisma.payment.update.mockResolvedValue({
      id: 'p1',
      status: 'paid',
      amount: 10,
      currency: 'usd',
      userId: 'user-1',
    });
    service = new PaymentsService(prisma, notifications);
  });

  it('accepts a correctly signed event and marks the payment paid', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(service.handleWebhook(payload, sign(now, payload))).resolves.toEqual({
      received: true,
    });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'paid' },
    });
    expect(notifications.emit).toHaveBeenCalledTimes(1);
    const [event, options, organizationId] = notifications.emit.mock.calls[0];
    expect(event).toBe(NotificationEvent.PAYMENT_RECEIVED);
    expect(options.webhook.event).toBe(NotificationEvent.PAYMENT_RECEIVED);
    expect(options.webhook.payment).toMatchObject({ id: 'p1', amount: '10', currency: 'usd' });
    expect(organizationId).toBe('user-1');
  });

  it('rejects a tampered payload', async () => {
    const now = Math.floor(Date.now() / 1000);
    const signature = sign(now, payload);
    const tampered = Buffer.from(payload.toString().replace('p1', 'p2'));
    await expect(service.handleWebhook(tampered, signature)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a stale timestamp', async () => {
    const stale = Math.floor(Date.now() / 1000) - 600;
    await expect(service.handleWebhook(payload, sign(stale, payload))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('requires a configured webhook secret', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    await expect(service.handleWebhook(payload, 't=1,v1=deadbeef')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('is idempotent for already paid payments', async () => {
    prisma.payment.findUnique.mockResolvedValue({ id: 'p1', status: 'paid' });
    await service.handleWebhook(payload, sign(Math.floor(Date.now() / 1000), payload));
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
  });
});
