"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpSchema } from "@/lib/validations/auth";

type SignUpValues = {
  onboardingMode: "create" | "join";
  name: string;
  email: string;
  password: string;
  householdName?: string;
  inviteCode?: string;
};

interface SignUpFormProps {
  initialInviteCode?: string;
  invitePreview?: {
    householdName: string;
    createdByName: string;
    expiresAt: string;
    status: "ACTIVE" | "REDEEMED" | "REVOKED" | "EXPIRED";
  } | null;
}

export function SignUpForm({
  initialInviteCode = "",
  invitePreview = null,
}: SignUpFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      onboardingMode: initialInviteCode ? "join" : "create",
      name: "",
      email: "",
      password: "",
      householdName: "",
      inviteCode: initialInviteCode,
    },
  });
  const onboardingMode = watch("onboardingMode");

  const inviteStatusLabel =
    invitePreview?.status === "ACTIVE"
      ? "Active invite"
      : invitePreview?.status === "EXPIRED"
        ? "Expired invite"
        : invitePreview?.status === "REDEEMED"
          ? "Redeemed invite"
          : invitePreview?.status === "REVOKED"
            ? "Revoked invite"
            : null;

  const onSubmit = (values: SignUpValues) => {
    startTransition(async () => {
      setFormError(null);

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setFormError(payload.error ?? "Registration failed.");
        return;
      }

      const signInResult = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });

      if (signInResult?.error) {
        setFormError("Account created, but automatic sign-in failed.");
        return;
      }

      router.push("/app");
      router.refresh();
    });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
      <input type="hidden" {...register("onboardingMode")} />
      <div className="space-y-2">
        <Label>How are you joining?</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className={`rounded-[24px] border px-4 py-4 text-left ${
              onboardingMode === "create"
                ? "border-primary bg-primary/8"
                : "border-border bg-background/60"
            }`}
            onClick={() => setValue("onboardingMode", "create")}
            type="button"
          >
            <p className="font-medium">Create a household</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a new ScreenLantern household as the owner.
            </p>
          </button>
          <button
            className={`rounded-[24px] border px-4 py-4 text-left ${
              onboardingMode === "join"
                ? "border-primary bg-primary/8"
                : "border-border bg-background/60"
            }`}
            onClick={() => setValue("onboardingMode", "join")}
            type="button"
          >
            <p className="font-medium">Join via invite</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use an invite code from an existing household owner.
            </p>
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="Brendan" {...register("name")} />
        {errors.name ? (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        ) : null}
      </div>
      {onboardingMode === "create" ? (
        <div className="space-y-2">
          <Label htmlFor="householdName">Household name</Label>
          <Input
            id="householdName"
            placeholder="Lantern House"
            {...register("householdName")}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to auto-generate one from your name.
          </p>
          {errors.householdName ? (
            <p className="text-sm text-destructive">{errors.householdName.message}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="inviteCode">Invite code</Label>
          <Input
            id="inviteCode"
            placeholder="LANTERN1234"
            {...register("inviteCode")}
          />
          {errors.inviteCode ? (
            <p className="text-sm text-destructive">{errors.inviteCode.message}</p>
          ) : null}
          {invitePreview ? (
            <div className="rounded-[24px] border border-border bg-background/60 p-4">
              <p className="text-sm font-medium">{inviteStatusLabel}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {invitePreview.householdName} · created by {invitePreview.createdByName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Expires {new Date(invitePreview.expiresAt).toLocaleString()}
              </p>
            </div>
          ) : initialInviteCode ? (
            <p className="text-sm text-destructive">
              This invite link is invalid or expired. You can still create a new household instead.
            </p>
          ) : null}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
        {errors.email ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" placeholder="********" {...register("password")} />
        {errors.password ? (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        ) : null}
      </div>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      <Button className="w-full" type="submit" disabled={isPending}>
        {isPending
          ? "Creating account..."
          : onboardingMode === "join"
            ? "Join household"
            : "Create account"}
      </Button>
    </form>
  );
}
