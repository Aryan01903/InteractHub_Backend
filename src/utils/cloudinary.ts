import { v2 as cloudinary } from "cloudinary";
import { cloudinaryEnabled, env } from "../config/env";
import { serviceUnavailable } from "./errors";

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_NAME,
    api_key: env.CLOUDINARY_KEY,
    api_secret: env.CLOUDINARY_SECRET,
    secure: true,
  });
}

export interface UploadResult {
  url: string;
  name: string;
  type: string;
  size: number;
  publicId: string;
  width?: number;
  height?: number;
}

export function uploadBuffer(params: {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  orgId: string;
}): Promise<UploadResult> {
  if (!cloudinaryEnabled) {
    throw serviceUnavailable("File uploads are not configured on this server");
  }

  const resourceType = params.mimetype.startsWith("image/") ? "image" : "raw";

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, folder: `interacthub/org_${params.orgId}` },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Upload failed"));
          return;
        }
        resolve({
          url: result.secure_url,
          name: params.filename,
          type: params.mimetype,
          size: result.bytes,
          publicId: result.public_id,
          ...(result.width ? { width: result.width } : {}),
          ...(result.height ? { height: result.height } : {}),
        });
      },
    );
    stream.end(params.buffer);
  });
}

export { cloudinary };
