// ============================================
// UPLOAD PATH HELPERS
// ============================================
// Centralizes upload subdirs and safe path checks so menu vs branch
// assets never overlap or delete each other's files.
// ============================================

const path = require('path');
const fs = require('fs').promises;

const UPLOAD_ROOT = path.join(__dirname, '../public/uploads');

/** Disk + URL subfolders under /uploads — keep menu and branches separate. */
const SUBDIRS = Object.freeze({
	MENU: 'menu',
	BRANCHES: 'branches',
});

/** Multipart field names — must match frontend FormData keys and route .single() */
const FIELDS = Object.freeze({
	MENU_IMG: 'MENU_IMG',
	BRANCH_LOGO: 'BRANCH_LOGO',
});

function publicUrl(subdir, filename) {
	return `/uploads/${subdir}/${filename}`;
}

function isPathInSubdir(relativePath, subdir) {
	if (!relativePath || typeof relativePath !== 'string') return false;
	const normalized = relativePath.replace(/^\/+/, '');
	return normalized.startsWith(`uploads/${subdir}/`);
}

function absolutePathFromPublic(relativePath, subdir) {
	if (!isPathInSubdir(relativePath, subdir)) return null;
	const normalized = relativePath.replace(/^\/+/, '');
	return path.join(__dirname, '../public', normalized);
}

async function safeDeletePublicFile(relativePath, subdir) {
	const absolute = absolutePathFromPublic(relativePath, subdir);
	if (!absolute) return;
	try {
		await fs.unlink(absolute);
	} catch {
		// ignore missing files
	}
}

module.exports = {
	UPLOAD_ROOT,
	SUBDIRS,
	FIELDS,
	publicUrl,
	isPathInSubdir,
	absolutePathFromPublic,
	safeDeletePublicFile,
};
