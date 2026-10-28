const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
function assertPublicRelease({ env = process.env, review, lockHash, lock, version } = {}) {
  if (
    !version ||
    review?.version !== version ||
    lock?.version !== version ||
    lock?.packages?.['']?.version !== version ||
    (env.GITHUB_REF_TYPE === 'tag' && env.GITHUB_REF_NAME !== `v${version}`)
  )
    throw Error('Public release blocked: version, tag, lock and release decision must match.');
  if (env.SIGNING === 'true' && !env.UPDATER_PUBLISHER?.trim())
    throw Error('Public release blocked: configure the verified updater publisher when signing.');
  if (env.SIGNING !== 'true' && review?.signing !== 'unsigned-owner-authorized')
    throw Error('Public release blocked: record the owner-authorized unsigned release.');
  if (
    review?.status !== 'technical-review-complete' ||
    !review.reviewedBy ||
    !review.reviewedAt ||
    !review.evidence ||
    !Array.isArray(review.openItems) ||
    review.openItems.length ||
    review.packageLockSha256 !== lockHash
  )
    throw Error('Public release blocked: complete the technical dependency review for this exact lock.');
  if (!lock?.packages) throw Error('Public release blocked: dependency lock is required.');
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location || entry.dev) continue;
    if (
      /(?:^|\/)(?:kokoro-js|phonemizer|sharp|@img|onnxruntime-node|@huggingface)(?:\/|$)/.test(location) ||
      /GPL/i.test(entry.license || '')
    )
      throw Error('Public release blocked: removed or copyleft dependency requires renewed review: ' + location);
  }
}
module.exports = { assertPublicRelease };
if (require.main === module && process.env.GITHUB_REF_TYPE === 'tag') {
  try {
    const root = path.resolve(__dirname, '..');
    assertPublicRelease({
      version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
      review: JSON.parse(fs.readFileSync(path.join(root, 'legal', 'release-review.json'))),
      lockHash: createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'package-lock.json')))
        .digest('hex'),
      lock: JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'))),
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
