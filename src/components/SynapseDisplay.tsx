import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";

interface SynapseDisplayProps {
  sourceType: "observation" | "meditation" | "foundation";
  sourceId: string;
}

interface ResolvedConnection {
  direction: string;
  description: string | null;
  type: string;
  id: string;
  title: string;
  href: string;
}

async function resolveTitle(supabase: ReturnType<typeof createPublicClient>, type: string, id: string): Promise<{ title: string; href: string } | null> {
  if (type === "observation") {
    const { data } = await supabase.from("posts").select("title, slug, kind").eq("id", id).eq("status", "published").single();
    if (!data) return null;
    const section = data.kind === "journal" ? "journal" : "observations";
    return { title: data.title, href: `/${section}/${data.slug}` };
  }
  if (type === "meditation") {
    const { data } = await supabase.from("meditations").select("id, plain_text").eq("id", id).eq("status", "published").single();
    return data ? { title: data.plain_text.length > 60 ? data.plain_text.slice(0, 57) + "..." : data.plain_text, href: `/meditations/${data.id}` } : null;
  }
  if (type === "foundation") {
    const { data } = await supabase.from("foundations").select("title, slug").eq("id", id).single();
    return data ? { title: data.title, href: `/foundations/${data.slug}` } : null;
  }
  return null;
}

export async function SynapseDisplay({ sourceType, sourceId }: SynapseDisplayProps) {
  const supabase = createPublicClient();

  // Outbound: this piece → others
  const { data: outbound } = await supabase
    .from("thread_pulls")
    .select("*")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);

  // Inbound: others → this piece
  const { data: inbound } = await supabase
    .from("thread_pulls")
    .select("*")
    .eq("target_type", sourceType)
    .eq("target_id", sourceId);

  const outConnections: ResolvedConnection[] = [];
  for (const pull of outbound || []) {
    const resolved = await resolveTitle(supabase, pull.target_type, pull.target_id);
    if (resolved) {
      outConnections.push({ direction: pull.direction, description: pull.description, type: pull.target_type, id: pull.target_id, ...resolved });
    }
  }

  const inConnections: ResolvedConnection[] = [];
  for (const pull of inbound || []) {
    const resolved = await resolveTitle(supabase, pull.source_type, pull.source_id);
    if (resolved) {
      inConnections.push({ direction: pull.direction, description: pull.description, type: pull.source_type, id: pull.source_id, ...resolved });
    }
  }

  if (outConnections.length === 0 && inConnections.length === 0) return null;

  return (
    <aside className="synapse-display">
      {outConnections.length > 0 && (
        <div className="synapse-display__section">
          <h3 className="synapse-display__heading">Where This Connects</h3>
          <ul className="synapse-display__list">
            {outConnections.map((c) => (
              <li key={`${c.type}-${c.id}`} className="synapse-display__item">
                <span className="synapse-display__direction">{c.direction}</span>
                <Link href={c.href} className="synapse-display__link">{c.title}</Link>
                {c.description && <span className="synapse-display__desc">{c.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {inConnections.length > 0 && (
        <div className="synapse-display__section">
          <h3 className="synapse-display__heading">Referenced In</h3>
          <ul className="synapse-display__list">
            {inConnections.map((c) => (
              <li key={`${c.type}-${c.id}`} className="synapse-display__item">
                <span className="synapse-display__direction">{c.direction}</span>
                <Link href={c.href} className="synapse-display__link">{c.title}</Link>
                {c.description && <span className="synapse-display__desc">{c.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
