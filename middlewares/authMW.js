const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token missing or malformed" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.SECRET);

    if (!decoded || !(decoded._id || decoded.id)) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    req.user = {
      _id: decoded._id || decoded.id,
      role: decoded.role,
      tenantId: decoded.tenantId,
    };

    console.log("Authenticated user:", req.user);
    next();
  } catch (err) {
    console.error("JWT Auth Middleware Error:", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired. Please login again." });
    }

    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token. Please login again." });
    }

    return res.status(500).json({ message: "Internal server error during authentication" });
  }
};
