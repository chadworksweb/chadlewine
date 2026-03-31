"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ObservationEditor } from "@/components/ObservationEditor";

export default function EditObservationPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<null | Record<string, unknown>>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/observations/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((obsv) => setData(obsv))
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <div className="admin-page">
        <p className="obsv-editor__error">Observation not found.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <ObservationEditor
      initial={{
        id: data.id as string,
        title: data.title as string,
        slug: data.slug as string,
        body: data.body as string,
        date_captured: data.date_captured as string,
        status: data.status as string,
        hook_line: (data.hook_line as string) || "",
        tension_line: (data.tension_line as string) || "",
        art_image_path: (data.art_image_path as string) || "",
        art_alt: (data.art_alt as string) || "",
        seo_title: (data.seo_title as string) || "",
        seo_description: (data.seo_description as string) || "",
        categories: (data.categories as string[]) || [],
        thoughtlines: (data.thoughtlines as string[]) || [],
        tags: (data.tags as string[]) || [],
        focus_keyphrase: (data.focus_keyphrase as string) || "",
        secondary_keyphrases: (data.secondary_keyphrases as string[]) || [],
        search_intent: (data.search_intent as string) || "informational",
        citation_summary: (data.citation_summary as string) || "",
        first_sentence_extractable: (data.first_sentence_extractable as boolean) || false,
        paa_pairs: (data.paa_pairs as { question: string; answer: string }[]) || [],
        entity_tags: (data.entity_tags as string[]) || [],
        article_type: (data.article_type as string) || "article",
        published_at: (data.published_at as string) || null,
        related_music: (data.related_music as { type: "song" | "album"; id: string }[]) || [],
      }}
    />
  );
}
