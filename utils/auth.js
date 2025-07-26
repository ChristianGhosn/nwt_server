function getAuthUserId(req) {
  const id = req.auth?.payload?.sub;
  if (!id)
    throw {
      status: 401,
      message: "Authentication error: User ID not available.",
    };
  return id;
}

module.exports = getAuthUserId;
