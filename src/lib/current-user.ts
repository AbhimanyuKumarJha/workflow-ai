import { auth } from '@clerk/nextjs/server';
import { User } from '@prisma/client';
import prisma from '@/lib/prisma';
import { WorkflowError } from '@/lib/error-handler';

export async function getCurrentUserOrThrow(): Promise<User> {
    const { userId } = await auth();
    if (!userId) {
        throw new WorkflowError('Unauthorized', 'UNAUTHORIZED', 401);
    }

    const user = await prisma.user.upsert({
        where: { clerkUserId: userId },
        update: {},
        create: {
            clerkUserId: userId,
        },
    });

    return user;
}
