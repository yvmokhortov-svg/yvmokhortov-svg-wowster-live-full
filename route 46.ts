import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import {
  generateCustomGroupCheckoutReference,
  getCustomGroupOrderSummary,
} from "@/lib/custom-group-orders";
import { buildCustomGroupCheckoutUrl } from "@/lib/payments/custom-group";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const patchOrderSchema = z.object({
  assignGroupAdminUserId: z.string().trim().min(1).max(191).optional(),
  assignGroupAdminEmail: z.email().toLowerCase().optional(),
  clearGroupAdmin: z.boolean().optional(),
  markPaid: z.boolean().optional(),
  activate: z.boolean().optional(),
  close: z.boolean().optional(),
  cancel: z.boolean().optional(),
  regenerateCheckoutLink: z.boolean().optional(),
  seatPriceCents: z.number().int().min(100).max(500_000).optional(),
});

const patchSeatInviteSchema = z.object({
  seats: z
    .array(
      z.object({
        seatId: z.string().trim().min(1).max(191),
        invitedEmail: z.email().toLowerCase().nullable(),
      }),
    )
    .min(1)
    .max(5000),
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await context.params;
    const order = await getCustomGroupOrderSummary(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ order }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const parsed = patchOrderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const existing = await prisma.customGroupOrder.findUnique({
      where: { id },
      select: {
        id: true,
        numberOfSeats: true,
        seatPriceCents: true,
        totalAmountCents: true,
        checkoutReference: true,
        contactEmail: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let groupAdminUserId: string | null | undefined = undefined;
    if (parsed.data.clearGroupAdmin) {
      groupAdminUserId = null;
    } else if (parsed.data.assignGroupAdminUserId) {
      const user = await prisma.user.findUnique({
        where: { id: parsed.data.assignGroupAdminUserId },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json({ error: "Group admin user not found." }, { status: 404 });
      }
      groupAdminUserId = user.id;
    } else if (parsed.data.assignGroupAdminEmail) {
      const user = await prisma.user.findUnique({
        where: { email: parsed.data.assignGroupAdminEmail },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "No account exists with this group admin email." },
          { status: 404 },
        );
      }
      groupAdminUserId = user.id;
    }

    const now = new Date();
    let nextStatus: "CHECKOUT_SENT" | "PAID" | "ACTIVE" | "CLOSED" | "CANCELED" | undefined;
    if (parsed.data.cancel) nextStatus = "CANCELED";
    else if (parsed.data.close) nextStatus = "CLOSED";
    else if (parsed.data.activate) nextStatus = "ACTIVE";
    else if (parsed.data.markPaid) nextStatus = "PAID";

    let checkoutReference = existing.checkoutReference;
    const nextSeatPriceCents = parsed.data.seatPriceCents ?? existing.seatPriceCents;
    const nextTotalAmountCents = existing.numberOfSeats * nextSeatPriceCents;
    let checkoutUrl: string | undefined = undefined;
    if (parsed.data.regenerateCheckoutLink) {
      checkoutReference = generateCustomGroupCheckoutReference();
      const checkoutSession = await buildCustomGroupCheckoutUrl({
        orderId: existing.id,
        checkoutReference,
        totalAmountCents: nextTotalAmountCents,
        contactEmail: existing.contactEmail ?? null,
      });
      checkoutUrl = checkoutSession.checkoutUrl;
    } else if (parsed.data.seatPriceCents !== undefined && existing.checkoutReference) {
      const checkoutSession = await buildCustomGroupCheckoutUrl({
        orderId: existing.id,
        checkoutReference: existing.checkoutReference,
        totalAmountCents: nextTotalAmountCents,
        contactEmail: existing.contactEmail ?? null,
      });
      checkoutUrl = checkoutSession.checkoutUrl;
    }

    const updated = await prisma.customGroupOrder.update({
      where: { id },
      data: {
        ...(groupAdminUserId !== undefined ? { groupAdminUserId } : {}),
        ...(parsed.data.seatPriceCents !== undefined
          ? {
              seatPriceCents: parsed.data.seatPriceCents,
              totalAmountCents: nextTotalAmountCents,
            }
          : {}),
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(parsed.data.markPaid ? { paidAt: now } : {}),
        ...(parsed.data.activate ? { activatedAt: now } : {}),
        ...(parsed.data.close ? { closedAt: now } : {}),
        ...(parsed.data.cancel ? { canceledAt: now } : {}),
        ...(parsed.data.regenerateCheckoutLink
          ? {
              checkoutReference,
              checkoutUrl,
            }
          : checkoutUrl
            ? { checkoutUrl }
            : {}),
      },
      select: { id: true },
    });

    const order = await getCustomGroupOrderSummary(updated.id);
    return NextResponse.json({ order }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const parsed = patchSeatInviteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const order = await prisma.customGroupOrder.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    await prisma.$transaction(
      parsed.data.seats.map((seat) =>
        prisma.customGroupSeat.updateMany({
          where: {
            id: seat.seatId,
            orderId: id,
          },
          data: {
            invitedEmail: seat.invitedEmail,
          },
        }),
      ),
    );

    const updated = await getCustomGroupOrderSummary(id);
    return NextResponse.json({ order: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
