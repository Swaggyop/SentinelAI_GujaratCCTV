const { query } = require('../db');

const logAction = async (actorId, actorRole, action, targetTable, targetId, payload, client = null) => {
  const dbQuery = client ? client.query.bind(client) : query;
  
  try {
    await dbQuery(
      `INSERT INTO audit_log (actor, actor_role, action, target_table, target_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorId, actorRole, action, targetTable, targetId, JSON.stringify(payload)]
    );
  } catch (error) {
    console.error('Failed to insert audit log:', error);
  }
};

module.exports = {
  logAction
};
