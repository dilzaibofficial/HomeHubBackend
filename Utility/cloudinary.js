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

module.exports = { uploadOnCloudinary };

