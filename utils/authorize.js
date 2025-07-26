function verifyOwnership(entry, auth0Id, entryType = "entry") {
  if (!entry) throw { status: 404, message: `${entryType} not found` };
  if (entry.ownerId !== auth0Id) {
    throw {
      status: 403,
      message: `Not authorized to access this ${entryType}`,
    };
  }
}

module.exports = verifyOwnership;
