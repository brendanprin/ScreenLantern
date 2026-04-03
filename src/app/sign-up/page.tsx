import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInvitePreview } from "@/lib/services/household";
import { auth } from "../../../auth";

interface SignUpPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/app");
  }

  const params = await searchParams;
  const inviteParam = Array.isArray(params.invite) ? params.invite[0] : params.invite;
  const inviteCode = inviteParam?.trim() ?? "";
  const invitePreview = inviteCode ? await getInvitePreview(inviteCode) : null;
  const isJoinFlow = Boolean(inviteCode);

  return (
    <main className="container flex min-h-screen items-center justify-center py-16">
      <Card className="w-full max-w-lg bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">
            {isJoinFlow ? "Join a household" : "Start your household"}
          </p>
          <CardTitle>
            {isJoinFlow
              ? "Create your account and join by invite"
              : "Create your ScreenLantern account"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <SignUpForm
            initialInviteCode={inviteCode}
            invitePreview={
              invitePreview
                ? {
                    householdName: invitePreview.householdName,
                    createdByName: invitePreview.createdByName,
                    expiresAt: invitePreview.expiresAt,
                    status: invitePreview.status,
                  }
                : null
            }
          />
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-primary">
              Sign in instead
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
