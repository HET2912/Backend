const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ── Avatar ────────────────────────────────────────────────────────────────────

const uploadSingleAvatar = upload.single("avatar");

const uploadAvatarToCloudinary = async (req, res, next) => {
  try {
    if (req.body.avatarUrl) {
      req.uploadedAvatarUrl = req.body.avatarUrl;
      return next();
    }

    if (!req.file) {
      const error = new Error("Avatar file is required (field name: avatar)");
      error.statusCode = 400;
      return next(error);
    }

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: process.env.CLOUDINARY_AVATAR_FOLDER || "finx/avatars" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    req.uploadedAvatarUrl = uploadResult.secure_url;
    return next();
  } catch (err) {
    err.statusCode = err.statusCode || 400;
    return next(err);
  }
};

// ── Transaction attachment ────────────────────────────────────────────────────

/** Multer middleware – expects the field name "attachment" */
const uploadSingleAttachment = upload.single("attachment");

/**
 * Uploads req.file (if present) to Cloudinary and stores the secure URL at
 * req.uploadedAttachmentUrl.  If no file is sent the middleware is a no-op so
 * the route stays optional.
 */
const uploadAttachmentToCloudinary = async (req, res, next) => {
  try {
    // No file sent – that's fine, attachment is optional
    if (!req.file) return next();

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: process.env.CLOUDINARY_ATTACHMENT_FOLDER || "finx/attachments",
          resource_type: "auto", // allows images AND PDFs
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    req.uploadedAttachmentUrl = uploadResult.secure_url;
    return next();
  } catch (err) {
    err.statusCode = err.statusCode || 400;
    return next(err);
  }
};

module.exports = {
  uploadSingleAvatar,
  uploadAvatarToCloudinary,
  uploadSingleAttachment,
  uploadAttachmentToCloudinary,
};