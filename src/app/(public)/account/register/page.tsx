import type { Metadata } from "next";
import { AccountAuthForm } from "@/components/AccountAuthForm";

export const metadata: Metadata = {
  title: "Create account - Chad Lewine",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <AccountAuthForm mode="register" />;
}
