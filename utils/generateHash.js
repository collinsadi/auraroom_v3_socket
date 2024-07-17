const crypto = require("crypto");

const generateUniqueHash = (length) => {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
};

module.exports = generateUniqueHash;
