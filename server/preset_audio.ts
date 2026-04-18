import fs from "fs";
import path from "path";
import {
  ObjectStorageService,
  objectStorageClient,
  setObjectAclPolicy,
} from "./replit_integrations/object_storage";

export interface PresetAudio {
  key: string;
  filename: string;
  objectName: string;
  publicUrl: string;
}

export const PRESET_AUDIOS: PresetAudio[] = [
  {
    key: "rain",
    filename: "rainfall_in_a_jungle-1757090030727_1757091361689.mp3",
    objectName: "soundscape-presets/rain.mp3",
    publicUrl: "/objects/soundscape-presets/rain.mp3",
  },
  {
    key: "coffee",
    filename: "coffee_shop_in_nyc,_-#3-1757090374207_1757091361687.mp3",
    objectName: "soundscape-presets/coffee.mp3",
    publicUrl: "/objects/soundscape-presets/coffee.mp3",
  },
];

let uploadPromise: Promise<void> | null = null;

export function ensurePresetAudiosUploaded(): Promise<void> {
  if (!uploadPromise) {
    uploadPromise = uploadPresetAudios().catch((err) => {
      uploadPromise = null;
      throw err;
    });
  }
  return uploadPromise;
}

async function uploadPresetAudios(): Promise<void> {
  const objectStorage = new ObjectStorageService();
  let privateDir: string;
  try {
    privateDir = objectStorage.getPrivateObjectDir();
  } catch (err) {
    console.warn(
      "Skipping preset audio upload: object storage not configured.",
      err
    );
    return;
  }
  if (!privateDir.endsWith("/")) privateDir = `${privateDir}/`;

  const assetsDir = path.resolve(import.meta.dirname, "..", "attached_assets");

  for (const preset of PRESET_AUDIOS) {
    try {
      const fullPath = `${privateDir}${preset.objectName}`;
      const stripped = fullPath.startsWith("/") ? fullPath.slice(1) : fullPath;
      const slash = stripped.indexOf("/");
      const bucketName = stripped.slice(0, slash);
      const objectName = stripped.slice(slash + 1);
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (!exists) {
        const localPath = path.join(assetsDir, preset.filename);
        if (!fs.existsSync(localPath)) {
          console.warn(
            `Preset audio source missing on disk for "${preset.key}": ${localPath}`
          );
          continue;
        }
        const buf = fs.readFileSync(localPath);
        await file.save(buf, {
          contentType: "audio/mpeg",
          resumable: false,
        });
        console.log(`Uploaded preset audio "${preset.key}" to object storage.`);
      }
      await setObjectAclPolicy(file, {
        owner: "system",
        visibility: "public",
      });
    } catch (err) {
      console.error(
        `Failed to ensure preset audio "${preset.key}" in object storage:`,
        err
      );
    }
  }
}
