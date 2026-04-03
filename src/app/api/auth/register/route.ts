import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { createHouseholdWithOwner, redeemHouseholdInviteForRegistration } from "@/lib/services/household";
import { prisma } from "@/lib/prisma";
import { signUpSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = signUpSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "An account already exists for that email." },
      { status: 409 },
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);

  try {
    if (parsed.data.onboardingMode === "join") {
      await redeemHouseholdInviteForRegistration({
        inviteCode: parsed.data.inviteCode ?? "",
        name: parsed.data.name,
        email,
        passwordHash,
      });
    } else {
      await createHouseholdWithOwner({
        name: parsed.data.name,
        email,
        passwordHash,
        householdName: parsed.data.householdName ?? "",
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Registration failed.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
