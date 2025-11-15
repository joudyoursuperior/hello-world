export default () => ({
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
  invites: {
    expiryHours: parseInt(process.env.INVITE_EXPIRY_HOURS || '72', 10),
  },
});
