import { getProfileData } from "@/lib/profile";
import { authorize } from "../_auth";

/** Данные экрана «Профиль»: цели, измерения, темп снижения, напоминания. */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const data = await getProfileData(auth.user.id);
  return Response.json(data);
}
