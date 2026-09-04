import { put, list, del } from "@vercel/blob";
import { createClient } from "redis";

const redis = await createClient({ url: process.env.REDIS_URL }).connect();

export default {
  async fetch(request) {
    if (request.method === "GET") {
      const tilesMap = new Map();
      let cursor;

      do {
        const result = await list({ cursor, limit: 1000 });

        for (const blob of result.blobs) {
          const match = blob.pathname.match(
            /^x(-?\d+)y(-?\d+)(?:-[a-zA-Z0-9]+)?\.(png|jpe?g|gif|webp)$/,
          );

          if (match) {
            const x = Number(match[1]);
            const y = Number(match[2]);
            const key = `${x},${y}`;
            const existing = tilesMap.get(key);

            if (!existing || blob.uploadedAt > existing.uploadedAt) {
              tilesMap.set(key, {
                url: blob.url,
                x,
                y,
                uploadedAt: blob.uploadedAt,
              });
            }
          }
        }

        cursor = result.cursor;
      } while (cursor);

      const tiles = Array.from(tilesMap.values()).map(({ url, x, y }) => ({
        url,
        x,
        y,
      }));
      return Response.json({ tiles });
    }

    const formData = await request.formData();

    const x = Number(formData.get("x"));
    const y = Number(formData.get("y"));

    const image = formData.get("image");

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip")?.trim();

    const key = `cooldown:${ip}`;

    const ttl = await redis.ttl(key);
    if (ttl > 0) {
      return Response.json(
        {
          error: `Upload cooldown active. Retry in ${ttl} seconds`,
          retryAfter: ttl,
        },
        { status: 429, headers: { "Retry-After": String(ttl) } },
      );
    } else if (ttl === -1) {
      await redis.del(key);
    }

    await redis.set(key, Date.now(), {
      condition: "NX",
      expiration: { type: "EX", value: 60 },
    });

    const ALLOWED_TYPES = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
    };

    const ext = ALLOWED_TYPES[image.type];
    if (!ext) {
      return Response.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const blob = await put(`x${x}y${y}.${ext}`, image, {
      access: "public",
      contentType: image.type,
      addRandomSuffix: true,
    });

    return Response.json({ url: blob.url, x, y });
  },
};
