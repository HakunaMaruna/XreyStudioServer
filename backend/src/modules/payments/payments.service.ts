import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { plan: true },
    });
  }

  plans() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createPlan(data: { name: string; price: number; trafficGb: number; durationDays: number }) {
    return this.prisma.subscriptionPlan.create({
      data: {
        name: data.name,
        price: data.price,
        trafficGb: data.trafficGb,
        durationDays: data.durationDays,
      },
    });
  }

  updatePlan(id: string, data: Partial<{ name: string; price: number; trafficGb: number; durationDays: number; enabled: boolean }>) {
    return this.prisma.subscriptionPlan.update({ where: { id }, data });
  }

  async create(
    userId: string,
    amount: number,
    currency = 'USD',
    provider = 'manual',
    planId?: string,
  ) {
    const payment = await this.prisma.payment.create({
      data: { userId, amount, currency, status: 'pending', provider, planId: planId || null },
    });
    let checkoutUrl: string | null = null;
    if (provider === 'stripe' && process.env.STRIPE_SECRET_KEY) {
      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          mode: 'payment',
          'line_items[0][price_data][currency]': currency.toLowerCase(),
          'line_items[0][price_data][product_data][name]': 'XSS subscription',
          'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
          'line_items[0][quantity]': '1',
          success_url: `${process.env.PANEL_URL || 'http://localhost:3000'}/dashboard?payment=success`,
          cancel_url: `${process.env.PANEL_URL || 'http://localhost:3000'}/dashboard?payment=cancel`,
          client_reference_id: payment.id,
        }),
      });
      const data: any = await res.json();
      if (data.url) {
        checkoutUrl = data.url;
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { externalId: data.id },
        });
      }
    }
    return { ...payment, checkoutUrl };
  }

  async markPaid(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'paid') return payment;
    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'paid' },
    });

    if (payment.planId) {
      const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: payment.planId } });
      if (plan) {
        const expiresAt = new Date(Date.now() + plan.durationDays * 86_400_000);
        await this.prisma.user.update({
          where: { id: payment.userId },
          data: {
            status: UserStatus.ACTIVE,
            trafficLimit: BigInt(plan.trafficGb) * 1024n ** 3n,
            trafficUsed: 0n,
            expiresAt,
          },
        });
      }
    }

    await this.notifications.notifyPayment({
      id: updated.id,
      amount: updated.amount.toString(),
      currency: updated.currency,
      status: updated.status,
    });
    return updated;
  }

  private verifyStripeSignature(payload: Buffer | undefined, header: string | undefined) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('STRIPE_WEBHOOK_SECRET is not configured');
    }
    if (!payload || !header) {
      throw new BadRequestException('Missing Stripe signature');
    }

    const parts = header.split(',').map((part) => part.split('='));
    const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
    const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
    if (!Number.isSafeInteger(timestamp) || signatures.length === 0) {
      throw new BadRequestException('Invalid Stripe signature header');
    }
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
      throw new BadRequestException('Stripe timestamp outside tolerance');
    }

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(payload)
      .digest();
    const valid = signatures.some((signature) => {
      const provided = Buffer.from(signature, 'hex');
      return provided.length === expected.length && timingSafeEqual(provided, expected);
    });
    if (!valid) {
      throw new BadRequestException('Invalid Stripe signature');
    }
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    this.verifyStripeSignature(rawBody, signature);
    let payload: any;
    try {
      payload = JSON.parse(rawBody!.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid payload');
    }
    return this.webhook(payload);
  }

  async webhook(payload: any) {
    const event = payload?.type;
    const session = payload?.data?.object;
    if (!session) throw new BadRequestException('Invalid payload');
    if (event === 'checkout.session.completed' && session.client_reference_id) {
      await this.markPaid(session.client_reference_id);
    }
    return { received: true };
  }
}
