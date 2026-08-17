import "server-only";
import { STORAGE_HOSTNAME, type MediaTypeConfig } from "./media-config";

export type BunnyUploadResult = {
  path: string;
  url: string;
};

function storageUrl(zone: string, path: string): string {
  return `https://${STORAGE_HOSTNAME}/${zone}/${path.replace(/^\/+/, "")}`;
}

function pullZoneUrl(config: MediaTypeConfig, path: string): string {
  return `${config.pullZoneUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export async function uploadToBunny(
  config: MediaTypeConfig,
  path: string,
  body: ArrayBuffer | Blob,
  contentType: string,
): Promise<BunnyUploadResult> {
  const url = storageUrl(config.storageZone, path);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: config.storagePassword,
      "Content-Type": contentType,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Bunny upload failed: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`,
    );
  }

  return {
    path: path.replace(/^\/+/, ""),
    url: pullZoneUrl(config, path),
  };
}

export async function deleteFromBunny(
  config: MediaTypeConfig,
  path: string,
): Promise<void> {
  const url = storageUrl(config.storageZone, path);

  const res = await fetch(url, {
    method: "DELETE",
    headers: { AccessKey: config.storagePassword },
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Bunny delete failed: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`,
    );
  }
}

export type BunnyListItem = {
  name: string;
  size: number;
  isDirectory: boolean;
  dateCreated: string;
  /** When the bytes last changed. Re-uploading a name keeps DateCreated at the
   *  original upload, so this is the only field that moves on a replace. */
  lastChanged: string;
  url: string;
};

type BunnyStorageObject = {
  ObjectName: string;
  IsDirectory: boolean;
  Length: number;
  DateCreated: string;
  LastChanged?: string;
};

export async function listBunny(
  config: MediaTypeConfig,
  prefix = "",
  options: { recursive?: boolean } = {},
): Promise<BunnyListItem[]> {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const url = `https://${STORAGE_HOSTNAME}/${config.storageZone}/${cleanPrefix ? `${cleanPrefix}/` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { AccessKey: config.storagePassword, Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Bunny list failed: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`,
    );
  }

  const items = (await res.json()) as BunnyStorageObject[];
  const mapped: BunnyListItem[] = items.map((item) => {
    const name = cleanPrefix ? `${cleanPrefix}/${item.ObjectName}` : item.ObjectName;
    return {
      name,
      size: item.Length,
      isDirectory: item.IsDirectory,
      dateCreated: item.DateCreated,
      lastChanged: item.LastChanged || item.DateCreated,
      url: pullZoneUrl(config, name),
    };
  });

  if (!options.recursive) return mapped;

  const dirs = mapped.filter((i) => i.isDirectory);
  const nested = await Promise.all(
    dirs.map((d) => listBunny(config, d.name, options)),
  );
  return [...mapped.filter((i) => !i.isDirectory), ...nested.flat()];
}
