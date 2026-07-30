import { getPlanData } from "@/lib/plan";
import { authorize } from "../_auth";

/** Данные экрана «План»: тренд веса, приверженность дневнику, разбор цели. */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const data = await getPlanData(auth.user.id);
  return Response.json(data);
}
