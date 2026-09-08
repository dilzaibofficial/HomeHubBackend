const multer = require("multer");

// Dedicated multer instance for the verification video upload - deliberately
// separate from the inline configs in routes/property.js and routes/user.js
// (and from the unused middleware/multer.middleware.js) rather than reusing
// any of them, since this is the first upload in the app that (a) is a
// video, not an image, and (b) genuinely needs a size/type limit - adding
// that to one of the existing shared configs risked changing behavior for
// unrelated existing upload routes.
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "/tmp");
  },
  filename: function (req, file, cb) {
    cb(null, "verification-" + Date.now() + "-" + Math.round(Math.random() * 1e9));
  },
});

const videoUpload = multer({
  storage,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150MB
  },
  fileFilter: function (req, file, cb) {
    if (!file.mimetype || !file.mimetype.startsWith("video/")) {
      return cb(new Error("Only video files are allowed"));
    }
    cb(null, true);
  },
});

module.exports = { videoUpload };
