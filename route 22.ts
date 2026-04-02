import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import {
  DEFAULT_CUSTOM_GROUP_SEAT_PRICE_CENTS,
  generateCustomGroupCheckoutReference,
  generateCustomGroupSeatClaimToken,
  getCustomGroupOrderSummary,
} from "@/lib/custom-group-orders";
import { buildCustomGroupCheckoutUrl } from "@/lib/payments/custom-group";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z
    .enum(["ALL", "DRAFT", "CHECKOUT_SENT", "PAID", "ACTIVE", "CLOSED", "CANCELED"])
    .default("ALL"),
  limit: z.number().int().min(1).max(300).default(80),
});

const createFromSupportTicketSchema = z.object({
  sourceSupportTaskId: z.string().trim().min(1).max(191),
  seatPriceCents: z.number().int().min(100).max(500_000).optional(),
});

const createManualSchema = z.object({
  numberOfSeats: z.number().int().min(10).max(5000),
  country: z.string().trim().min(2).max(120),
  preferredDaysTimes: z.string().trim().min(2).max(500),
  ageRange: z.string().trim().min(2).max(120),
  note: z.string().trim().max(1000).optional(),
  contactEmail: z.email().toLowerCase().optional(),
  seatPriceCents: z.number().int().min(100).max(500_000).optional(),
});

const createOrderSchema = z.union([createFromSupportTicketSchema, createManualSchema]);

type ParsedCustomOrderPayload = {
  numberOfSeats: number;
  country: string;
  preferredDaysTimes: string;
  ageRange: string;
  note: string | null;
  contactEmail: string | null;
};

function parseCustomOrderFromSupportTask(task: { payloadJson: unknown }): ParsedCustomOrderPayload | null {
  if (!task.payloadJson || typeof task.payloadJson !== "object") return null;
  const payload = task.payloadJson as Record<string, unknown>;
  if (payload.kind !== "custom_class_order") return null;
  const numberOfSeats = Number(payload.numberOfStudents);
  const country = typeof payload.country === "string" ? payload.country : null;
  const preferredDaysTimes =
    typeof payload.preferredDaysTimes === "string" ? payload.preferredDaysTimes : null;
  const ageRange = typeof payload.ageRange === "string" ? payload.ageRange : null;
  const note = typeof payload.note === "string" ? payload.note : null;
  const contactEmail = typeof payload.contactEmail === "string" ? payload.contactEmail : null;
  if (!Number.isFinite(numberOfSeats) || numberOfSeats < 10) return null;
  if (!country || !preferredDaysTimes || !ageRange) return null;
  return {
    numberOfSeats,
    country,
    preferredDaysTimes,
    ageRange,
    note,
    contactEmail,
  };
}

export async function GET(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const orders = await prisma.customGroupOrder.findMany({
      where:
        parsed.data.status === "ALL"
          ? undefined
          : { status: parsed.data.status },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
      select: {
        id: true,
        sourceSupportTaskId: true,
        status: true,
        numberOfSeats: true,
        claimedSeats: true,
        country: true,
        preferredDaysTimes: true,
        ageRange: true,
        note: true,
        contactEmail: true,
        seatPriceCents: true,
        totalAmountCents: true,
        checkoutUrl: true,
        checkoutReference: true,
        paidAt: true,
        activatedAt: true,
        closedAt: true,
        canceledAt: true,
        createdAt: true,
        updatedAt: true,
        groupAdmin: {
          select: { id: true, email: true, nickname: true },
        },
        createdByAdmin: {
          select: { id: true, email: true, nickname: true },
        },
        seats: {
          orderBy: { seatIndex: "asc" },
          select: {
            id: true,
            seatIndex: true,
            status: true,
            claimToken: true,
            invitedEmail: true,
            claimedAt: true,
            claimedByUser: {
              select: { id: true, email: true, nickname: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ orders }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = createOrderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    let orderInput: ParsedCustomOrderPayload;
    let sourceSupportTaskId: string | null = null;
    const seatPriceCents =
      parsed.data.seatPriceCents ?? DEFAULT_CUSTOM_GROUP_SEAT_PRICE_CENTS;

    if ("sourceSupportTaskId" in parsed.data) {
      sourceSupportTaskId = parsed.data.sourceSupportTaskId;
      const supportTask = await prisma.adminTask.findUnique({
        where: { id: parsed.data.sourceSupportTaskId },
        select: {
          id: true,
          type: true,
          payloadJson: true,
        },
      });
      if (!supportTask || supportTask.type !== "SUPPORT") {
        return NextResponse.json(
          { error: "Support task not found." },
          { status: 404 },
        );
      }
      const parsedPayload = parseCustomOrderFromSupportTask({
        payloadJson: supportTask.payloadJson,
      });
      if (!parsedPayload) {
        return NextResponse.json(
          { error: "Support task is not a custom class order." },
          { status: 409 },
        );
      }
      orderInput = parsedPayload;
    } else {
      orderInput = {
        numberOfSeats: parsed.data.numberOfSeats,
        country: parsed.data.country,
        preferredDaysTimes: parsed.data.preferredDaysTimes,
        ageRange: parsed.data.ageRange,
        note: parsed.data.note ?? null,
        contactEmail: parsed.data.contactEmail ?? null,
      };
    }

    const existingFromTask = sourceSupportTaskId
      ? await prisma.customGroupOrder.findUnique({
          where: { sourceSupportTaskId },
          select: { id: true },
        })
      : null;
    if (existingFromTask) {
      return NextResponse.json(
        { error: "An order already exists for this support task.", orderId: existingFromTask.id },
        { status: 409 },
      );
    }

    const totalAmountCents = seatPriceCents * orderInput.numberOfSeats;
    const checkoutReference = generateCustomGroupCheckoutReference();
    const created = await prisma.customGroupOrder.create({
      data: {
        sourceSupportTaskId,
        status: "CHECKOUT_SENT",
        numberOfSeats: orderInput.numberOfSeats,
        claimedSeats: 0,
        country: orderInput.country,
        preferredDaysTimes: orderInput.preferredDaysTimes,
        ageRange: orderInput.ageRange,
        note: orderInput.note,
        contactEmail: orderInput.contactEmail,
        seatPriceCents,
        totalAmountCents,
        checkoutReference,
        createdByAdminId: actor.id,
      },
      select: { id: true, totalAmountCents: true, checkoutReference: true },
    });

    let checkoutSession: { checkoutUrl: string; providerTxId: string };
    try {
      checkoutSession = await buildCustomGroupCheckoutUrl({
        orderId: created.id,
        checkoutReference: created.checkoutReference ?? checkoutReference,
        totalAmountCents: created.totalAmountCents,
        contactEmail: orderInput.contactEmail ?? null,
      });
    } catch {
      return NextResponse.json(
        { error: "Unable to create custom-group checkout session." },
        { status: 502 },
      );
    }

    await prisma.$transaction([
      prisma.customGroupOrder.update({
        where: { id: created.id },
        data: { checkoutUrl: checkoutSession.checkoutUrl },
        select: { id: true },
      }),
      prisma.customGroupSeat.createMany({
        data: Array.from({ length: orderInput.numberOfSeats }).map((_, index) => ({
          orderId: created.id,
          seatIndex: index + 1,
          claimToken: generateCustomGroupSeatClaimToken(),
        })),
      }),
    ]);

    const order = await getCustomGroupOrderSummary(created.id);
    return NextResponse.json({ order }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
