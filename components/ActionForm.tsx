"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/app/admin/actions";

/** A form wired to a server action that shows the action's ok/error message. */
export function ActionForm({
  action,
  children,
  className = "form",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className={className} aria-busy={pending}>
      {children}
      {state.error && (
        <p className="notice error small" role="alert" style={{ margin: 0 }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="notice ok small" role="status" style={{ margin: 0 }}>
          {state.ok}
        </p>
      )}
    </form>
  );
}
