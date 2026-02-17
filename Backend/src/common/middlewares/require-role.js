function requireRole() {
  var allowed = Array.from(arguments).map(function (r) {
    return String(r || "").toLowerCase();
  });

  return function (req, res, next) {
    var role = String((req.user && req.user.role) || "").toLowerCase();
    if (!role || allowed.indexOf(role) === -1) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
        message: "You do not have permission for this action"
      });
    }
    return next();
  };
}

module.exports = { requireRole };
