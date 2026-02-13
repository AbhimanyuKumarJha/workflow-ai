import crypto from 'node:crypto';
import { WebhookEvent } from '@clerk/backend';
import prisma from '@/lib/prisma';
import { withErrorHandler, WorkflowError } from '@/lib/error-handler';

function safeCompare(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    if (left.length !== right.length) {
        return false;
    }

    return crypto.timingSafeEqual(left, right);
}

function verifyClerkWebhookSignature(body: string, headers: Headers, secret: string): boolean {
    const svixId = headers.get('svix-id');
    const svixTimestamp = headers.get('svix-timestamp');
    const svixSignature = headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
        return false;
    }

    const timestampSeconds = Number(svixTimestamp);
    if (!Number.isFinite(timestampSeconds)) {
        return false;
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - timestampSeconds;
    if (Math.abs(ageSeconds) > 300) {
        return false;
    }

    const payload = `${svixId}.${svixTimestamp}.${body}`;
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = crypto.createHmac('sha256', key).update(payload).digest('base64');

    const signatures = svixSignature
        .split(' ')
        .map((entry) => entry.trim())
        .filter(Boolean);

    for (const signatureEntry of signatures) {
        const [version, signature] = signatureEntry.split(',');
        if (version !== 'v1' || !signature) {
            continue;
        }

        if (safeCompare(signature, expected)) {
            return true;
        }
    }

    return false;
}

export const POST = withErrorHandler(async (request: Request) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new WorkflowError('Clerk webhook secret not configured', 'CONFIGURATION_ERROR', 500);
    }

    const rawBody = await request.text();
    const isValid = verifyClerkWebhookSignature(rawBody, request.headers, webhookSecret);

    if (!isValid) {
        throw new WorkflowError('Invalid webhook signature', 'UNAUTHORIZED', 401);
    }

    const event = JSON.parse(rawBody) as WebhookEvent;

    if (event.type === 'user.created' || event.type === 'user.updated') {
        const data = event.data as {
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            image_url?: string | null;
            email_addresses?: Array<{ email_address?: string | null }>;
        };

        const primaryEmail = data.email_addresses?.[0]?.email_address ?? null;
        const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || null;

        await prisma.user.upsert({
            where: { clerkUserId: data.id },
            update: {
                email: primaryEmail,
                name: fullName,
                imageUrl: data.image_url ?? null,
            },
            create: {
                clerkUserId: data.id,
                email: primaryEmail,
                name: fullName,
                imageUrl: data.image_url ?? null,
            },
        });
    }

    if (event.type === 'user.deleted') {
        const data = event.data as { id?: string | null };
        if (data.id) {
            await prisma.user.deleteMany({
                where: { clerkUserId: data.id },
            });
        }
    }

    return Response.json({ success: true });
});
