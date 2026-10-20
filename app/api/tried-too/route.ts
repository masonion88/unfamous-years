import { getClientIp, hashIp } from "@/lib/ip";
import { createServiceClient } from "@/lib/supabase/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let storyId: unknown;
  try {
    ({ storyId } = await request.json());
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof storyId !== "string" || !UUID.test(storyId)) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const ipHash = hashIp(await getClientIp());
  const { data, error } = await createServiceClient().rpc("record_tried_too", {
    p_story_id: storyId,
    p_ip_hash: ipHash,
  });

  if (error) {
    const status = error.code === "P0002" ? 404 : 500;
    if (status === 500) console.error("record_tried_too failed", error);
    return Response.json({ error: "could not record" }, { status });
  }
  return Response.json({ count: data as number });
}
