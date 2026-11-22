import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
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

  async create(userId: string, amount: number, currency = 'USD', provider = 'manual') {
    const payment = await this.prisma.payment.create({
      data: { userId, amount, currency, status: 'pending', provider },
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
    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'paid' },
    });
    await this.notifications.notifyPayment({
      id: updated.id,
      amount: updated.amount.toString(),
      currency: updated.currency,
      status: updated.status,
    });
    return updated;
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
