// ============================================
// UPLOAD MIDDLEWARE
// ============================================
// File: middleware/upload.js
// Description: Multer configuration for file uploads with automatic WebP conversion
// ============================================

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/menu');
if (!require('fs').existsSync(uploadDir)) {
	require('fs').mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, uploadDir);
	},
	filename: function (req, file, cb) {
		// Generate unique filename: timestamp-random-originalname
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
		const ext = path.extname(file.originalname);
		const name = path.basename(file.originalname, ext);
		cb(null, name + '-' + uniqueSuffix + ext);
	}
});

// File filter - only images
const fileFilter = (req, file, cb) => {
	// Accept only image files
	if (file.mimetype.startsWith('image/')) {
		cb(null, true);
	} else {
		cb(new Error('Only image files are allowed!'), false);
	}
};

// Configure multer
const upload = multer({
	storage: storage,
	limits: {
		fileSize: 5 * 1024 * 1024 // 5MB limit
	},
	fileFilter: fileFilter
});

// Middleware to convert uploaded images to WebP
async function convertToWebp(req, res, next) {
	if (!req.file) {
		return next();
	}

	try {
		const originalPath = req.file.path;
		const ext = path.extname(req.file.filename).toLowerCase();
		
		// Skip conversion if already WebP
		if (ext === '.webp') {
			return next();
		}

		// Convert to WebP
		const webpFilename = req.file.filename.replace(new RegExp(ext + '$', 'i'), '.webp');
		const webpPath = path.join(uploadDir, webpFilename);

		await sharp(originalPath)
			.webp({ quality: 85 })
			.toFile(webpPath);

		// Delete original file
		await fs.unlink(originalPath);

		// Update req.file to reflect WebP filename
		req.file.filename = webpFilename;
		req.file.path = webpPath;

		next();
	} catch (error) {
		console.error('Error converting image to WebP:', error);
		// If conversion fails, continue with original file
		next();
	}
}

// Export multer upload and WebP conversion middleware
module.exports = {
	upload,
	convertToWebp
};

