import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveActiveManualTrialToken } from "@/lib/manual-trials";

export const runtime = "nodejs";

const querySchema = z.object({
  token: z.string().trim().min(1),
  streamId: z.string().trim().min(1),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      token: searchParams.get("token"),
      streamId: searchParams.get("streamId"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const assignment = await resolveActiveManualTrialToken({
      token: parsed.data.token,
      streamId: parsed.data.streamId,
    });
    if (!assignment) {
      return NextResponse.json(
        {
          active: false,
          error: "Manual trial assignment is invalid or expired.",
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        active: true,
        assignment: {
          id: assignment.id,
          streamId: assignment.streamId,
          startsAt: assignment.startsAt,
          endsAt: assignment.endsAt,
          timezone: assignment.timezone,
          durationMinutes: assignment.durationMinutes,
          roomLink: assignment.roomLink,
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
