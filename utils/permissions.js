function getOwnerIds() {
  return (process.env.OWNER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOwner(userId) {
  return getOwnerIds().includes(userId);
}

module.exports = { isOwner, getOwnerIds };
