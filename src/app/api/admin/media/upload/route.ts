import { getMediaConfig, isMediaType, STORAGE_HOSTNAME } from "@/lib/media-config";
import { uploadToBunny } from "@/lib/bunny";

const MAX_BYTES = 200 * 1024 * 1024;

// Preserve case and non-traversal characters; only strip path separators and
// other characters that could escape the zone.
function sanitizeBasename(name: string): string {
  return name.replace(/[/\\]/g, "-").replace(/\s+/g, "-");
}

function sanitizeFolder(folder: string): string {
  return folder
    .split("/")
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase())
    .filter(Boolean)
    .join("/");
}

async function bunnyFileExists(
  storageZone: string,
  storagePassword: string,
  path: string,
): Promise<boolean> {
  const url = `https://${STORAGE_HOSTNAME}/${storageZone}/${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { AccessKey: storagePassword },
  });
  return res.status === 200;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const type = formData.get("type");
  const folderRaw = formData.get("folder");
  const filenameRaw = formData.get("filename");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (!isMediaType(type)) {
    return Response.json({ error: "Invalid media type" }, { status: 400 });
  }

  const config = getMediaConfig(type);

  if (!config.allowedMimeTypes.includes(file.type)) {
    return Response.json(
      {
        error: `Mime type not allowed for ${config.label}. Allowed: ${config.allowedMimeTypes.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit` },
      { status: 413 },
    );
  }

  const folder = typeof folderRaw === "string" ? sanitizeFolder(folderRaw) : "";
  // Optional filename override (full filename with extension). Caller is
  // responsible for matching extension to file content.
  const basename =
    typeof filenameRaw === "string" && filenameRaw.length > 0
      ? sanitizeBasename(filenameRaw)
      : sanitizeBasename(file.name);
  const path = folder ? `${folder}/${basename}` : basename;
  const noOverwrite = formData.get("noOverwrite") === "1";

  if (noOverwrite) {
    const exists = await bunnyFileExists(
      config.storageZone,
      config.storagePassword,
      path,
    );
    if (exists) {
      return Response.json(
        { error: `A file named "${path}" already exists in ${config.storageZone}.` },
        { status: 409 },
      );
    }
  }

  const body = await file.arrayBuffer();

  try {
    const result = await uploadToBunny(config, path, body, file.type);
    return Response.json(
      {
        type,
        path: result.path,
        url: config.tokenAuth ? null : result.url,
        tokenAuth: config.tokenAuth,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
