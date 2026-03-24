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
      .then((obs) => setData(obs))
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <div className="admin-page">
        <p className="obs-editor__error">Observation not found.</p>
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
        source: (data.source as string) || "original",
        domains: (data.domains as string[]) || [],
      }}
    />
  );
}
