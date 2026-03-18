let jwt = null;
try {
  // Optional during local setup; required for auth-protected routes.
  // eslint-disable-next-line global-require
  jwt = require("jsonwebtoken");
} catch (error) {
  jwt = null;
}
const User = require("../models/User");

function getTokenFromHeader(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

exports.requireAuth = async (req, res, next) => {
  try {
    if (!jwt) {
      return res.status(500).json({
        message:
          "Auth is not available because `jsonwebtoken` is not installed. Run `npm install` in the server folder.",
      });
    }

    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ message: "Missing token" });

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res
        .status(500)
        .json({ message: "JWT_SECRET is not set on the server" });
    }

    const payload = jwt.verify(token, secret);
    const user = await User.findById(payload.sub).select("role cafeId email username");
    if (!user) return res.status(401).json({ message: "Invalid token" });

    req.user = {
      id: String(user._id),
      role: user.role,
      cafeId: user.cafeId ? String(user.cafeId) : null,
      email: user.email || null,
      username: user.username || null,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized", error: error.message });
  }
};

exports.requireRole = (roles) => (req, res, next) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
};
