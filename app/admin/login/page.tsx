import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { signIn } from "../actions";

export const metadata: Metadata = {
  title: "Admin sign in · Unfamous Years",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { denied } = await searchParams;

  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <h1>Admin</h1>
      {denied && <p className="notice error">This account isn&apos;t the admin.</p>}
      <ActionForm action={signIn}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <div>
          <button type="submit" className="button">
            Sign in
          </button>
        </div>
      </ActionForm>
    </main>
  );
}
