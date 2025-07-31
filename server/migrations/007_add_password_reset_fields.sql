-- Add password reset fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP WITH TIME ZONE;

-- Create index for reset token lookups
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

-- Add comment for documentation
COMMENT ON COLUMN users.reset_token IS 'Token for password reset functionality';
COMMENT ON COLUMN users.reset_token_expires IS 'Expiration timestamp for password reset token'; 