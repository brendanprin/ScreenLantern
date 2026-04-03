import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "../../../auth";

export default async function SignUpPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/app");
  }

  return (
    <main className="container flex min-h-screen items-center justify-center py-16">
      <Card className="w-full max-w-lg bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">
            Start your household
          </p>
          <CardTitle>Create your ScreenLantern account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <SignUpForm />
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
