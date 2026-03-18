const User = require('../models/User');
const bcrypt = require('bcrypt');
const OtpToken = require('../models/OtpToken');
let jwt = null;
try {
    // Optional during local setup; required for login/token issuance.
    // eslint-disable-next-line global-require
    jwt = require('jsonwebtoken');
} catch (error) {
    jwt = null;
}

const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS || 300); // 5 min
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

const isLikelyE164Phone = (phone) => typeof phone === 'string' && /^\+\d{10,15}$/.test(phone);
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

exports.registerUser = async (req, res) => {
    try {
        const { username, password, role } = req.body;

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Create new user
        const newUser = new User({ username, password, role });
        await newUser.save();

        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};
  

exports.loginUser = async (req, res) => {
    try {
        const { email, username, password } = req.body;

        // Find user by email (preferred) or username
        const query = email ? { email: String(email).toLowerCase() } : { username };
        const user = await User.findOne(query);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if password matches
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!jwt) {
            return res.status(500).json({
                message: 'Auth is not available because `jsonwebtoken` is not installed. Run `npm install` in the server folder.',
            });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({ message: 'JWT_SECRET is not set on the server' });
        }

        const token = jwt.sign(
            { role: user.role, cafeId: user.cafeId ? String(user.cafeId) : null },
            secret,
            { subject: String(user._id), expiresIn: '7d' }
        );

        // Return token + user info
        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: String(user._id),
                email: user.email || null,
                username: user.username || null,
                role: user.role,
                cafeId: user.cafeId ? String(user.cafeId) : null,
            },
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};
  ;

// Phone OTP (MongoDB-backed). In development we return the OTP for convenience.
exports.requestOtp = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!isLikelyE164Phone(phone)) {
            return res.status(400).json({ message: 'Invalid phone. Use E.164 format like +919876543210' });
        }

        const otp = generateOtp();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

        await OtpToken.findOneAndUpdate(
            { phone },
            { otpHash, expiresAt, attempts: 0 },
            { upsert: true, new: true }
        );

        // TODO: Integrate an SMS provider (Twilio, MSG91, etc.) here.
        // For local development: log OTP and also return it in response.
        console.log(`[OTP] ${phone} -> ${otp} (expires in ${OTP_TTL_SECONDS}s)`);

        const response = { message: 'OTP generated' };
        if (process.env.NODE_ENV !== 'production') {
            response.otp = otp;
            response.expiresInSeconds = OTP_TTL_SECONDS;
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!isLikelyE164Phone(phone)) {
            return res.status(400).json({ message: 'Invalid phone. Use E.164 format like +919876543210' });
        }
        if (typeof otp !== 'string' || !/^\d{4,8}$/.test(otp)) {
            return res.status(400).json({ message: 'Invalid OTP format' });
        }

        const token = await OtpToken.findOne({ phone });
        if (!token) {
            return res.status(400).json({ message: 'OTP not found. Please request a new OTP.' });
        }

        if (token.expiresAt.getTime() <= Date.now()) {
            await OtpToken.deleteOne({ phone });
            return res.status(400).json({ message: 'OTP expired. Please request a new OTP.' });
        }

        if (token.attempts >= OTP_MAX_ATTEMPTS) {
            return res.status(429).json({ message: 'Too many attempts. Please request a new OTP.' });
        }

        const isMatch = await bcrypt.compare(otp, token.otpHash);
        if (!isMatch) {
            await OtpToken.updateOne({ phone }, { $inc: { attempts: 1 } });
            return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
        }

        await OtpToken.deleteOne({ phone });
        return res.status(200).json({ message: 'OTP verified' });
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};
