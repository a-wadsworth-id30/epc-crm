"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { revalidateHeaderNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";

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
  revalidateHeaderNotifications();
  await bumpRealtimeTopics([realtimeTopics.tasks]);
}
