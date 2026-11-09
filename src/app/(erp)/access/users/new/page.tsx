import { redirect } from "next/navigation";

export default function NewUserPage() {
  redirect("/access/users?new=1");
}

