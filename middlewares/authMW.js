module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.SECRET);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = decoded;

    console.log("Authenticated user:", decoded);

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};

