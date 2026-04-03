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
  name: string;
  email: string;
  password: string;
  householdName?: string;
};

export function SignUpForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      householdName: "",
    },
  });

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
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="Brendan" {...register("name")} />
        {errors.name ? (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        ) : null}
      </div>
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
        {isPending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}

