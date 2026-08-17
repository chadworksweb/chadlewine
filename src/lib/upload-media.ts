// One way to put a file in a Bunny zone from the admin.
//
// The rule is: an upload never replaces an existing file unless the caller
// asks for it by name. Replacing looks harmless and isn't. On 2026-08-14 a
// screenshot uploaded into email/campaigns landed on a name already used by a
// campaign sent five days earlier, and rewrote the picture inside a mail that
// had already gone out. It also LOOKED like nothing happened, because the
// library sorts on Bunny's DateCreated (which a replace leaves at the original
// upload) and because the CDN kept serving the old bytes -- the pull zone
// ignores query strings, so that URL cannot be cache-busted at all.
//
// A free name sidesteps every part of that: new path, new URL, no cache to
// fight, and it sorts to the top of the library where you're looking for it.

export interface UploadMediaOptions {
  /** Media type / zone key the upload route understands (site-image, art-fullres, music-download, ...). */
  type: string;
  /** Folder inside the zone. Omit for the zone root. */
  folder?: string;
  /** Basename override, extension included. Defaults to the file's own name. */
  filename?: string;
  /**
   * Overwrite an existing file at the same path instead of claiming a free
   * name. Only for a fixed, single-purpose asset the caller owns outright
   * (the meditations hero, say) -- never for a shared library.
   */
  replace?: boolean;
  /** How many "-2", "-3" ... names to try before giving up. */
  maxAttempts?: number;
}

export interface UploadMediaResult {
  path: string;
  url: string | null;
  tokenAuth?: boolean;
  /** Set when the requested name was taken and this one was used instead. */
  renamedTo: string | null;
}

function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? { stem: name.slice(0, dot), ext: name.slice(dot) }
    : { stem: name, ext: "" };
}

export async function uploadMedia(
  file: File,
  options: UploadMediaOptions,
): Promise<UploadMediaResult> {
  const { type, folder, replace = false, maxAttempts = 20 } = options;
  const wanted = options.filename || file.name;
  const { stem, ext } = splitName(wanted);

  const post = async (filename: string, noOverwrite: boolean) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    fd.append("filename", filename);
    if (folder) fd.append("folder", folder);
    if (noOverwrite) fd.append("noOverwrite", "1");
    return fetch("/api/admin/media/upload", { method: "POST", body: fd });
  };

  if (replace) {
    const res = await post(wanted, false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return { path: data.path, url: data.url ?? null, tokenAuth: data.tokenAuth, renamedTo: null };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = attempt === 1 ? wanted : `${stem}-${attempt}${ext}`;
    const res = await post(candidate, true);
    if (res.status === 409) continue;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return {
      path: data.path,
      url: data.url ?? null,
      tokenAuth: data.tokenAuth,
      renamedTo: attempt === 1 ? null : candidate,
    };
  }

  throw new Error(
    `"${wanted}" and the next ${maxAttempts - 1} names are all taken. Rename the file and try again.`,
  );
}
