const Invite = require('../models/invite');
const cron=require('node-cron')
async function cleanupExpiredInvites() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Delete invites where expiresAt is older than 7 days ago
    const result = await Invite.deleteMany({
      expiresAt: { $lt: sevenDaysAgo }
    });

    console.log(`Cleanup expired invites: Deleted ${result.deletedCount} invites`);
  } catch (error) {
    console.error('Error cleaning up expired invites:', error);
  }
}

function startCleanupScheduler() {
  // Run once daily at midnight
  cron.schedule('0 0 * * *', () => {
    console.log('Running daily cleanup job for expired invites...');
    cleanupExpiredInvites();
  });
}

module.exports = { startCleanupScheduler, cleanupExpiredInvites };
