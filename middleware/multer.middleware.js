const multer = require("multer");
const storage = multer.diskStorage({

  destination: function (req, file, cb) {
    cb(null, "/tmp");
    console.log("abc");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
  
});
const upload = multer({ storage: storage });

module.exports = { upload };