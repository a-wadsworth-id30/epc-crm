"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function completeTask(taskId: string) {
  const user = await requireUser();

  await prisma.task.updateMany({
    where: {
      id: taskId,
      ...(user.role === "ADMIN"
        ? {}
        : {
            OR: [{ assigneeId: user.id }, { creatorId: user.id }],
          }),
    },
    data: {
      status: "DONE",
    },
  });

  revalidatePath("/tasks");
}
