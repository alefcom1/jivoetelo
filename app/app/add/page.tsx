import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AddMealFlow } from "./add-meal-flow";

export default async function AddMealPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <AddMealFlow showCalories={user.showCalories} />;
}
