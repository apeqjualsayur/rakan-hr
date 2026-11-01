"use client";

import { startTransition, useActionState, type FormEvent } from "react";

// useActionState for forms that must keep what the user typed when a save fails.
// (A plain <form action> resets uncontrolled fields after every submit.)
export function useFormAction<State>(
  action: (state: Awaited<State>, formData: FormData) => State | Promise<State>,
  initialState: Awaited<State>,
) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return { state, onSubmit, pending };
}
