// MongoDB User Model (for documentation/reference)
// This mirrors the original Postgres users table fields

/**
 * User Schema (MongoDB, for reference)
 *
 * _id: ObjectId (MongoDB generated, replaces id)
 * name: String (required)
 * email: String (required, unique)
 * phone: String (required, unique)
 * password_hash: String (required)
 * created_at: Date (default: now)
 * reset_token: String (optional)
 */

const userSchema = {
  name: {
    type: 'string',
    required: true,
    maxLength: 100
  },
  email: {
    type: 'string',
    required: true,
    unique: true,
    maxLength: 255
  },
  phone: {
    type: 'string',
    required: true,
    unique: true,
    maxLength: 20
  },
  password_hash: {
    type: 'string',
    required: true,
    maxLength: 255
  },
  created_at: {
    type: 'date',
    default: () => new Date()
  },
  reset_token: {
    type: 'string',
    required: false
  }
};

// Note: This is a reference object for documentation and validation purposes.
// In MongoDB, you can use this as a guide for validation or with ODMs like Mongoose.

module.exports = userSchema;
