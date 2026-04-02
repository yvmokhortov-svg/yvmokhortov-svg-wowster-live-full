import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { registerAndCreateSession } from "@/lib/auth/register";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { findSexualContent } from "@/lib/moderation/text-safety";

export const runtime = "nodejs";

const querySchema = z.object({
  token: z.string().trim().min(8).max(256),
});

const claimSeatSchema = z.object({
  token: z.string().trim().min(8).max(256),
  email: z.email().toLowerCase().optional(),
  nickname: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(8).max(128).optional(),
});

async function resolveSeatByToken(token: string) {
  return prisma.customGroupSeat.findUnique({
    where: { claimToken: token },
    select: {
      id: true,
      seatIndex: true,
      status: true,
      invitedEmail: true,
      claimToken: true,
      claimedAt: true,
      claimedByUser: {
        select: {
          id: true,
          email: true,
          nickname: true,
        },
      },
      order: {
        select: {
          id: true,
          status: true,
          numberOfSeats: true,
          claimedSeats: true,
          country: true,
          preferredDaysTimes: true,
          ageRange: true,
          contactEmail: true,
          note: true,
          groupAdmin: {
            select: {
              id: true,
              email: true,
              nickname: true,
            },
          },
        },
      },
    },
  });
}

export async function GET(request: Request) {
  try {
    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const [seat, currentUser] = await Promise.all([
      resolveSeatByToken(parsed.data.token),
      getCurrentUser(),
    ]);
    if (!seat) return NextResponse.json({ error: "Seat claim link is invalid." }, { status: 404 });

    return NextResponse.json(
      {
        seat: {
          id: seat.id,
          seatIndex: seat.seatIndex,
          status: seat.status,
          invitedEmail: seat.invitedEmail,
          claimedAt: seat.claimedAt,
          claimedByUser: seat.claimedByUser,
        },
        order: seat.order,
        currentUser,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = claimSeatSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    let claimant = await getCurrentUser();
    if (!claimant) {
      if (!parsed.data.email || !parsed.data.nickname || !parsed.data.password) {
        return NextResponse.json(
          { error: "Login first, or provide email + nickname + password to create account." },
          { status: 401 },
        );
      }
      const sexualMatch = findSexualContent({ nickname: parsed.data.nickname });
      if (sexualMatch) {
        return NextResponse.json({ error: "Sexual content is not allowed." }, { status: 400 });
      }

      const registerResult = await registerAndCreateSession({
        email: parsed.data.email,
        nickname: parsed.data.nickname,
        password: parsed.data.password,
        role: Role.STUDENT,
      });
      if (!registerResult.ok) {
        return NextResponse.json(
          { error: "Email already exists. Please login with that account first." },
          { status: 409 },
        );
      }
      claimant = {
        id: registerResult.user.id,
        email: registerResult.user.email,
        nickname: registerResult.user.nickname,
        role: registerResult.user.role,
      };
    }

    const now = new Date();
    const claimResult = await prisma.$transaction(async (tx) => {
      const seat = await tx.customGroupSeat.findUnique({
        where: { claimToken: parsed.data.token },
        select: {
          id: true,
          orderId: true,
          status: true,
          claimedByUserId: true,
          order: {
            select: {
              id: true,
              status: true,
              numberOfSeats: true,
              claimedSeats: true,
            },
          },
        },
      });
      if (!seat) return { code: "SEAT_NOT_FOUND" as const };
      if (seat.status !== "AVAILABLE" || seat.claimedByUserId) {
        return { code: "SEAT_ALREADY_CLAIMED" as const };
      }
      if (seat.order.status !== "PAID" && seat.order.status !== "ACTIVE") {
        return { code: "ORDER_NOT_ACTIVE" as const };
      }

      const updatedSeat = await tx.customGroupSeat.updateMany({
        where: {
          id: seat.id,
          status: "AVAILABLE",
          claimedByUserId: null,
        },
        data: {
          status: "CLAIMED",
          claimedByUserId: claimant!.id,
          claimedAt: now,
        },
      });
      if (updatedSeat.count !== 1) {
        return { code: "SEAT_ALREADY_CLAIMED" as const };
      }

      const claimedSeats = seat.order.claimedSeats + 1;
      await tx.customGroupOrder.update({
        where: { id: seat.orderId },
        data: {
          claimedSeats,
          status: seat.order.status === "PAID" ? "ACTIVE" : undefined,
          activatedAt: seat.order.status === "PAID" ? now : undefined,
        },
        select: { id: true },
      });

      return { code: "OK" as const };
    });

    if (claimResult.code === "SEAT_NOT_FOUND") {
      return NextResponse.json({ error: "Seat claim link is invalid." }, { status: 404 });
    }
    if (claimResult.code === "SEAT_ALREADY_CLAIMED") {
      return NextResponse.json({ error: "This seat has already been claimed." }, { status: 409 });
    }
    if (claimResult.code === "ORDER_NOT_ACTIVE") {
      return NextResponse.json(
        {
          error:
            "Seat package is not paid/active yet. Ask the group admin to complete checkout first.",
        },
        { status: 409 },
      );
    }

    const seat = await resolveSeatByToken(parsed.data.token);
    return NextResponse.json({ ok: true, seat, user: claimant }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
