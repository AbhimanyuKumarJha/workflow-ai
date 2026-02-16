export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Import prisma to trigger database connection on server startup
        await import('./lib/prisma');
    }
}
