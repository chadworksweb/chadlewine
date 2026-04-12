"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { DoorPageEditor } from "@/components/DoorPageEditor";

export default function EditDoorPagePage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<null | Record<string, unknown>>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/door-pages/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <div className="admin-page">
        <p className="obsv-editor__error">Door page not found.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <DoorPageEditor
      initial={{
        id: data.id as string,
        title: data.title as string,
        slug: data.slug as string,
        body: (data.body as string) || "",
        meta_title: (data.meta_title as string) || "",
        meta_description: (data.meta_description as string) || "",
        target_queries: (data.target_queries as string[]) || [],
        funnel_targets: (data.funnel_targets as string[]) || [],
        og_image_path: (data.og_image_path as string) || "",
        og_alt: (data.og_alt as string) || "",
        status: (data.status as string) || "draft",
        seo_title: (data.seo_title as string) || "",
        seo_description: (data.seo_description as string) || "",
        focus_keyphrase: (data.focus_keyphrase as string) || "",
        secondary_keyphrases: (data.secondary_keyphrases as string[]) || [],
        search_intent: (data.search_intent as string) || "informational",
        citation_summary: (data.citation_summary as string) || "",
        first_sentence_extractable: (data.first_sentence_extractable as boolean) || false,
        paa_pairs: (data.paa_pairs as { question: string; answer: string }[]) || [],
        entity_tags: (data.entity_tags as string[]) || [],
        article_type: (data.article_type as string) || "article",
        hook_line: (data.hook_line as string) || "",
        tension_line: (data.tension_line as string) || "",
        published_at: (data.published_at as string) || null,
      }}
    />
  );
}
