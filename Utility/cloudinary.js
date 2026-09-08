const cloudinary = require('cloudinary').v2;
const fs = require('fs');


          
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET,  
});


const uploadOnCloudinary = async(localFilePath, resourceType = "auto") => {
try {
    if(!localFilePath){
        return null
    }
    //upload the file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath ,{
        // Cloudinary now blocks direct delivery of PDFs (and other non-image
        // documents) uploaded under "image"/"auto" resource type by default,
        // as an anti-XSS measure - it 401s with "deny or ACL failure" on
        // download. "raw" serves the file as-is with no such restriction.
        resource_type : resourceType
    })
    // file has been successfull uploaded

    // Android blocks cleartext (http://) network traffic by default, which
    // silently fails to load images - always use the https:// URL.
    return response.secure_url;
} catch (error) {
    fs.unlinkSync(localFilePath) // remove the locally saved temporary file as the upload operation got failed
     return null
}
}

// Video variant of uploadOnCloudinary above - kept as a separate function
// (rather than adding options to the existing one) so that function's
// behavior for every existing image/PDF caller stays byte-for-byte
// unchanged. Returns both the URL (to show the video) and the public_id
// (needed later to delete it via deleteFromCloudinary).
const uploadVideoOnCloudinary = async (localFilePath) => {
  if (!localFilePath) return null;
  try {
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "video",
    });
    return { secureUrl: response.secure_url, publicId: response.public_id };
  } catch (error) {
    console.error("Error uploading video to Cloudinary:", error);
    return null;
  } finally {
    // Unlike the image-upload path above, always clean up (success or
    // failure) - videos are large enough that leaving them in /tmp across
    // many verification attempts is a real disk-usage risk on a
    // long-running server, not just a cosmetic leak.
    try {
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    } catch (cleanupError) {
      console.error("Error cleaning up local video file:", cleanupError);
    }
  }
};

// Uploads an in-memory JPEG (base64, no data-URI prefix) - used for the
// small representative video frames the verification service returns, so
// they never need to touch disk on this server.
const uploadImageBufferOnCloudinary = async (base64Jpeg, folder) => {
  if (!base64Jpeg) return null;
  try {
    const response = await cloudinary.uploader.upload(`data:image/jpeg;base64,${base64Jpeg}`, {
      resource_type: "image",
      folder,
    });
    return { secureUrl: response.secure_url, publicId: response.public_id };
  } catch (error) {
    console.error("Error uploading image buffer to Cloudinary:", error);
    return null;
  }
};

const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  if (!publicId) return false;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return true;
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    return false;
  }
};

module.exports = {
  uploadOnCloudinary,
  uploadVideoOnCloudinary,
  uploadImageBufferOnCloudinary,
  deleteFromCloudinary,
};

