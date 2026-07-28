"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { dismissItem } from "@/lib/inbox";

/** Отклонить снимок: он исчезает из инбокса, файл удаляется с диска. */
export async function dismissFromInbox(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) await dismissItem(user.id, id);
  revalidatePath("/app/inbox");
}
