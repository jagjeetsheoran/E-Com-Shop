import jwt from 'jsonwebtoken';
import User from '../DB-Models/user.model.js';

export default async function _2faMiddleware(req, res, next) {
  const token = req.cookies._2faCookie || '';
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
}