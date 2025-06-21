const Tenant = require('../models/Tenant');
const { sendTenantCreatedEmail } = require('../utils/sendTenantCreatedEmail');
const { createAuditLog } = require('../utils/createAuditLog');

exports.createTenant = async (req, res) => {
  const { name, email } = req.body;

  try {
    // Check if this email already created a tenant
    const tenantByEmail = await Tenant.findOne({ adminEmail: email });
    if (tenantByEmail) {
      return res.status(400).json({
        error: 'You have already created a tenant. One tenant per admin is allowed.'
      });
    }

    // Check for duplicate tenant name
    const tenantByName = await Tenant.findOne({ name });
    if (tenantByName) {
      return res.status(400).json({
        error: 'Tenant name already exists.'
      });
    }

    // Create the tenant with adminEmail
    const tenant = await Tenant.create({ name, adminEmail: email });

    // Send tenantId via email
    await sendTenantCreatedEmail(email, tenant._id);
    const userId = req.user?._id; // Only if authenticated
    if (userId) {
      await createAuditLog({
        userId,
        tenantId: tenant._id,
        action: 'create-tenant',
        details: { tenantName: name }
      });
    }

    res.status(201).json({
      message: 'Tenant Created Successfully',
      tenantId: tenant._id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
