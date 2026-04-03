import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

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

  const householdName =
    parsed.data.householdName?.trim() || `${parsed.data.name}'s Household`;
  const passwordHash = await hash(parsed.data.password, 12);

  await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: {
        name: householdName,
      },
    });

    await tx.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash,
        householdId: household.id,
      },
    });
  });

  return NextResponse.json({ ok: true });
}

