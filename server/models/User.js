const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        trim: true,
        lowercase: true,
        unique: true,
        sparse: true,
    },
    username: {
        type: String,
        trim: true,
        unique: true,
        sparse: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['super_admin', 'cafe_admin', 'kitchen', 'staff'],
        required: true,
    }
    ,
    cafeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cafe',
        default: null,
        index: true,
    },
});

userSchema.pre('validate', function (next) {
    if (!this.email && !this.username) {
        return next(new Error('Either email or username is required'));
    }
    if (this.role !== 'super_admin' && !this.cafeId) {
        return next(new Error('cafeId is required for non-super_admin users'));
    }
    next();
});

// password hashing
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

userSchema.methods.comparePassword = function (enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
  };

module.exports = mongoose.model('User', userSchema);
