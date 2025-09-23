
// MongoDB Reminder Model (for documentation/reference)
// This mirrors the original Postgres reminders table fields

/**
 * Reminder Schema (MongoDB, for reference)
 *
 * _id: ObjectId (MongoDB generated, replaces id)
 * title: String (required)
 * description: String (optional)
 * remind_at: Date (required)
 * created_at: Date (default: now)
 * user_id: ObjectId (references users._id, optional)
 * triggered: Boolean (default: false)
 */

const reminderSchema = {
	title: {
		type: 'string',
		required: true,
		maxLength: 255
	},
	description: {
		type: 'string',
		required: false
	},
	remind_at: {
		type: 'date',
		required: true
	},
	created_at: {
		type: 'date',
		default: () => new Date()
	},
	user_id: {
		type: 'objectId', // Reference to users._id
		required: false
	},
	triggered: {
		type: 'boolean',
		default: false
	}
};

// Note: This is a reference object for documentation and validation purposes.
// In MongoDB, you can use this as a guide for validation or with ODMs like Mongoose.

module.exports = reminderSchema;
