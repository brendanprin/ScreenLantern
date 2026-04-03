"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useActiveContext } from "@/components/active-context-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGroupSchema } from "@/lib/validations/household";

type CreateGroupValues = {
  name: string;
  userIds: string[];
};

interface CreateGroupFormProps {
  members: Array<{ id: string; name: string }>;
}

export function CreateGroupForm({ members }: CreateGroupFormProps) {
  const router = useRouter();
  const { setSelection } = useActiveContext();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateGroupValues>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: "",
      userIds: [],
    },
  });

  const selectedUserIds = watch("userIds");

  const onSubmit = (values: CreateGroupValues) => {
    startTransition(async () => {
      setFormError(null);
      const response = await fetch("/api/household/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setFormError(payload.error ?? "Unable to save group.");
        return;
      }

      setSelection(values.userIds);
      router.refresh();
    });
  };

  function toggleMember(userId: string) {
    const nextSelection = selectedUserIds.includes(userId)
      ? selectedUserIds.filter((id) => id !== userId)
      : [...selectedUserIds, userId];

    setValue("userIds", nextSelection, { shouldValidate: true });
  }

  return (
    <Card className="bg-white/80">
      <CardHeader>
        <CardTitle>Create a household group</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input id="group-name" placeholder="Movie Night Trio" {...register("name")} />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-3">
            <Label>Members</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {members.map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 px-4 py-3"
                >
                  <Checkbox
                    checked={selectedUserIds.includes(member.id)}
                    onCheckedChange={() => toggleMember(member.id)}
                  />
                  <span>{member.name}</span>
                </label>
              ))}
            </div>
            {errors.userIds ? (
              <p className="text-sm text-destructive">{errors.userIds.message}</p>
            ) : null}
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <Button disabled={isPending} type="submit">
            {isPending ? "Saving group..." : "Save and activate group"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

