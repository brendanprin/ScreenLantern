import Link from "next/link";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "../../../auth";

export default async function SignInPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/app");
  }

  return (
    <main className="container flex min-h-screen items-center justify-center py-16">
      <Card className="w-full max-w-md bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">
            Welcome back
          </p>
          <CardTitle>Sign in to ScreenLantern</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <SignInForm />
          <p className="text-sm text-muted-foreground">
            Need an account?{" "}
            <Link href="/sign-up" className="font-medium text-primary">
              Create one here
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
