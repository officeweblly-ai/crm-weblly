"use client";

import { useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startPublicQuestionnaire } from "@/lib/actions/public-form";

export function StartQuestionnaire({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size="lg"
        className="mt-8 w-full sm:w-auto sm:min-w-48"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await startPublicQuestionnaire(token);
            if (r && !r.ok) setError(r.error);
          })
        }
      >
        בואו נתחיל <ArrowLeft aria-hidden />
      </Button>
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </>
  );
}
