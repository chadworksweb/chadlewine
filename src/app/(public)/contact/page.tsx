import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { ContactForm } from "@/components/ContactForm";

export const dynamic = "force-static";

const DEFAULT_METADATA: Metadata = {
  title: "Contact",
  description: "Write to Chad Lewine. Notes, questions, and opportunities all reach the right place.",
  alternates: { canonical: "https://chadlewine.com/contact" },
  openGraph: {
    title: "Contact - Chad Lewine",
    description: "Write to Chad Lewine. Notes, questions, and opportunities all reach the right place.",
    url: "https://chadlewine.com/contact",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/contact", DEFAULT_METADATA);
}

export default function ContactPage() {
  return (
    <div className="page-static page-contact">
      <ContactForm />
    </div>
  );
}
