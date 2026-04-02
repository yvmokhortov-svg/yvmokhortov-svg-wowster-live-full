import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/auth/schemas";
import { loginAndCreateSession } from "@/lib/auth/login";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = loginSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await loginAndCreateSession(parsed.data.email, parsed.data.password);
    if (!result.ok) {
      if (result.code === "BANNED") {
        return NextResponse.json({ error: "Account banned" }, { status: 403 });
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    return NextResponse.json({ user: result.user }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
