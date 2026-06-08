const Invite = require('../models/invite');
const cron=require('node-cron')
async function cleanupExpiredInvites() {
  try {
    const result = await Invite.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    console.log(`Cleanup: Deleted ${result.deletedCount} expired invites`);
  } catch (error) {
    console.error('Error cleaning up expired invites:', error);
  }
}

function startCleanupScheduler() {
  cron.schedule('0 0 * * *', async () => {
    console.log('Running daily cleanup job for expired invites...');
    await cleanupExpiredInvites();
  });
}

module.exports = { startCleanupScheduler, cleanupExpiredInvites };
